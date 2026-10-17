// Fonctions qui parlent directement à Supabase (nécessitent le réseau) : prénom, retours,
// comptes, code famille. Les données de l'appli (tâches, matériel…) passent, elles, par la synchro.
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js';
import { VERSION } from './version.js';

const ok = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

export const majPrenom = (userId, nom) => supabase.from('profils').update({ nom: nom.trim() || null }).eq('id', userId).then(ok);

export const envoyerRetour = (texte, ecran) => supabase.from('retours').insert({ texte: texte.trim(), ecran: ecran || null, version: VERSION }).then(ok);

export const listerComptes = () => supabase.from('profils').select('id, nom, email, created_at').order('created_at').then(ok);

export const listerRetours = () =>
  supabase.from('retours').select('id, user_id, texte, ecran, version, created_at, lu').order('created_at', { ascending: false }).limit(100).then(ok);

export const marquerRetour = (id, lu) => supabase.from('retours').update({ lu }).eq('id', id).then(ok);

export async function compterRetoursNonLus() {
  const { count, error } = await supabase.from('retours').select('id', { count: 'exact', head: true }).eq('lu', false);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function lireCode() {
  const data = await supabase.from('reglages_app').select('valeur').eq('cle', 'code_famille').maybeSingle().then(ok);
  return data?.valeur ?? '';
}

export const changerCode = (valeur) => supabase.from('reglages_app').upsert({ cle: 'code_famille', valeur: valeur.trim().toUpperCase() }, { onConflict: 'cle' }).then(ok);

/** Réglages de Supabase qui conditionnent les inscriptions (publics). */
export async function etatInscriptions() {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } });
  if (!r.ok) throw new Error(`Erreur ${r.status}`);
  const d = await r.json();
  return { inscriptionsOuvertes: !d.disable_signup, confirmationEmail: !d.mailer_autoconfirm };
}

// ---------- Google Sheet du catalogue ----------
/** Crée (ou remplace) la clé de synchro du Sheet ; elle n'est renvoyée qu'une fois. */
export const creerCleSheet = () => supabase.rpc('creer_cle_sheet').then(ok);
export const revoquerCleSheet = () => supabase.rpc('revoquer_cle_sheet').then(ok);
/** { creee_le, utilisee_le } ou null s'il n'y a pas de clé. */
export const etatCleSheet = () => supabase.rpc('etat_cle_sheet').then(ok);
