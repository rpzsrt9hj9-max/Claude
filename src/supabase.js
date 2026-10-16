import { createClient } from '@supabase/supabase-js';

// Valeurs publiques du projet Supabase (Project Settings > API).
// La clé « anon / publishable » peut être publiée : ce sont les règles RLS
// de la base qui protègent les données (accès réservé aux comptes connectés).
export const SUPABASE_URL = 'https://fuaokqhgspgzzdklhvtn.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_lLUE3Ifwu_XBNh09BZryVw_uvfWNIKC';

export const isConfigured = !SUPABASE_URL.includes('VOTRE-PROJET') && !SUPABASE_ANON_KEY.includes('VOTRE-CLE');

export const supabase = createClient(isConfigured ? SUPABASE_URL : 'https://example.supabase.co', isConfigured ? SUPABASE_ANON_KEY : 'x', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'deplacements-auth' },
});
