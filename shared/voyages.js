// Déplacements (table `voyages`) : un déplacement regroupe une intervention par bien.
// Le déplacement porte la grande liste de chargement (tout mutualisé) ;
// chaque intervention a sa liste « À sortir » et son propre rapport.
// Les anciennes interventions sans déplacement sont présentées comme un déplacement « virtuel »
// de même identifiant que l'intervention (les cases « Pris » restent ainsi valables). Il devient réel
// (ligne `voyages` de même id) dès qu'on lui ajoute un deuxième bien, ou par la migration SQL.

import { uuid } from './schema.js';
import { ajouterTaches, liens, tachesIntervention, interventionOuverte } from './interventions.js';

/** Déplacements réels + déplacements virtuels pour les interventions orphelines. */
export function listeVoyages(data) {
  const reels = data.voyages || [];
  const ids = new Set(reels.map((v) => v.id));
  const virtuels = data.deplacements
    .filter((d) => !d.voyage_id || !ids.has(d.voyage_id))
    .map((d) => ({ id: d.id, nom: d.nom, date_debut: d.date_debut, created_at: d.created_at, virtuel: true }));
  return [...reels, ...virtuels];
}

export function trouverVoyage(voyageId, data) {
  return listeVoyages(data).find((v) => v.id === voyageId) ?? null;
}

/** Interventions d'un déplacement, triées par nom de bien. */
export function interventionsDuVoyage(voyageId, data) {
  const appNom = (id) => data.appartements.find((a) => a.id === id)?.nom;
  const reels = new Set((data.voyages || []).map((v) => v.id));
  return data.deplacements
    .filter((d) => (d.voyage_id && reels.has(d.voyage_id) ? d.voyage_id === voyageId : d.id === voyageId))
    .sort((a, b) => {
      const na = appNom(a.appartement_id);
      const nb = appNom(b.appartement_id);
      if (!na || !nb) return na ? -1 : nb ? 1 : 0; // « Sans bien » à la fin
      return na.localeCompare(nb, 'fr');
    });
}

/** Toutes les tâches d'un déplacement (sans doublon). */
export function tachesVoyage(voyageId, data, tousLiens = liens(data)) {
  const vues = new Set();
  const out = [];
  for (const i of interventionsDuVoyage(voyageId, data)) {
    for (const t of tachesIntervention(i.id, data, tousLiens)) {
      if (!vues.has(t.id)) {
        vues.add(t.id);
        out.push(t);
      }
    }
  }
  return out;
}

/** Statut d'un déplacement, déduit de ses interventions. */
export function statutVoyage(voyageId, data) {
  const its = interventionsDuVoyage(voyageId, data);
  if (its.length && its.every((i) => i.statut === 'termine')) return 'termine';
  return 'en_preparation';
}

export const voyageOuvert = (voyageId, data) => statutVoyage(voyageId, data) !== 'termine';

/** Bien d'une intervention : le sien, sinon celui de ses tâches (anciennes interventions). */
export function bienIntervention(intervention, data) {
  if (intervention.appartement_id) return intervention.appartement_id;
  const biens = new Set(tachesIntervention(intervention.id, data).map((t) => t.appartement_id || ''));
  return biens.size === 1 ? [...biens][0] || null : null;
}

/** Identifiant du déplacement d'une intervention (le sien, ou elle-même si déplacement virtuel). */
export function voyageDe(intervention, data) {
  const reels = new Set((data.voyages || []).map((v) => v.id));
  return intervention.voyage_id && reels.has(intervention.voyage_id) ? intervention.voyage_id : intervention.id;
}

/** Nom affiché d'une intervention : le bien d'abord, puis le nom choisi (« Bien A · rotation locataire »). */
export function nomIntervention(intervention, data) {
  const bien = data.appartements.find((a) => a.id === bienIntervention(intervention, data));
  const perso = intervention.nom_perso?.trim();
  if (bien) return perso ? `${bien.nom} · ${perso}` : bien.nom;
  return perso || intervention.nom;
}

/** « Déplacement › Intervention » (sans répéter le déplacement dans le nom de l'intervention). */
export function libellePlanification(intervention, data) {
  if (!intervention) return null;
  const voyage = trouverVoyage(voyageDe(intervention, data), data);
  const nom = nomIntervention(intervention, data);
  return voyage && !voyage.virtuel ? `${voyage.nom} › ${nom}` : nom;
}

/**
 * Écritures pour ranger des tâches dans un déplacement : chaque tâche va dans l'intervention
 * de son bien (créée si besoin). Les tâches prévues dans une autre intervention ouverte en sont retirées.
 * Renvoie { writes, interventions: [ids créés ou utilisés] }.
 */
export function rangerDansVoyage(voyage, tacheIds, data) {
  const writes = [];
  const existantes = interventionsDuVoyage(voyage.id, data).filter(interventionOuverte);
  const parBien = new Map(existantes.map((i) => [bienIntervention(i, data) ?? '', i]));
  const nouvelles = [];
  const groupes = new Map();
  for (const tid of tacheIds) {
    const t = data.taches.find((x) => x.id === tid);
    const bien = t?.appartement_id || '';
    if (!groupes.has(bien)) groupes.set(bien, []);
    groupes.get(bien).push(tid);
  }
  let courant = data;
  let reel = voyage.virtuel ? null : voyage;
  for (const [bien, ids] of groupes) {
    let inter = parBien.get(bien);
    if (!inter && !reel) {
      // Déplacement virtuel qui reçoit un nouveau bien : on le crée pour de bon, avec le même id.
      reel = { id: voyage.id, nom: voyage.nom, date_debut: voyage.date_debut ?? null, deleted: false };
      writes.push({ table: 'voyages', row: reel });
      for (const i of existantes) writes.push({ table: 'deplacements', row: { id: i.id, voyage_id: reel.id } });
      courant = appliquer(courant, writes);
    }
    if (!inter) {
      const nomBien = data.appartements.find((a) => a.id === bien)?.nom ?? 'Sans bien';
      inter = { id: uuid(), nom: `${voyage.nom} – ${nomBien}`, date_debut: voyage.date_debut ?? null, statut: 'en_preparation', voyage_id: reel.id, appartement_id: bien || null, deleted: false };
      writes.push({ table: 'deplacements', row: inter });
      nouvelles.push(inter);
      parBien.set(bien, inter);
      courant = { ...courant, deplacements: [...courant.deplacements, inter] };
    }
    const w = ajouterTaches(inter.id, ids, courant);
    writes.push(...w);
    courant = appliquer(courant, w);
  }
  return { writes, interventions: [...parBien.values()].map((i) => i.id), nouvelles };
}

/** Crée un déplacement et ses interventions (une par bien) à partir des tâches choisies. */
export function creerVoyage({ nom, date_debut = null }, tacheIds, data) {
  const voyage = { id: uuid(), nom, date_debut, deleted: false };
  const avecVoyage = { ...data, voyages: [...(data.voyages || []), voyage] };
  const { writes } = rangerDansVoyage(voyage, tacheIds, avecVoyage);
  return { id: voyage.id, writes: [{ table: 'voyages', row: voyage }, ...writes] };
}

/**
 * Affectation d'une tâche depuis sa fiche : déplacement choisi (ou null pour la retirer
 * de toute intervention ouverte).
 */
export function affecterTache(tacheId, voyageId, data) {
  const tousLiens = liens(data);
  const writes = [];
  if (!voyageId) {
    for (const l of tousLiens.filter((x) => x.tache_id === tacheId)) {
      const i = data.deplacements.find((d) => d.id === l.intervention_id);
      if (!interventionOuverte(i)) continue;
      if (!l.herite) writes.push({ table: 'intervention_taches', row: { id: l.id, deleted: true } });
    }
    const t = data.taches.find((x) => x.id === tacheId);
    if (t?.deplacement_id) writes.push({ table: 'taches', row: { id: tacheId, deplacement_id: null } });
    return writes;
  }
  const voyage = trouverVoyage(voyageId, data);
  if (!voyage) return writes;
  return rangerDansVoyage(voyage, [tacheId], data).writes;
}

/** Applique des écritures en mémoire (pour enchaîner les calculs). */
function appliquer(data, writes) {
  const out = { ...data };
  for (const { table, row } of writes) {
    const list = [...(out[table] || [])];
    const i = list.findIndex((r) => r.id === row.id);
    if (i >= 0) list[i] = { ...list[i], ...row };
    else list.push({ ...row });
    out[table] = list.filter((r) => !r.deleted);
  }
  return out;
}

/**
 * Rattache une tâche à une intervention précise (et donc à son déplacement), en la retirant des autres
 * interventions ouvertes. cible = id d'intervention, `nouvelle:<voyageId>` (intervention du bien de la tâche
 * à créer dans ce déplacement) ou '' (pas planifiée).
 */
export function affecterAIntervention(tacheId, cible, data) {
  if (!cible) return affecterTache(tacheId, null, data);
  if (cible.startsWith('nouvelle:')) return affecterTache(tacheId, cible.slice('nouvelle:'.length), data);
  const deja = liens(data).some((l) => l.tache_id === tacheId && l.intervention_id === cible);
  if (deja) return [];
  const autres = affecterTache(tacheId, null, data);
  return [...autres, ...ajouterTaches(cible, [tacheId], data)];
}
