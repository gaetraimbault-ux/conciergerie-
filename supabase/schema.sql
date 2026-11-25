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

-- Création automatique du profil à la première connexion
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
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

-- Sécurité : chaque table est fermée par défaut, puis ouverte règle par règle
alter table public.profiles enable row level security;
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;
alter table public.requests enable row level security;
alter table public.leads enable row level security;

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

-- Temps réel : les nouveaux messages s'affichent sans recharger
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.leads;
exception when duplicate_object then null; end $$;

-- 5. Donner le rôle gérant (à lancer après ta première connexion, avec ton adresse) :
-- update public.profiles set role = 'gerant' where email = 'ton-adresse@exemple.fr';
