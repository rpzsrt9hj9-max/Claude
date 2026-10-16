// Actions métier côté client (écritures locales, synchronisées ensuite).
import { insert, update, remove, write } from './db.js';
import { priseId, tacheArticleId, accessoireId, defaultCumul, uuid } from '../shared/schema.js';
import { findSameName } from '../shared/match.js';
import { mergeArticles, duplicateTrip, copyTache } from '../shared/ops.js';
import { ajouterTaches, retirerTache, cloturer, planification, decocherTout } from '../shared/interventions.js';
import { stockerPhoto, compresserPhoto, supprimerFichierPhoto } from './db.js';

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
        titre: draft.titre.trim(),
        description: draft.description?.trim() || null,
        appartement_id: draft.appartement_id || null,
        echeance: draft.modele ? null : draft.echeance || null,
        ...(draft.statut ? { statut: draft.statut, fait: draft.statut === 'terminee' } : {}),
        ...(draft.id ? {} : { deplacement_id: null, ordre, modele: !!draft.modele, deleted: false, ...(draft.statut ? {} : { statut: 'a_traiter', fait: false }) }),
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

export const setFait = (tache, fait) => update('taches', tache.id, { fait, statut: fait ? 'terminee' : 'a_traiter' });
export const setStatutTache = (tache, statut) => update('taches', tache.id, { statut, fait: statut === 'terminee' });
export const setDescription = (tache, description) => update('taches', tache.id, { description });

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
  const { id, writes } = copyTache(tache, links, { titre: `${tache.titre} (copie)`, description: decocherTout(tache.description), echeance: tache.echeance ?? null, deplacement_id: null, statut: 'a_traiter', ordre: (tache.ordre ?? 0) + 0.5 });
  await write(writes);
  return id;
}

/** Enregistre une tâche (ou un brouillon) comme tâche type réutilisable. */
export async function saveAsModele(draft, links) {
  const { id, writes } = copyTache({ ...draft, deplacement_id: null }, links, { modele: true, deplacement_id: null, appartement_id: null, description: decocherTout(draft.description), statut: null, echeance: null, ordre: 0 });
  await write(writes);
  return id;
}

/** Crée une tâche à partir d'une tâche type (et l'ajoute à l'intervention si elle est donnée). */
export async function createFromModele(modele, data, interventionId, appartement_id, ordre) {
  const links = data.tache_articles.filter((l) => l.tache_id === modele.id);
  const { id, writes } = copyTache(modele, links, { deplacement_id: null, appartement_id: appartement_id || null, modele: false, statut: 'a_traiter', ordre });
  if (interventionId) writes.push(...ajouterTaches(interventionId, [id], { ...data, taches: [...data.taches, writes[0].row] }));
  await write(writes);
  return id;
}

// ---------- Interventions ----------

export const updateIntervention = (id, patch) => update('deplacements', id, patch);
export const createIntervention = (nom, date_debut) => insert('deplacements', { nom, date_debut: date_debut || null, statut: 'en_preparation' });
export const addTachesToIntervention = (interventionId, tacheIds, data) => write(ajouterTaches(interventionId, tacheIds, data));
export const removeTacheFromIntervention = (interventionId, tacheId, data) => write(retirerTache(interventionId, tacheId, data));
export const closeIntervention = (interventionId, choix, data) => write(cloturer(interventionId, choix, data));

/** Supprime une intervention : ses liens et cases « Pris » ; les tâches restent dans la liste générale. */
export async function deleteIntervention(dep, data) {
  await write([
    ...data.intervention_taches.filter((l) => l.intervention_id === dep.id).map((l) => ({ table: 'intervention_taches', row: { id: l.id, deleted: true } })),
    ...data.taches.filter((t) => t.deplacement_id === dep.id).map((t) => ({ table: 'taches', row: { id: t.id, deplacement_id: null } })),
    ...data.prise_articles.filter((p) => p.deplacement_id === dep.id).map((p) => ({ table: 'prise_articles', row: { id: p.id, deleted: true } })),
    { table: 'deplacements', row: { id: dep.id, deleted: true } },
  ]);
}

// ---------- Commentaires et photos ----------

/**
 * Ajoute un commentaire horodaté, avec photos éventuelles.
 * Pour une tâche, on note l'intervention ouverte où elle est prévue (pour le récap).
 */
export async function addCommentaire({ tacheId = null, interventionId = null, texte, fichiers = [], auteur = null }, data) {
  const id = uuid();
  const intervention = interventionId ?? (tacheId ? planification(tacheId, data)?.id ?? null : null);
  const writes = [{ table: 'commentaires', row: { id, tache_id: tacheId, intervention_id: intervention, texte: texte.trim() || null, auteur, deleted: false } }];
  for (const f of fichiers) {
    const photoId = uuid();
    const chemin = `${intervention ?? 'sans-intervention'}/${photoId}.jpg`;
    await stockerPhoto(chemin, await compresserPhoto(f));
    writes.push({ table: 'photos', row: { id: photoId, commentaire_id: id, chemin, legende: null, deleted: false } });
  }
  await write(writes);
  return id;
}

export async function deleteCommentaire(commentaire) {
  await write([
    { table: 'commentaires', row: { id: commentaire.id, deleted: true } },
    ...commentaire.photos.map((p) => ({ table: 'photos', row: { id: p.id, deleted: true } })),
  ]);
  for (const p of commentaire.photos) await supprimerFichierPhoto(p.chemin);
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
