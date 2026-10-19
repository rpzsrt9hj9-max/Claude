// Estimations à partir du temps déjà passé (table temps) :
// - une tâche : médiane et moyenne du temps « Tâche » des tâches terminées de même origine
//   (même tâche type, sinon même nom) ;
// - le trajet : par bien, médiane du trajet total (non divisé) des déplacements passés qui y allaient ;
//   un déplacement à plusieurs biens prend le trajet le plus long d'entre eux.

import { nameKey } from './match.js';
import { duree } from './temps.js';

const vivantes = (data) => (data.temps || []).filter((t) => !t.deleted && t.fin != null);

export function mediane(valeurs) {
  if (!valeurs.length) return null;
  const v = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
const moyenne = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
const stats = (v) => (v.length ? { mediane: mediane(v), moyenne: moyenne(v), n: v.length } : null);

/** Temps « Tâche » passé sur une tâche (option : seulement dans une intervention). */
export function tempsTache(tacheId, data, interventionId = null) {
  return vivantes(data)
    .filter((t) => t.activite === 'tache' && t.tache_id === tacheId && (!interventionId || t.intervention_id === interventionId))
    .reduce((s, t) => s + duree(t), 0);
}

/** Famille d'une tâche pour comparer : sa tâche type d'origine, sinon son nom. */
const famille = (t) => (t.modele_id ? `m:${t.modele_id}` : `n:${nameKey(t.titre)}`);
const familleModele = (m) => `m:${m.id}`;

/** Index des temps passés : famille -> durées des tâches terminées. */
export function indexTaches(data) {
  const parTache = new Map();
  for (const t of vivantes(data)) if (t.activite === 'tache' && t.tache_id) parTache.set(t.tache_id, (parTache.get(t.tache_id) || 0) + duree(t));
  const index = new Map();
  for (const [id, ms] of parTache) {
    const tache = data.taches.find((x) => x.id === id && !x.modele);
    if (!tache || tache.statut !== 'terminee' || ms < 60_000) continue;
    for (const f of new Set([famille(tache), `n:${nameKey(tache.titre)}`])) {
      if (!index.has(f)) index.set(f, []);
      index.get(f).push(ms);
    }
  }
  return index;
}

/** Estimation pour une tâche ou une tâche type : { mediane, moyenne, n } ou null. */
export function estimerTache(tache, data, index = indexTaches(data)) {
  const cles = tache.modele ? [familleModele(tache), `n:${nameKey(tache.titre)}`] : [famille(tache), `n:${nameKey(tache.titre)}`];
  for (const c of cles) {
    const v = index.get(c);
    if (v?.length) return stats(v);
  }
  return null;
}

/** Trajet par bien : bien -> { mediane, moyenne, n } (trajet total des déplacements passés, non divisé). */
export function indexTrajets(data) {
  const parVoyage = new Map();
  for (const t of vivantes(data)) if (t.activite === 'trajet' && t.voyage_id) parVoyage.set(t.voyage_id, (parVoyage.get(t.voyage_id) || 0) + duree(t));
  const parBien = new Map();
  for (const [voyageId, ms] of parVoyage) {
    const biens = new Set(data.deplacements.filter((d) => (d.voyage_id || d.id) === voyageId && d.appartement_id).map((d) => d.appartement_id));
    for (const b of biens) {
      if (!parBien.has(b)) parBien.set(b, []);
      parBien.get(b).push(ms);
    }
  }
  return new Map([...parBien].map(([b, v]) => [b, stats(v)]));
}

/**
 * Estimation d'un déplacement : sur place (somme des estimations des tâches non terminées), trajet (le plus long des biens).
 * Renvoie { surPlace, trajet, sansEstimation: [tâches], total }.
 */
export function estimerDeplacement(taches, biens, data) {
  const index = indexTaches(data);
  let surPlace = 0;
  const sansEstimation = [];
  for (const t of taches) {
    if (t.statut === 'terminee' || t.statut === 'annulee') continue;
    const e = estimerTache(t, data, index);
    if (e) surPlace += e.mediane;
    else sansEstimation.push(t);
  }
  const trajets = indexTrajets(data);
  const trajet = Math.max(0, ...biens.map((b) => trajets.get(b)?.mediane ?? 0)) || null;
  return { surPlace, trajet, sansEstimation, total: surPlace + (trajet ?? 0) };
}
