import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url, key, { auth: { persistSession: true, detectSessionInUrl: true } }) : null;
// Client séparé, sans session enregistrée : sert à envoyer une invitation sans déconnecter le gérant.
export const inviteClient = configured ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'altiora-invite' } }) : null;
