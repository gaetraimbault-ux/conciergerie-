# Altiora Conciergerie

Site de la conciergerie (Embrun, Les Orres, Crévoux) avec espace client, compte gérant et messagerie en temps réel.
Nom de marque provisoire.

## Ce que fait l'application

- **Site vitrine** : voyageurs, propriétaires, territoire, formulaire de contact (les messages arrivent dans l'espace gérant).
- **Connexion** par lien envoyé par courriel, sans mot de passe. Le compte est créé à la première connexion.
- **Espace client** : messagerie avec la conciergerie, demandes de service et leur statut, séjour ou bien renseigné par le gérant.
- **Compte gérant** (un ou plusieurs) : boîte de réception commune avec non-lus par gérant, contacts du site, demandes (changement de statut), fiches clients et attribution du rôle gérant.

## Mise en route

### 1. Supabase (base de données et comptes)

1. Créer un projet gratuit sur https://supabase.com.
2. **SQL Editor > New query** : coller le contenu de `supabase/schema.sql`, puis **Run**.
3. **Authentication > URL Configuration** : mettre l'adresse du site en ligne dans *Site URL* et l'ajouter dans *Redirect URLs* (ajouter aussi `http://localhost:5173` pour tester en local).
4. Se connecter une première fois sur le site avec son adresse, puis dans **SQL Editor** :
   ```sql
   update public.profiles set role = 'gerant' where email = 'ton-adresse@exemple.fr';
   ```
   Les autres gérants se nomment ensuite depuis l'onglet **Clients** de l'espace gérant.

Le service d'envoi de courriels inclus dans Supabase est limité à quelques messages par heure. Pour l'ouverture au public, brancher un service SMTP (Brevo, Resend…) dans **Authentication > Emails > SMTP Settings**.

### 2. Hébergement (Netlify ou Vercel)

1. Importer ce dépôt GitHub.
2. Commande de build : `npm run build`, dossier publié : `dist`.
3. Variables d'environnement (Supabase > Project Settings > API) :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` : la clé publique (« publishable », qui commence par `sb_publishable_`, ou l’ancienne clé « anon »). Ne jamais utiliser la clé `service_role` ici.

### Tester en local

```bash
cp .env.example .env   # puis remplir les deux valeurs
npm install
npm run dev
```

## Sécurité

Chaque table est protégée par des règles Row Level Security (voir `supabase/schema.sql`) :
un client ne voit que sa conversation et ses demandes, ne peut pas se donner le rôle gérant ;
les visiteurs peuvent envoyer le formulaire de contact sans pouvoir lire les messages reçus ;
les gérants voient et traitent tout.
