// Achats et stock.
// Parcours : « à acheter » -> coché « acheté » au magasin -> l'article passe dans le lieu « Véhicule »
// -> plus tard « Ranger à… » vers son vrai lieu. Stock : une ligne par article et par lieu (table stocks).

import { nameKey } from './match.js';
import { stockId } from './schema.js';

export const NOM_VEHICULE = 'Véhicule';

/** Lieu « Véhicule » existant, sinon écriture pour le créer (identifiant fixe par compte : pas de doublon). */
export function lieuVehicule(lieux, espaceId) {
  const existant = lieux.find((l) => nameKey(l.nom) === nameKey(NOM_VEHICULE));
  if (existant) return { id: existant.id, writes: [] };
  const id = `lieu-vehicule-${String(espaceId).replace(/[^a-z0-9]/gi, '').slice(0, 8)}`;
  return { id, writes: [{ table: 'lieux', row: { id, nom: NOM_VEHICULE, deleted: false } }] };
}

export const nbAAcheter = (articles) => articles.filter((a) => a.a_acheter).length;

/** Écritures « acheté » : l'article quitte la liste d'achats et va dans le véhicule (son stock suit). */
export function marquerAchete(ids, data, espaceId, maintenant = Date.now()) {
  const v = lieuVehicule(data.lieux, espaceId);
  const writes = [...v.writes];
  for (const id of ids) {
    const a = data.articles.find((x) => x.id === id);
    if (!a) continue;
    writes.push({ table: 'articles', row: { id, a_acheter: false, achete_le: maintenant, lieu_id: v.id } });
    writes.push(...deplacerStock(a, v.id, data));
  }
  return writes;
}

export const marquerAAcheter = (ids, valeur = true) =>
  [...ids].map((id) => ({ table: 'articles', row: { id, a_acheter: valeur, ...(valeur ? { achete_le: null } : {}) } }));

/** Ranger des articles dans un lieu (le stock suit ; « acheté » disparaît une fois rangé hors du véhicule). */
export function ranger(ids, lieuId, data) {
  const vehicule = data.lieux.find((l) => nameKey(l.nom) === nameKey(NOM_VEHICULE));
  const writes = [];
  for (const id of ids) {
    const a = data.articles.find((x) => x.id === id);
    if (!a) continue;
    writes.push({ table: 'articles', row: { id, lieu_id: lieuId, ...(lieuId !== vehicule?.id ? { achete_le: null } : {}) } });
    writes.push(...deplacerStock(a, lieuId, data));
  }
  return writes;
}

/** Quantité en stock d'un article (tous lieux confondus) ; null si jamais saisie. */
export function quantiteStock(articleId, stocks) {
  const lignes = (stocks || []).filter((s) => s.article_id === articleId);
  return lignes.length ? lignes.reduce((t, s) => t + (Number(s.quantite) || 0), 0) : null;
}

/** Fixe la quantité au lieu principal de l'article (l'écran ne gère qu'une quantité pour l'instant). */
export function fixerStock(article, quantite, data) {
  const id = stockId(article.id, article.lieu_id);
  const autres = (data.stocks || []).filter((s) => s.article_id === article.id && s.id !== id);
  return [
    { table: 'stocks', row: { id, article_id: article.id, lieu_id: article.lieu_id ?? null, quantite: quantite == null ? null : Number(quantite), deleted: false } },
    // L'écran ne montre qu'une quantité : on ne laisse pas traîner d'autres lignes qui fausseraient le total.
    ...autres.map((s) => ({ table: 'stocks', row: { id: s.id, deleted: true } })),
  ];
}

/** Quand un article change de lieu, sa quantité le suit. */
export function deplacerStock(article, nouveauLieu, data) {
  if ((article.lieu_id ?? null) === (nouveauLieu ?? null)) return [];
  const lignes = (data.stocks || []).filter((s) => s.article_id === article.id);
  if (!lignes.length) return [];
  const total = lignes.reduce((t, s) => t + (Number(s.quantite) || 0), 0);
  const id = stockId(article.id, nouveauLieu);
  return [
    ...lignes.filter((s) => s.id !== id).map((s) => ({ table: 'stocks', row: { id: s.id, deleted: true } })),
    { table: 'stocks', row: { id, article_id: article.id, lieu_id: nouveauLieu ?? null, quantite: total, deleted: false } },
  ];
}
