import { createClient } from '@supabase/supabase-js';

// Valeurs publiques du projet Supabase (Project Settings > API).
// La clé « anon / publishable » peut être publiée : ce sont les règles RLS
// de la base qui protègent les données (chaque compte ne voit que son espace).
export const SUPABASE_URL = 'https://fuaokqhgspgzzdklhvtn.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_lLUE3Ifwu_XBNh09BZryVw_uvfWNIKC';

export const isConfigured = !SUPABASE_URL.includes('VOTRE-PROJET') && !SUPABASE_ANON_KEY.includes('VOTRE-CLE');

// Mode « Voir comme » (administrateur) : l'appli est rechargée avec le compte observé mémorisé.
// Toutes les requêtes portent alors l'en-tête « x-observe-user » ; la base ne l'honore que pour un administrateur.
const CLE_OBSERVATION = 'deplacements-observe';

function lireObservation() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_OBSERVATION));
    return v?.id ? v : null;
  } catch {
    return null;
  }
}

/** Compte observé { id, nom, email }, ou null en usage normal. */
export const observation = lireObservation();

export function memoriserObservation(compte) {
  localStorage.setItem(CLE_OBSERVATION, JSON.stringify({ id: compte.id, nom: compte.nom ?? null, email: compte.email ?? null }));
}
export function oublierObservation() {
  try {
    localStorage.removeItem(CLE_OBSERVATION);
  } catch {
    /* rien */
  }
}

export const supabase = createClient(isConfigured ? SUPABASE_URL : 'https://example.supabase.co', isConfigured ? SUPABASE_ANON_KEY : 'x', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'deplacements-auth' },
  global: observation ? { headers: { 'x-observe-user': observation.id } } : undefined,
});
