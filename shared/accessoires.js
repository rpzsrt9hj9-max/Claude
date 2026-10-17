// Accessoires : batteries, chargeurs, marque et tension lues dans les noms.
// Règles de l'utilisateur :
//  - seules les batteries se multiplient : une par outil (distinct) qui la propose ;
//  - les autres accessoires (forets, disques…) ne se multiplient pas ;
//  - un chargeur par type de batterie (marque + tension, la capacité en Ah ne compte pas) ;
//  - les chargeurs ne sont jamais proposés automatiquement.

import { normalize } from './match.js';

const mots = (nom) => normalize(nom).split(' ').filter(Boolean);

export const estBatterie = (a) => !!a && mots(a.nom).some((m) => m === 'batterie' || m === 'batteries');
export const estChargeur = (a) => !!a && mots(a.nom).some((m) => m === 'chargeur' || m === 'chargeurs');

/** Tension lue dans le nom (« 18V », « 18 V », « 18 volts », « 10,8 V ») -> « 18 » / « 10.8 », sinon null. */
export function tension(nom) {
  const m = String(nom ?? '').toLowerCase().match(/(\d{1,2}(?:[.,]\d)?)\s*(?:v|volts?)(?![a-z0-9])/);
  return m ? m[1].replace(',', '.') : null;
}

// Mots qui ne désignent pas une marque
const GENERIQUES = new Set([
  'batterie', 'batteries', 'chargeur', 'chargeurs', 'sans', 'fil', 'avec', 'pour', 'les', 'des', 'une', 'volt', 'volts',
  'outil', 'pack', 'lithium', 'li', 'ion', 'compact', 'rapide', 'kit',
]);

/** Mots du nom qui peuvent être une marque (ni générique, ni tension, ni capacité). */
export function motsMarque(nom) {
  return mots(nom).filter((m) => m.length >= 3 && !GENERIQUES.has(m) && !/^\d/.test(m) && !/^\d+(ah|v)$/.test(m));
}

/** Type de batterie (marque + tension) : « bosch 18 », pour un chargeur par type. */
export function typeBatterie(article) {
  const v = tension(article.nom);
  return v ? `${motsMarque(article.nom).sort().join(' ')} ${v}` : null;
}

/**
 * Batteries du catalogue compatibles avec un outil (même tension lue dans le nom).
 * `marque` = vrai si elles partagent aussi un mot de marque avec l'outil (à pré-cocher).
 */
export function batteriesCompatibles(outil, articles) {
  const v = tension(outil.nom);
  if (!v) return [];
  const marques = new Set(motsMarque(outil.nom));
  return articles
    .filter((a) => a.id !== outil.id && estBatterie(a) && tension(a.nom) === v)
    .map((a) => ({ article: a, marque: motsMarque(a.nom).some((m) => marques.has(m)) }))
    .sort((x, y) => Number(y.marque) - Number(x.marque) || x.article.nom.localeCompare(y.article.nom, 'fr'));
}

/**
 * Quantité de batteries pour un ensemble de tâches : une par outil distinct qui la propose et qui
 * figure dans une tâche où la batterie est aussi prévue. Sans outil associé, on garde la quantité saisie.
 * usages = [{ tache, quantite }] ; liensTaches = tache_articles des tâches concernées.
 */
export function quantiteBatterie(batterie, usages, liensTaches, accessoires) {
  const proposePar = new Map(accessoires.filter((x) => x.accessoire_id === batterie.id).map((x) => [x.article_id, Number(x.quantite) || 1]));
  const outils = new Map();
  let direct = 0;
  for (const u of usages) {
    const outilsTache = liensTaches.filter((l) => l.tache_id === u.tache.id && proposePar.has(l.article_id)).map((l) => l.article_id);
    if (outilsTache.length) outilsTache.forEach((o) => outils.set(o, proposePar.get(o)));
    else direct = Math.max(direct, u.quantite);
  }
  const parOutils = [...outils.values()].reduce((s, q) => s + q, 0);
  return Math.max(parOutils, direct) || Math.max(0, ...usages.map((u) => u.quantite));
}
