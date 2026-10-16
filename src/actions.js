// Actions métier côté client (écritures locales, synchronisées ensuite).
import { insert, update, remove, write } from './db.js';
import { priseId, tacheArticleId, accessoireId, defaultCumul, uuid } from '../shared/schema.js';
import { findSameName } from '../shared/match.js';
import { mergeArticles, duplicateTrip, copyTache } from '../shared/ops.js';

/** Fixe la quantité prise d'un article ; « pris » est vrai quand la quantité totale est atteinte. */
export function setPrise(deplacementId, item, quantite) {
  const q = Math.max(0, quantite);
  return write({
    table: 'prise_articles',
    row: {
      id: priseId(deplacementId, item.article.id),
      deplacement_id: deplacementId,
      article_id: item.article.id,
      pris: q >= item.total,
      quantite_prise: q,
      deleted: false,
    },
  });
}

export const togglePris = (deplacementId, item) => setPrise(deplacementId, item, item.status.complet ? 0 : item.total);

export function markAllPris(deplacementId, items) {
  return write(
    items.map((item) => ({
      table: 'prise_articles',
      row: { id: priseId(deplacementId, item.article.id), deplacement_id: deplacementId, article_id: item.article.id, pris: true, quantite_prise: item.total, deleted: false },
    })),
  );
}

/**
 * Enregistre une tâche et ses articles.
 * draft = { id?, deplacement_id, titre, description, appartement_id, links: [{ article_id, quantite }] }
 * existingLinks = liaisons actuellement en base pour cette tâche
 */
export async function saveTache(draft, existingLinks = [], ordre = 0) {
  const id = draft.id ?? uuid();
  const writes = [
    {
      table: 'taches',
      row: {
        id,
        deplacement_id: draft.deplacement_id,
        titre: draft.titre.trim(),
        description: draft.description?.trim() || null,
        appartement_id: draft.appartement_id || null,
        ...(draft.id ? {} : { fait: false, ordre, modele: !!draft.modele, deleted: false }),
      },
    },
  ];
  const keep = new Set();
  for (const l of draft.links) {
    keep.add(l.article_id);
    const prev = existingLinks.find((x) => x.article_id === l.article_id);
    if (!prev || prev.quantite !== l.quantite) {
      writes.push({ table: 'tache_articles', row: { id: tacheArticleId(id, l.article_id), tache_id: id, article_id: l.article_id, quantite: l.quantite, deleted: false } });
    }
  }
  for (const l of existingLinks) if (!keep.has(l.article_id)) writes.push({ table: 'tache_articles', row: { id: l.id, deleted: true } });
  await write(writes);
  return id;
}

export async function deleteTache(tache, links) {
  await write([{ table: 'taches', row: { id: tache.id, deleted: true } }, ...links.map((l) => ({ table: 'tache_articles', row: { id: l.id, deleted: true } }))]);
}

export const setFait = (tache, fait) => update('taches', tache.id, { fait });

export async function createArticle({ nom, type, lieu_id = null, categorie_id = null, unite = null }, articles) {
  const clean = nom.trim();
  if (!clean) throw new Error('Nom vide');
  if (findSameName(clean, articles)) throw new Error(`« ${clean} » existe déjà.`);
  return insert('articles', { nom: clean, type, lieu_id, categorie_id, unite: unite || null, notes: null, cumul_quantites: defaultCumul(type) });
}

/** Modification groupée : même lieu ou même catégorie pour plusieurs articles. */
export const bulkUpdateArticles = (ids, patch) => write([...ids].map((id) => ({ table: 'articles', row: { id, ...patch } })));

export const setAccessoire = (articleId, accId, quantite = 1) =>
  write({ table: 'article_accessoires', row: { id: accessoireId(articleId, accId), article_id: articleId, accessoire_id: accId, quantite, deleted: false } });
export const removeAccessoire = (link) => remove('article_accessoires', link.id);

/** Duplique une tâche (avec ses articles) dans le même déplacement, juste après l'originale. */
export async function duplicateTache(tache, links) {
  const { id, writes } = copyTache(tache, links, { titre: `${tache.titre} (copie)`, ordre: (tache.ordre ?? 0) + 0.5 });
  await write(writes);
  return id;
}

/** Enregistre une tâche (ou un brouillon) comme tâche type réutilisable. */
export async function saveAsModele(draft, links) {
  const { id, writes } = copyTache({ ...draft, deplacement_id: null }, links, { modele: true, deplacement_id: null, appartement_id: null, ordre: 0 });
  await write(writes);
  return id;
}

/** Crée une tâche du déplacement à partir d'une tâche type. */
export async function createFromModele(modele, data, deplacement_id, appartement_id, ordre) {
  const links = data.tache_articles.filter((l) => l.tache_id === modele.id);
  const { id, writes } = copyTache(modele, links, { deplacement_id, appartement_id: appartement_id || null, modele: false, ordre });
  await write(writes);
  return id;
}

export const updateArticle = (id, patch) => update('articles', id, patch);

export async function deleteArticle(article, data) {
  const links = data.tache_articles.filter((l) => l.article_id === article.id);
  const prises = data.prise_articles.filter((p) => p.article_id === article.id);
  const accs = data.article_accessoires.filter((x) => x.article_id === article.id || x.accessoire_id === article.id);
  await write([
    ...accs.map((x) => ({ table: 'article_accessoires', row: { id: x.id, deleted: true } })),
    { table: 'articles', row: { id: article.id, deleted: true } },
    ...links.map((l) => ({ table: 'tache_articles', row: { id: l.id, deleted: true } })),
    ...prises.map((p) => ({ table: 'prise_articles', row: { id: p.id, deleted: true } })),
  ]);
}

export const merge = (keepId, dropId, data) => write(mergeArticles(keepId, dropId, data));

export async function duplicate(deplacementId, data, opts) {
  const { id, writes } = duplicateTrip(deplacementId, data, opts);
  await write(writes);
  return id;
}

export const createDeplacement = (nom, date_debut) => insert('deplacements', { nom, date_debut: date_debut || null, statut: 'en_preparation' });
export const setStatut = (dep, statut) => update('deplacements', dep.id, { statut });

/** Lieux / appartements : renommer, supprimer avec réaffectation éventuelle. */
export const createNamed = (table, nom) => insert(table, { nom: nom.trim() });
export const renameNamed = (table, id, nom) => update(table, id, { nom: nom.trim() });

export async function deleteNamed(table, id, data, reassignTo = null) {
  const writes = [{ table, row: { id, deleted: true } }];
  if (table === 'lieux') {
    for (const a of data.articles.filter((x) => x.lieu_id === id)) writes.push({ table: 'articles', row: { id: a.id, lieu_id: reassignTo } });
  } else if (table === 'categories') {
    for (const a of data.articles.filter((x) => x.categorie_id === id)) writes.push({ table: 'articles', row: { id: a.id, categorie_id: reassignTo } });
  } else if (table === 'appartements') {
    for (const t of data.taches.filter((x) => x.appartement_id === id)) writes.push({ table: 'taches', row: { id: t.id, appartement_id: reassignTo } });
  }
  await write(writes);
}

export { remove };
