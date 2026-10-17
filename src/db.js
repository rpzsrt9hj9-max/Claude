// Stockage local (IndexedDB) + file de synchronisation avec le serveur.
// Chaque modification est écrite localement tout de suite (marquée _dirty = 1),
// puis envoyée au serveur dès que le réseau le permet.
import Dexie from 'dexie';
import { TABLES, TABLE_NAMES, uuid } from '../shared/schema.js';
import { supabase, isConfigured, observation, memoriserObservation, oublierObservation } from './supabase.js';

// Chaque espace a sa propre base locale : celle du compte connecté, et une par compte observé
// (mode « Voir comme » de l'administrateur) pour ne jamais mélanger deux comptes.
export const db = new Dexie(observation ? `deplacements-obs-${observation.id}` : 'deplacements');
let monId = null;
/** Identifiant du compte dont on voit l'espace : le sien, ou celui du compte observé. */
export const espaceId = () => observation?.id ?? monId;
db.version(1).stores({
  lieux: 'id, _dirty',
  appartements: 'id, _dirty',
  articles: 'id, _dirty',
  deplacements: 'id, _dirty',
  taches: 'id, deplacement_id, _dirty',
  tache_articles: 'id, tache_id, article_id, _dirty',
  prise_articles: 'id, deplacement_id, article_id, _dirty',
  meta: 'key',
});
db.version(2).stores({
  categories: 'id, _dirty',
  article_accessoires: 'id, article_id, _dirty',
});
db.version(3).stores({
  intervention_taches: 'id, intervention_id, tache_id, _dirty',
  commentaires: 'id, tache_id, intervention_id, _dirty',
  photos: 'id, commentaire_id, _dirty',
  // Fichiers photo, locaux seulement (envoyés ensuite dans Supabase Storage)
  photo_fichiers: 'chemin, envoye',
});

db.version(4).stores({
  voyages: 'id, _dirty',
});
db.version(5).stores({
  stocks: 'id, article_id, _dirty',
});

export const BUCKET = 'photos';

/** Applique une liste d'écritures { table, row } en une transaction locale. */
export async function write(writes) {
  const list = Array.isArray(writes) ? writes : [writes];
  if (!list.length) return;
  const now = Date.now();
  const tables = [...new Set(list.map((w) => w.table))];
  await db.transaction('rw', tables.map((t) => db[t]), async () => {
    for (const { table, row } of list) {
      if (!TABLES[table]) throw new Error(`Table inconnue : ${table}`);
      const existing = await db[table].get(row.id);
      const base = existing ?? { created_at: now, deleted: false };
      await db[table].put({ ...base, ...row, updated_at: now, _dirty: 1 });
    }
  });
  scheduleSync();
}

export const insert = (table, row) => {
  const id = row.id ?? uuid();
  return write({ table, row: { ...row, id, deleted: false } }).then(() => id);
};
export const update = (table, id, patch) => write({ table, row: { id, ...patch } });
export const remove = (table, id) => write({ table, row: { id, deleted: true } });

// ---------- Synchronisation ----------

const listeners = new Set();
export const syncState = { status: 'idle', authed: null, user: null, pending: 0, lastSync: null, message: null };
function setState(patch) {
  Object.assign(syncState, patch);
  listeners.forEach((l) => l({ ...syncState }));
}
export function onSyncState(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let running = null;
let again = false;
let timer = null;

export function scheduleSync(delay = 400) {
  clearTimeout(timer);
  timer = setTimeout(() => sync(), delay);
}

async function countDirty() {
  let n = 0;
  for (const t of TABLE_NAMES) n += await db[t].where('_dirty').equals(1).count();
  return n;
}

const PAGE = 1000;
// Petite marge de recouvrement : une transaction lente peut valider une révision plus petite
// que la dernière déjà reçue ; on relit donc un peu en arrière (sans effet si rien n'a changé).
const OVERLAP = 200;

const toServer = (table, row, espace) => {
  const out = { id: row.id, owner_id: espace, created_at: row.created_at, updated_at: row.updated_at, deleted: !!row.deleted };
  for (const f of TABLES[table]) out[f] = row[f] ?? null;
  return out;
};

// Table ou colonne absente côté Supabase (script SQL de mise à jour pas encore exécuté)
const isSchemaError = (error) => ['PGRST205', 'PGRST204', '42P01', '42703'].includes(error?.code);

const isAuthError = (error) => error && (error.status === 401 || error.code === 'PGRST301' || /JWT/i.test(error.message || ''));

export async function sync() {
  if (running) {
    again = true;
    return running;
  }
  if (DEMO) return;
  running = (async () => {
    const pending = await countDirty();
    setState({ pending });
    if (!navigator.onLine) return setState({ status: 'offline' });
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return setState({ status: 'idle', authed: false });
    monId = sess.session.user.id;
    const espace = espaceId();
    setState({ status: 'syncing' });
    try {
      // 1. Envoi des modifications locales. Une table pas encore créée en base (mise à jour SQL
      // non faite) est mise de côté : ses lignes restent en attente, le reste se synchronise.
      const manquantes = new Set();
      for (const t of TABLE_NAMES) {
        const rows = await db[t].where('_dirty').equals(1).toArray();
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await supabase.from(t).upsert(rows.slice(i, i + 500).map((r) => toServer(t, r, espace)), { onConflict: 'id' });
          if (error && isSchemaError(error)) {
            manquantes.add(t);
            break;
          }
          if (error) throw error;
        }
      }
      // 2. Réception de tout ce qui a changé depuis la dernière synchro
      const since = (await db.meta.get('rev'))?.value ?? 0;
      let maxRev = since;
      const incoming = [];
      for (const t of TABLE_NAMES) {
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase.from(t).select('*').eq('owner_id', espace).gt('rev', Math.max(0, since - OVERLAP)).order('rev').range(from, from + PAGE - 1);
          if (error && isSchemaError(error)) {
            manquantes.add(t);
            break;
          }
          if (error) throw error;
          for (const row of data) {
            incoming.push({ table: t, row });
            maxRev = Math.max(maxRev, row.rev);
          }
          if (data.length < PAGE) break;
        }
      }
      await db.transaction('rw', [...TABLE_NAMES.map((t) => db[t]), db.meta], async () => {
        for (const { table, row } of incoming) {
          const { rev, ...clean } = row;
          const local = await db[table].get(row.id);
          // Dernière modification gagne : on garde une modification locale plus récente.
          if (local && local._dirty && local.updated_at > row.updated_at) continue;
          await db[table].put({ ...clean, _dirty: 0 });
        }
        // Si une table manque, on ne fait pas avancer la révision : tout sera relu après la mise à jour.
        if (!manquantes.size) await db.meta.put({ key: 'rev', value: maxRev });
        // Le serveur a-t-il déjà des données pour ce compte ? Sert à n'afficher l'écran de bienvenue qu'à un compte vraiment neuf.
        const connu = (await db.meta.get('espace'))?.value;
        if (incoming.length || since > 0) {
          if (connu !== 'rempli') await db.meta.put({ key: 'espace', value: 'rempli' });
        } else if (!connu && !manquantes.size) {
          await db.meta.put({ key: 'espace', value: 'vide' });
        }
      });
      const photoErreur = await envoyerPhotos();
      const schemaMessage = manquantes.size ? `Base à mettre à jour (${[...manquantes].join(', ')}) : exécute supabase/schema.sql dans Supabase.` : null;
      setState({ status: manquantes.size || photoErreur ? 'error' : 'ok', authed: true, lastSync: Date.now(), pending: await countDirty(), message: schemaMessage ?? photoErreur });
    } catch (e) {
      console.warn('Synchro impossible', e);
      if (isAuthError(e)) return setState({ status: 'idle', authed: false });
      const network = !navigator.onLine || e instanceof TypeError || /fetch/i.test(e?.message || '');
      setState({ status: network ? 'offline' : 'error', pending: await countDirty(), message: network ? null : e?.message });
    }
  })().finally(() => {
    running = null;
    if (again) {
      again = false;
      scheduleSync(100);
    }
  });
  return running;
}

export function startSyncLoop() {
  window.addEventListener('online', () => sync());
  window.addEventListener('offline', () => setState({ status: 'offline' }));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && sync());
  setInterval(() => sync(), 30_000);
}

// ---------- Connexion (Supabase Auth) ----------

const userOf = (session) => (session?.user ? { id: session.user.id, email: session.user.email } : null);

// Mode démo local (VITE_DEMO=1) : pas de connexion ni de synchro, pour tester l'interface.
export const DEMO = import.meta.env.VITE_DEMO === '1';
if (DEMO) Object.assign(window, { __db: db });

/** Messages d'erreur d'authentification, en français. */
export function traduireErreurAuth(error) {
  const m = error?.message || '';
  const c = error?.code || '';
  if (c === 'signup_disabled' || /signups? not allowed/i.test(m)) return 'Les inscriptions sont fermées pour le moment.';
  if (/Database error saving new user/i.test(m)) return 'Code famille incorrect.';
  if (c === 'user_already_exists' || /already registered/i.test(m)) return 'Un compte existe déjà avec cet e-mail. Connecte-toi.';
  if (c === 'weak_password' || /password should|at least \d+ characters/i.test(m)) return 'Mot de passe trop court (6 caractères minimum).';
  if (/rate.?limit/i.test(`${c} ${m}`)) return 'Trop de tentatives. Réessaie dans quelques minutes.';
  if (c === 'email_address_invalid' || /invalid.*email|email.*invalid/i.test(m)) return 'Adresse e-mail invalide.';
  if (c === 'email_not_confirmed' || /not confirmed/i.test(m)) return 'Adresse e-mail pas encore confirmée : ouvre le message reçu.';
  if (/invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
  return m || 'Une erreur est survenue.';
}

/** Prénom et statut d'administrateur du compte ; null si la base ne répond pas (hors ligne, pas à jour). */
async function profilDe(user) {
  if (DEMO || !navigator.onLine) return null;
  try {
    const [adm, prof] = await Promise.all([
      supabase.from('admins').select('user_id').eq('user_id', user.id).maybeSingle(),
      supabase.from('profils').select('nom').eq('id', user.id).maybeSingle(),
    ]);
    if (adm.error || prof.error) return null;
    return { admin: !!adm.data, nom: prof.data?.nom ?? null };
  } catch {
    return null;
  }
}

/** Met à jour l'état avec le profil, et sort du mode « Voir comme » si le compte n'est pas administrateur. */
async function completerProfil(user) {
  const profil = await profilDe(user);
  if (!profil) return user;
  const complet = { ...user, ...profil };
  if (observation && !profil.admin) {
    oublierObservation();
    location.reload();
    return complet;
  }
  if (!observation) await db.meta.put({ key: 'user', value: complet });
  setState({ user: complet });
  return complet;
}

/** Relit le prénom et le statut d'administrateur (après une modification du profil). */
export const actualiserProfil = () => (syncState.user?.id ? completerProfil(syncState.user) : null);

export async function checkSession() {
  if (DEMO) {
    monId = 'demo';
    return setState({ authed: true, user: { id: 'demo', email: 'demo', admin: true }, status: 'ok' });
  }
  if (!isConfigured) return setState({ authed: false });
  // La session est gardée sur l'appareil : on démarre même sans réseau, avec les données locales.
  const { data } = await supabase.auth.getSession();
  const base = userOf(data.session);
  const cache = (await db.meta.get('user'))?.value ?? null;
  if (data.session && base) {
    monId = base.id;
    setState({ authed: true, user: { ...(cache?.id === base.id ? cache : {}), ...base } });
    sync();
    completerProfil(base);
  } else {
    setState({ authed: false });
  }
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') setState({ authed: false, user: null });
    else if (session) {
      monId = session.user.id;
      setState({ authed: true, user: { ...syncState.user, ...userOf(session) } });
    }
  });
}

async function ouvrirSession(session) {
  const user = userOf(session);
  monId = user.id;
  const prev = (await db.meta.get('user'))?.value;
  if (!observation && prev && prev.email !== user.email) await wipeLocal();
  await db.meta.put({ key: 'user', value: user });
  setState({ authed: true, user });
  await completerProfil(user);
  await sync();
}

export async function login(email, password) {
  if (!isConfigured) throw new Error("L'appli n'est pas encore reliée à Supabase (src/supabase.js).");
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(traduireErreurAuth(error));
  await ouvrirSession(data.session);
}

/**
 * Création de compte avec le code famille (vérifié par la base).
 * Renvoie { confirmation: true } si Supabase demande de confirmer l'adresse e-mail.
 */
export async function signup({ nom, email, password, code }) {
  if (!isConfigured) throw new Error("L'appli n'est pas encore reliée à Supabase (src/supabase.js).");
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { nom: nom.trim(), code_famille: code.trim() } },
  });
  if (error) throw new Error(traduireErreurAuth(error));
  // Adresse déjà inscrite : Supabase répond sans erreur mais sans « identité » quand la confirmation est active.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error('Un compte existe déjà avec cet e-mail. Connecte-toi.');
  }
  if (!data.session) return { confirmation: true };
  await ouvrirSession(data.session);
  return { confirmation: false };
}

export async function logout() {
  if (observation) return quitterObservation();
  await sync();
  await supabase.auth.signOut().catch(() => {});
  await wipeLocal();
  await supprimerEspacesObserves();
  // Les écrans mémorisés (onglet, filtres…) appartiennent au compte qui part ; seul le thème est gardé.
  try {
    for (const k of Object.keys(localStorage)) if (k !== 'theme') localStorage.removeItem(k);
  } catch {
    /* rien */
  }
  setState({ authed: false, user: null });
}

/** Administrateur : ouvre l'espace d'un autre compte (l'appli se recharge). */
export function demarrerObservation(compte) {
  memoriserObservation(compte);
  ecranDeDepart();
  location.reload();
}

/** Ouvre l'onglet Tâches au prochain démarrage (changement d'espace : on repart du premier écran). */
function ecranDeDepart() {
  try {
    localStorage.setItem('onglet', JSON.stringify('taches'));
    for (const k of ['voyage-ouvert', 'intervention-ouverte', 'intervention-onglet']) localStorage.removeItem(k);
  } catch {
    /* rien */
  }
}

/** Revient à son propre espace ; la copie locale du compte observé est effacée. */
export async function quitterObservation() {
  await sync().catch(() => {});
  const reste = await countDirty();
  if (reste && !confirm(`${reste} modification(s) faites dans ce compte n'ont pas encore été envoyées. Quitter quand même ?`)) return;
  oublierObservation();
  ecranDeDepart();
  db.close();
  await Dexie.delete(db.name).catch(() => {});
  location.reload();
}

async function supprimerEspacesObserves() {
  oublierObservation();
  try {
    for (const nom of await Dexie.getDatabaseNames()) if (nom.startsWith('deplacements-obs-')) await Dexie.delete(nom);
  } catch {
    /* rien */
  }
}

async function wipeLocal() {
  await db.transaction('rw', [...TABLE_NAMES.map((t) => db[t]), db.meta, db.photo_fichiers], async () => {
    for (const t of TABLE_NAMES) await db[t].clear();
    await db.meta.clear();
    await db.photo_fichiers.clear();
  });
}

// ---------- Photos (fichiers dans Supabase Storage, copie locale dans IndexedDB) ----------

/** Réduit une photo (1600 px max, JPEG) avant de la stocker. */
export async function compresserPhoto(fichier, max = 1600) {
  try {
    const img = await createImageBitmap(fichier);
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * k);
    canvas.height = Math.round(img.height * k);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((ok) => canvas.toBlob((b) => ok(b || fichier), 'image/jpeg', 0.82));
  } catch {
    return fichier;
  }
}

/** Garde le fichier localement ; il partira vers Supabase Storage à la prochaine synchro. */
export async function stockerPhoto(chemin, blob) {
  await db.photo_fichiers.put({ chemin, blob, envoye: 0 });
  scheduleSync();
}

const urls = new Map();
/** URL affichable d'une photo : copie locale, sinon téléchargement (puis mise en cache). */
export async function urlPhoto(chemin) {
  if (urls.has(chemin)) return urls.get(chemin);
  let blob = (await db.photo_fichiers.get(chemin))?.blob;
  if (!blob && !DEMO && navigator.onLine) {
    const { data, error } = await supabase.storage.from(BUCKET).download(chemin);
    if (!error && data) {
      blob = data;
      await db.photo_fichiers.put({ chemin, blob, envoye: 1 });
    }
  }
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(chemin, url);
  return url;
}

export async function supprimerFichierPhoto(chemin) {
  await db.photo_fichiers.delete(chemin);
  if (!DEMO && navigator.onLine) await supabase.storage.from(BUCKET).remove([chemin]).catch(() => {});
}

/** Envoie les photos en attente ; renvoie un message d'erreur ou null. */
async function envoyerPhotos() {
  const enAttente = await db.photo_fichiers.where('envoye').equals(0).toArray();
  for (const p of enAttente) {
    const { error } = await supabase.storage.from(BUCKET).upload(p.chemin, p.blob, { upsert: true, contentType: p.blob.type || 'image/jpeg' });
    if (error) return `Envoi des photos impossible (${error.message}). Le bucket « ${BUCKET} » existe-t-il ?`;
    await db.photo_fichiers.update(p.chemin, { envoye: 1 });
  }
  return null;
}

export const photosEnAttente = () => db.photo_fichiers.where('envoye').equals(0).count();
