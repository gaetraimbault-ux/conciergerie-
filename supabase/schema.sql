-- Altiora Conciergerie : schéma de la base Supabase
-- À coller une seule fois dans Supabase > SQL Editor > New query, puis « Run ».

-- 1. Profils : un par compte (client ou gérant)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'client' check (role in ('client','gerant')),
  kind text check (kind in ('voyageur','proprietaire')),
  property text,            -- logement loué ou bien confié
  stay_from date,
  stay_to date,
  created_at timestamptz not null default now()
);

-- Champs remplis à l'inscription
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists place text;

-- Invitations envoyées par un gérant depuis son espace (le rôle prévu est appliqué à la création du compte)
create table if not exists public.invites (
  email text primary key check (email = lower(email)),
  role text not null default 'client' check (role in ('client','gerant')),
  full_name text,
  kind text check (kind in ('voyageur','proprietaire')),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Création automatique du profil à l'inscription (rôle « client », sauf invitation d'un gérant)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  k text := m->>'kind';
  d1 date; d2 date;
  inv public.invites%rowtype;
begin
  select * into inv from public.invites where email = lower(new.email);
  begin d1 := nullif(m->>'stay_from','')::date; exception when others then d1 := null; end;
  begin d2 := nullif(m->>'stay_to','')::date; exception when others then d2 := null; end;
  insert into public.profiles (id, email, full_name, role, phone, kind, place, property, stay_from, stay_to)
  values (
    new.id, new.email,
    left(coalesce(nullif(m->>'full_name',''), inv.full_name, split_part(new.email,'@',1)), 200),
    coalesce(inv.role, 'client'),
    left(nullif(m->>'phone',''), 40),
    coalesce(case when k in ('voyageur','proprietaire') then k end, inv.kind),
    left(nullif(m->>'place',''), 100),
    left(nullif(m->>'property',''), 200),
    d1, d2)
  on conflict (id) do nothing;
  delete from public.invites where email = lower(new.email);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Vrai si la personne connectée est gérante
create or replace function public.is_gerant() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'gerant');
$$;

-- 2. Messages : une conversation par client, partagée par tous les gérants
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists messages_client_idx on public.messages (client_id, created_at);

-- Dernière lecture de chaque conversation, par personne
create table if not exists public.message_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, client_id)
);

-- 3. Demandes de service
create table if not exists public.requests (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.profiles(id) on delete cascade,
  service text not null,
  wanted_on date,
  detail text,
  status text not null default 'nouvelle' check (status in ('nouvelle','confirmee','terminee','annulee')),
  created_at timestamptz not null default now()
);

-- 4. Messages du formulaire de contact du site (visiteurs sans compte)
create table if not exists public.leads (
  id bigint generated always as identity primary key,
  name text not null check (length(name) between 1 and 200),
  reach text not null check (length(reach) between 1 and 200),
  kind text,
  place text,
  dates text,
  body text check (length(body) <= 4000),
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

-- 5. Textes du site modifiés par les gérants (prix, coordonnées…) ; seuls les textes changés sont stockés
create table if not exists public.site_content (
  key text primary key check (length(key) between 1 and 80),
  html text not null check (length(html) <= 8000),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Sécurité : chaque table est fermée par défaut, puis ouverte règle par règle
alter table public.profiles enable row level security;
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;
alter table public.requests enable row level security;
alter table public.leads enable row level security;
alter table public.invites enable row level security;
alter table public.site_content enable row level security;

-- Profils : chacun voit le sien, les gérants voient et modifient tout
drop policy if exists "profil lu" on public.profiles;
create policy "profil lu" on public.profiles for select using (id = auth.uid() or public.is_gerant());
drop policy if exists "profil modifié par gérant" on public.profiles;
create policy "profil modifié par gérant" on public.profiles for update using (public.is_gerant());
-- Un client peut changer son nom, pas son rôle
drop policy if exists "client modifie son nom" on public.profiles;
create policy "client modifie son nom" on public.profiles for update using (id = auth.uid())
  with check (id = auth.uid() and (role = 'client' or public.is_gerant()));

-- Messages : le client voit et écrit dans sa conversation ; les gérants dans toutes
drop policy if exists "messages lus" on public.messages;
create policy "messages lus" on public.messages for select using (client_id = auth.uid() or public.is_gerant());
drop policy if exists "messages écrits" on public.messages;
create policy "messages écrits" on public.messages for insert with check (
  sender_id = auth.uid() and (client_id = auth.uid() or public.is_gerant()));

drop policy if exists "lectures perso" on public.message_reads;
create policy "lectures perso" on public.message_reads for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Demandes
drop policy if exists "demandes lues" on public.requests;
create policy "demandes lues" on public.requests for select using (client_id = auth.uid() or public.is_gerant());
drop policy if exists "demandes créées" on public.requests;
create policy "demandes créées" on public.requests for insert with check (client_id = auth.uid() or public.is_gerant());
drop policy if exists "demandes suivies" on public.requests;
create policy "demandes suivies" on public.requests for update using (public.is_gerant());

-- Formulaire de contact : tout le monde peut écrire, seuls les gérants lisent
drop policy if exists "contact envoyé" on public.leads;
create policy "contact envoyé" on public.leads for insert to anon, authenticated with check (true);
drop policy if exists "contact lu" on public.leads;
create policy "contact lu" on public.leads for select using (public.is_gerant());
drop policy if exists "contact traité" on public.leads;
create policy "contact traité" on public.leads for update using (public.is_gerant());

-- Invitations : réservées aux gérants
drop policy if exists "invitations gérants" on public.invites;
create policy "invitations gérants" on public.invites for all using (public.is_gerant()) with check (public.is_gerant());

-- Textes du site : lus par tout le monde, modifiés par les gérants
drop policy if exists "textes lus" on public.site_content;
create policy "textes lus" on public.site_content for select to anon, authenticated using (true);
drop policy if exists "textes modifiés" on public.site_content;
create policy "textes modifiés" on public.site_content for all to authenticated using (public.is_gerant()) with check (public.is_gerant());

-- Temps réel : les nouveaux messages s'affichent sans recharger
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.leads;
exception when duplicate_object then null; end $$;

-- Droits d'accès aux tables (les projets Supabase récents n'en donnent aucun par défaut ;
-- les règles RLS ci-dessus décident ensuite ligne par ligne)
grant usage on schema public to anon, authenticated;
grant insert on public.leads to anon;
grant select, update on public.profiles to authenticated;
grant select, insert on public.messages to authenticated;
grant select, insert, update on public.message_reads to authenticated;
grant select, insert, update on public.requests to authenticated;
grant select, insert, update on public.leads to authenticated;
grant select, insert, update, delete on public.invites to authenticated;
grant select on public.site_content to anon;
grant select, insert, update, delete on public.site_content to authenticated;
grant usage on all sequences in schema public to anon, authenticated;
grant execute on function public.is_gerant() to anon, authenticated;

-- 6. Donner le rôle gérant (à lancer après ta première connexion, avec ton adresse) :
-- update public.profiles set role = 'gerant' where email = 'ton-adresse@exemple.fr';
