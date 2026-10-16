// Logique des interventions : tâches générales (backlog), planification, clôture, récap.
// Une intervention est une ligne de la table `deplacements` (nom historique conservé).
// Le lien tâche ↔ intervention est dans `intervention_taches` (historique conservé).

import { interventionTacheId } from './schema.js';

export const STATUTS_TACHE = { a_traiter: 'À traiter', reportee: 'Reportée', terminee: 'Terminée' };
export const STATUT_ORDER = ['a_traiter', 'reportee', 'terminee'];

/** Statut d'une tâche, y compris pour les anciennes lignes qui n'avaient que `fait`. */
export const statutTache = (t) => t.statut || (t.fait ? 'terminee' : 'a_traiter');
export const estTerminee = (t) => statutTache(t) === 'terminee';
export const interventionOuverte = (i) => i && i.statut !== 'termine';

/** Date du jour au format AAAA-MM-JJ (heure locale). */
export function aujourdhui(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const enRetard = (t, jour = aujourdhui()) => !!t.echeance && !estTerminee(t) && t.echeance < jour;

/** Tâches « normales » (hors tâches types). */
export const tachesGenerales = (data) => data.taches.filter((t) => !t.modele);

/**
 * Liens tâche ↔ intervention, y compris les liens « hérités » des anciens déplacements
 * (taches.deplacement_id) tant que la migration SQL n'a pas créé de vrai lien.
 */
export function liens(data) {
  const reels = data.intervention_taches || [];
  const avecLien = new Set(reels.map((l) => l.tache_id));
  const herites = data.taches
    .filter((t) => t.deplacement_id && !t.modele && !avecLien.has(t.id))
    .map((t) => ({ id: interventionTacheId(t.deplacement_id, t.id), intervention_id: t.deplacement_id, tache_id: t.id, ordre: t.ordre ?? 0, herite: true }));
  return [...reels, ...herites];
}

/** Tâches d'une intervention, dans l'ordre de l'intervention. */
export function tachesIntervention(interventionId, data, tousLiens = liens(data)) {
  const byId = new Map(data.taches.map((t) => [t.id, t]));
  return tousLiens
    .filter((l) => l.intervention_id === interventionId && byId.has(l.tache_id))
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
    .map((l) => byId.get(l.tache_id));
}

/** Intervention ouverte dans laquelle une tâche est planifiée (ou null). */
export function planification(tacheId, data, tousLiens = liens(data)) {
  const byId = new Map(data.deplacements.map((d) => [d.id, d]));
  for (const l of tousLiens) {
    if (l.tache_id !== tacheId) continue;
    const i = byId.get(l.intervention_id);
    if (interventionOuverte(i)) return i;
  }
  return null;
}

export function comparerEcheance(a, b) {
  const ea = a.echeance || '9999-99-99';
  const eb = b.echeance || '9999-99-99';
  return ea < eb ? -1 : ea > eb ? 1 : (a.titre || '').localeCompare(b.titre || '', 'fr');
}

/**
 * Tâches proposées à l'ajout dans une intervention.
 * - terminées : jamais proposées ;
 * - `libres` : jamais planifiées, reportées, ou planifiées seulement dans des interventions closes ;
 * - `ailleurs` : déjà prévues dans une AUTRE intervention ouverte (section séparée).
 * filtres = { appartements: Set|Array (vide = tous), echeanceMax: 'AAAA-MM-JJ' | null, sansEcheance: bool }
 */
export function candidats(interventionId, data, filtres = {}) {
  // interventionId : une intervention, ou la liste des interventions d'un déplacement
  const cibles = new Set([interventionId].flat().filter(Boolean));
  const apps = new Set(filtres.appartements || []);
  const tousLiens = liens(data);
  const deja = new Set(tousLiens.filter((l) => cibles.has(l.intervention_id)).map((l) => l.tache_id));
  const libres = [];
  const ailleurs = [];
  for (const t of tachesGenerales(data)) {
    if (estTerminee(t) || deja.has(t.id)) continue;
    if (apps.size && !apps.has(t.appartement_id || '')) continue;
    if (filtres.echeanceMax && t.echeance && t.echeance > filtres.echeanceMax) continue;
    if (filtres.echeanceMax && !t.echeance && filtres.sansEcheance === false) continue;
    const autre = planification(t.id, data, tousLiens);
    if (autre && !cibles.has(autre.id)) ailleurs.push({ tache: t, intervention: autre });
    else libres.push(t);
  }
  libres.sort(comparerEcheance);
  ailleurs.sort((a, b) => comparerEcheance(a.tache, b.tache));
  return { libres, ailleurs };
}

/**
 * Écritures pour ajouter des tâches à une intervention.
 * Les tâches prévues dans une autre intervention ouverte en sont retirées (déplacement).
 */
export function ajouterTaches(interventionId, tacheIds, data) {
  const tousLiens = liens(data);
  const max = Math.max(0, ...tousLiens.filter((l) => l.intervention_id === interventionId).map((l) => l.ordre ?? 0));
  const writes = [];
  tacheIds.forEach((tid, i) => {
    const autre = planification(tid, data, tousLiens);
    if (autre && autre.id !== interventionId) writes.push(...retirerTache(autre.id, tid, data, tousLiens));
    writes.push({
      table: 'intervention_taches',
      row: { id: interventionTacheId(interventionId, tid), intervention_id: interventionId, tache_id: tid, resultat: null, ordre: max + i + 1, deleted: false },
    });
  });
  return writes;
}

/** Écritures pour retirer une tâche d'une intervention (la tâche reste dans la liste générale). */
export function retirerTache(interventionId, tacheId, data, tousLiens = liens(data)) {
  const writes = [];
  const lien = tousLiens.find((l) => l.intervention_id === interventionId && l.tache_id === tacheId);
  if (lien && !lien.herite) writes.push({ table: 'intervention_taches', row: { id: lien.id, deleted: true } });
  const t = data.taches.find((x) => x.id === tacheId);
  if (t?.deplacement_id === interventionId) writes.push({ table: 'taches', row: { id: tacheId, deplacement_id: null } });
  return writes;
}

/** Proposition de clôture : tâches non terminées → « Reportée » par défaut. */
export function propositionCloture(interventionId, data) {
  return tachesIntervention(interventionId, data).map((t) => ({
    tache: t,
    statut: estTerminee(t) ? 'terminee' : 'reportee',
  }));
}

/**
 * Écritures de clôture : statut de chaque tâche, résultat gardé sur le lien (historique),
 * intervention passée à « termine ».
 * choix = [{ tache_id, statut }]
 */
export function cloturer(interventionId, choix, data) {
  const tousLiens = liens(data);
  const writes = [];
  choix.forEach(({ tache_id, statut }, i) => {
    writes.push({ table: 'taches', row: { id: tache_id, statut, fait: statut === 'terminee' } });
    const lien = tousLiens.find((l) => l.intervention_id === interventionId && l.tache_id === tache_id);
    writes.push({
      table: 'intervention_taches',
      row: { id: interventionTacheId(interventionId, tache_id), intervention_id: interventionId, tache_id, resultat: statut, ordre: lien?.ordre ?? i + 1, deleted: false },
    });
  });
  writes.push({ table: 'deplacements', row: { id: interventionId, statut: 'termine' } });
  return writes;
}

/** Inclus dans le rapport d'intervention (oui par défaut). */
export const dansRapport = (x) => x.dans_rapport !== false;

/** Nombre de jours depuis la création (created_at en millisecondes). */
export const joursDepuis = (ms, maintenant = Date.now()) => Math.max(0, Math.floor((maintenant - ms) / 86_400_000));

/** Commentaires (avec photos) d'une tâche, du plus récent au plus ancien. */
export function commentairesTache(tacheId, data) {
  return avecPhotos((data.commentaires || []).filter((c) => c.tache_id === tacheId), data).sort((a, b) => b.created_at - a.created_at);
}

/**
 * Récap d'une intervention : compte rendu (commentaires sans tâche) + commentaires des tâches de
 * l'intervention, regroupés par tâche, du plus ancien au plus récent.
 */
export function recap(interventionId, data) {
  const coms = data.commentaires || [];
  const compteRendu = avecPhotos(coms.filter((c) => c.intervention_id === interventionId && !c.tache_id), data).sort((a, b) => a.created_at - b.created_at);
  const parTache = tachesIntervention(interventionId, data).map((tache) => ({
    tache,
    commentaires: avecPhotos(coms.filter((c) => c.tache_id === tache.id), data).sort((a, b) => a.created_at - b.created_at),
  }));
  const photos = [...compteRendu, ...parTache.flatMap((g) => g.commentaires)].flatMap((c) => c.photos);
  return { compteRendu, parTache, photos };
}

function avecPhotos(commentaires, data) {
  const photos = data.photos || [];
  return commentaires.map((c) => ({ ...c, photos: photos.filter((p) => p.commentaire_id === c.id) }));
}

/* ---------- Cases à cocher dans la description : « - [ ] étape » / « - [x] étape » ---------- */

const RE_CASE = /^(\s*)[-*] \[( |x|X)\] ?(.*)$/;

/** Découpe une description en lignes de texte et en cases à cocher. */
export function lignesDescription(description) {
  return (description || '').split('\n').map((ligne, index) => {
    const m = ligne.match(RE_CASE);
    return m ? { index, type: 'case', fait: m[2] !== ' ', texte: m[3] } : { index, type: 'texte', texte: ligne };
  });
}

export function progressionEtapes(description) {
  const cases = lignesDescription(description).filter((l) => l.type === 'case');
  return { faites: cases.filter((c) => c.fait).length, total: cases.length };
}

/** Coche ou décoche la ligne n° index ; renvoie la nouvelle description. */
export function basculerEtape(description, index) {
  const lignes = (description || '').split('\n');
  const m = lignes[index]?.match(RE_CASE);
  if (!m) return description;
  lignes[index] = `${m[1]}- [${m[2] === ' ' ? 'x' : ' '}] ${m[3]}`;
  return lignes.join('\n');
}

export function ajouterEtape(description, texte) {
  const base = (description || '').replace(/\s+$/, '');
  return `${base ? `${base}\n` : ''}- [ ] ${texte.trim()}`;
}

/** Remet toutes les cases à zéro (copie de tâche, tâche type). */
export const decocherTout = (description) => (description || '').replace(/^(\s*[-*] )\[[xX]\]/gm, '$1[ ]');
