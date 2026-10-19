// Suivi du temps côté appli : chrono en cours, contexte de l'écran affiché, planification et notification Android.
import { useEffect, useState } from 'react';
import { write } from './db.js';
import { arreter, demarrer, enCours, memeContexte, ACTIVITES } from '../shared/temps.js';
import { nomIntervention } from '../shared/voyages.js';
import { reglages } from './reglages.js';

// ---------- Contexte de l'écran (le plus précis l'emporte : tâche > intervention > déplacement > onglet) ----------
const contextes = new Map(); // id -> { niveau, ctx }
const abonnes = new Set();
let suivant = 0;
export function contexteEcran() {
  let meilleur = null;
  for (const c of contextes.values()) if (!meilleur || c.niveau >= meilleur.niveau) meilleur = c;
  return meilleur?.ctx ?? {};
}
const prevenir = () => abonnes.forEach((f) => f(contexteEcran()));

/** Déclare le contexte de l'écran affiché tant que le composant est monté. niveau : 0 onglet, 1 déplacement, 2 intervention, 3 tâche. */
export function useContexteEcran(niveau, ctx) {
  const cle = JSON.stringify(ctx);
  useEffect(() => {
    const id = ++suivant;
    contextes.set(id, { niveau, ctx: JSON.parse(cle) });
    prevenir();
    return () => {
      contextes.delete(id);
      prevenir();
    };
  }, [niveau, cle]);
}
export function useContexteActuel() {
  const [c, setC] = useState(contexteEcran);
  useEffect(() => {
    abonnes.add(setC);
    return () => abonnes.delete(setC);
  }, []);
  return c;
}

/** Activité proposée par l'écran (mode « automatique selon l'écran ») : préparation dans À prendre / Charger, etc. */
export const activiteEcran = (ctx) => (ctx.ecran === 'prendre' || ctx.ecran === 'charger' ? 'preparation' : ctx.ecran === 'acheter' ? 'achats' : 'planification');
const sansEcran = ({ ecran: _e, ...c }) => c;

// ---------- Commandes ----------
const CLE_PAUSE = 'chrono-pause'; // dernier chrono mis en pause (pour le reprendre d'un toucher)
const CLE_REPRISE = 'chrono-reprise'; // planification arrêtée parce que l'appli a été cachée
const lireLS = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null');
  } catch {
    return null;
  }
};
const ecrireLS = (k, v) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* rien */
  }
};
export const enPause = () => lireLS(CLE_PAUSE);
export const aReprendre = () => lireLS(CLE_REPRISE);
export const oublierReprise = () => ecrireLS(CLE_REPRISE, null);

export async function lancer(activite, ctx, data) {
  ecrireLS(CLE_PAUSE, null);
  ecrireLS(CLE_REPRISE, null);
  await write(demarrer(activite, sansEcran(ctx), data.temps));
  notifier(activite, ctx, data);
}
export async function pause(data) {
  const c = enCours(data.temps);
  if (!c) return;
  ecrireLS(CLE_PAUSE, { activite: c.activite, ctx: champsContexte(c) });
  await write(arreter(data.temps));
  fermerNotification();
}
export async function stop(data) {
  ecrireLS(CLE_PAUSE, null);
  await write(arreter(data.temps));
  fermerNotification();
}
export const reprendre = (p, data) => lancer(p.activite, p.ctx, data);
export const oublierPause = () => ecrireLS(CLE_PAUSE, null);
/** Corrige l'heure de fin du chrono en cours (oubli d'arrêter). */
export const terminerA = (data, fin) => write(arreter(data.temps, fin));

const champsContexte = (t) => ({ voyage_id: t.voyage_id, intervention_id: t.intervention_id, tache_id: t.tache_id, appartement_id: t.appartement_id, contexte: t.contexte });

/** Ce que concerne une période : la tâche, sinon l'intervention, le déplacement ou l'écran. */
export function libelleContexte(t, data) {
  const tache = t.tache_id && data.taches.find((x) => x.id === t.tache_id);
  if (tache) return tache.titre;
  const inter = t.intervention_id && data.deplacements.find((x) => x.id === t.intervention_id);
  if (inter) return nomIntervention(inter, data);
  const voyage = t.voyage_id && ((data.voyages || []).find((x) => x.id === t.voyage_id) ?? data.deplacements.find((x) => x.id === t.voyage_id));
  if (voyage) return voyage.nom;
  return { catalogue: 'Catalogue', taches: 'Liste des tâches', plus: 'Réglages', deplacements: 'Déplacements', interventions: 'Interventions' }[t.contexte] ?? '';
}

// ---------- Planification et mode automatique : suivre l'écran affiché, s'arrêter quand l'appli est cachée ----------
/** À appeler quand le contexte de l'écran change (et à l'affichage de l'appli). */
export async function suivreEcran(ctx, data) {
  const c = enCours(data.temps);
  const mode = reglages().chronoDemarrage;
  if (mode === 'auto') {
    if (document.visibilityState !== 'visible') return;
    const act = activiteEcran(ctx);
    if (!c || c.activite !== act || !memeContexte(c, sansEcran(ctx))) await write(demarrer(act, sansEcran(ctx), data.temps));
    return;
  }
  if (c?.activite === 'planification' && !memeContexte(c, sansEcran(ctx))) await write(demarrer('planification', sansEcran(ctx), data.temps));
}

/** L'appli est cachée : la planification (ou tout, en mode automatique) s'arrête. */
export async function appliCachee(data) {
  const c = enCours(data.temps);
  if (!c) return;
  if (c.activite === 'planification' || reglages().chronoDemarrage === 'auto') {
    if (reglages().chronoDemarrage !== 'auto') ecrireLS(CLE_REPRISE, { activite: c.activite, ctx: champsContexte(c) });
    await write(arreter(data.temps));
    fermerNotification();
  }
}

// ---------- Notification (Android ; sur iPhone, une appli web ne peut pas afficher de chrono à l'écran verrouillé) ----------
export const notificationsPossibles = () => typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
export async function activerNotifications() {
  if (!notificationsPossibles()) return 'impossible';
  return Notification.requestPermission();
}
async function notifier(activite, ctx, data) {
  try {
    if (!notificationsPossibles() || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    const a = ACTIVITES[activite];
    const heure = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    await reg.showNotification(`⏱ ${a.icone} ${a.nom}`, {
      body: `Depuis ${heure}${libelleContexte(ctx, data) ? ` · ${libelleContexte(ctx, data)}` : ''}`,
      tag: 'chrono',
      renotify: false,
      silent: true,
      requireInteraction: true,
      actions: [
        { action: 'pause', title: '⏸ Pause' },
        { action: 'stop', title: '⏹ Stop' },
      ],
    });
  } catch {
    /* notification facultative */
  }
}
async function fermerNotification() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    for (const n of (await reg?.getNotifications({ tag: 'chrono' })) ?? []) n.close();
  } catch {
    /* rien */
  }
}

/** Durée qui s'actualise chaque seconde. */
export function useMaintenant(actif = true) {
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    if (!actif) return;
    const i = setInterval(() => setT(Date.now()), 1000);
    return () => clearInterval(i);
  }, [actif]);
  return t;
}
