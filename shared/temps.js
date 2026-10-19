// Suivi du temps : périodes (table temps) et bilan d'un déplacement.
// Un seul chrono à la fois : en lancer un arrête le précédent. Les temps communs (trajet, préparation…)
// sont répartis à l'affichage à parts égales entre les biens du déplacement ; le détail brut est conservé.

import { uuid } from './schema.js';

export const ACTIVITES = {
  trajet: { nom: 'Trajet', icone: '🚗' },
  preparation: { nom: 'Préparation', icone: '📦' },
  achats: { nom: 'Achats', icone: '🛒' },
  rangement: { nom: 'Rangement', icone: '🧹' },
  tache: { nom: 'Tâche', icone: '🔨' },
  etude: { nom: 'Plans, devis', icone: '📐' }, // préparation générale hors déplacement (plans, devis, commandes)
  planification: { nom: 'Planification', icone: '🗓️' },
};
export const ORDRE_ACTIVITES = ['trajet', 'preparation', 'achats', 'tache', 'rangement', 'etude', 'planification'];
export const CONTEXTES = { catalogue: 'Amélioration / catalogue', taches: 'Liste des tâches', plus: 'Réglages' };

export const enCours = (temps) => (temps || []).find((t) => !t.deleted && t.fin == null) ?? null;
export const duree = (t, maintenant = Date.now()) => Math.max(0, (t.fin ?? maintenant) - t.debut);

/** Écritures pour lancer un chrono (le chrono en cours, s'il y en a un, est arrêté au même instant). */
export function demarrer(activite, contexte, temps, maintenant = Date.now(), id = uuid()) {
  const writes = arreter(temps, maintenant);
  writes.push({
    table: 'temps',
    row: {
      id,
      activite,
      debut: maintenant,
      fin: null,
      voyage_id: contexte.voyage_id ?? null,
      intervention_id: contexte.intervention_id ?? null,
      tache_id: contexte.tache_id ?? null,
      appartement_id: contexte.appartement_id ?? null,
      contexte: contexte.contexte ?? null,
      note: null,
      deleted: false,
    },
  });
  return writes;
}

/** Écritures pour arrêter le chrono en cours (aucune s'il n'y en a pas). Une période de moins de 5 s est effacée. */
export function arreter(temps, maintenant = Date.now()) {
  const c = enCours(temps);
  if (!c) return [];
  if (maintenant - c.debut < 5000) return [{ table: 'temps', row: { id: c.id, fin: maintenant, deleted: true } }];
  return [{ table: 'temps', row: { id: c.id, fin: maintenant } }];
}

/** Même contexte ? (pour ne pas couper une période de planification quand rien ne change) */
export const memeContexte = (t, c) =>
  (t.voyage_id ?? null) === (c.voyage_id ?? null) && (t.intervention_id ?? null) === (c.intervention_id ?? null) && (t.tache_id ?? null) === (c.tache_id ?? null) && (t.contexte ?? null) === (c.contexte ?? null);

export function formatDuree(ms) {
  const min = Math.round(ms / 60000);
  const h = Math.floor(min / 60);
  return h ? `${h} h ${String(min % 60).padStart(2, '0')}` : `${min} min`;
}
export function chrono(ms) {
  const s = Math.floor(ms / 1000);
  const z = (n) => String(n).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${z(Math.floor((s % 3600) / 60))}:${z(s % 60)}`;
}

/**
 * Bilan d'un déplacement. interventions : celles du déplacement (avec leur bien).
 * Renvoie { total, parActivite: {act: ms}, parBien: [{ id, nom, ms, parActivite }], parTache: [{ tache, ms }], periodes }.
 */
export function bilan(voyageId, interventions, data, maintenant = Date.now()) {
  const idsInter = new Set(interventions.map((i) => i.id));
  const periodes = (data.temps || [])
    .filter((t) => !t.deleted && (t.voyage_id === voyageId || idsInter.has(t.intervention_id)))
    .sort((a, b) => a.debut - b.debut);
  const bienDeInter = new Map(interventions.map((i) => [i.id, i.appartement_id || '']));
  const biens = [...new Set(interventions.map((i) => i.appartement_id || ''))];
  const nomBien = (id) => data.appartements.find((a) => a.id === id)?.nom ?? 'Sans bien';
  const parActivite = {};
  const parBien = new Map(biens.map((b) => [b, { id: b, nom: nomBien(b), ms: 0, parActivite: {} }]));
  const parTache = new Map();
  let total = 0;
  for (const p of periodes) {
    const ms = duree(p, maintenant);
    total += ms;
    parActivite[p.activite] = (parActivite[p.activite] || 0) + ms;
    // Bien concerné : celui de la période, sinon de son intervention ; sinon réparti entre tous les biens.
    const tache = p.tache_id && data.taches.find((t) => t.id === p.tache_id);
    const bien = p.appartement_id ?? (p.intervention_id ? bienDeInter.get(p.intervention_id) : null) ?? (tache ? tache.appartement_id || '' : null);
    const cibles = bien != null && parBien.has(bien) ? [bien] : biens;
    for (const b of cibles) {
      const part = ms / (cibles.length || 1);
      const e = parBien.get(b);
      e.ms += part;
      e.parActivite[p.activite] = (e.parActivite[p.activite] || 0) + part;
    }
    if (tache) parTache.set(tache.id, { tache, ms: (parTache.get(tache.id)?.ms || 0) + ms });
  }
  return {
    total,
    parActivite,
    parBien: [...parBien.values()].sort((a, b) => b.ms - a.ms),
    parTache: [...parTache.values()].sort((a, b) => b.ms - a.ms),
    periodes,
  };
}
