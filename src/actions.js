// Actions métier côté client (écritures locales, synchronisées ensuite).
import { avecAnnulation } from './annulation.js';
import { db, insert, update, remove, write } from './db.js';
import { priseId, tacheArticleId, accessoireId, defaultCumul, uuid, cleKit } from '../shared/schema.js';
import { findSameName } from '../shared/match.js';
import { mergeArticles, duplicateTrip, copyTache } from '../shared/ops.js';
import { ajouterTaches, retirerTache, cloturer, planification, decocherTout } from '../shared/interventions.js';
import { creerVoyage, rangerDansVoyage, affecterTache, interventionsDuVoyage } from '../shared/voyages.js';
import { reporterSurTache } from '../shared/modeles.js';
import { stockerPhoto, compresserPhoto, supprimerFichierPhoto, espaceId } from './db.js';
import { supabase } from './supabase.js';
import { categoriesDeDepart, planImport } from '../shared/catalogue.js';
import { marquerAchete, marquerAAcheter, ranger, fixerStock } from '../shared/achats.js';
import { corrigerReferences } from '../shared/references.js';

/** Fixe la quantité prise d'un article ; « pris » est vrai quand la quantité totale est atteinte. */
const lignePrise = (deplacementId, articleCle, quantite, pris) => ({
  table: 'prise_articles',
  row: { id: priseId(deplacementId, articleCle), deplacement_id: deplacementId, article_id: articleCle, pris, quantite_prise: quantite, deleted: false },
});

/** Écritures « pris » d'un article ; pour un basique au chargement, tout son contenu est coché ou décoché. */
function ecrituresPrise(deplacementId, item, quantite) {
  const q = Math.max(0, quantite);
  const writes = [lignePrise(deplacementId, item.article.id, q, q >= item.total)];
  if (item.contenu && !String(deplacementId).startsWith('sortir~')) {
    for (const c of item.contenu) writes.push(lignePrise(deplacementId, cleKit(item.article.id, c.article.id), q >= item.total ? c.quantite : 0, q >= item.total));
  }
  return writes;
}

export const setPrise = (deplacementId, item, quantite) => write(ecrituresPrise(deplacementId, item, quantite));
export const togglePris = (deplacementId, item) => setPrise(deplacementId, item, item.status.complet ? 0 : item.total);
/** Coche ou décoche un élément du contenu d'un basique. */
export const verifierContenu = (deplacementId, kitId, contenu, valeur) => write(lignePrise(deplacementId, cleKit(kitId, contenu.article.id), valeur ? contenu.quantite : 0, valeur));

export const markAllPris = (deplacementId, items) => write(items.flatMap((item) => ecrituresPrise(deplacementId, item, item.total)));

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

const ecrituresSuppressionTache = (tache, links) => [{ table: 'taches', row: { id: tache.id, deleted: true } }, ...links.map((l) => ({ table: 'tache_articles', row: { id: l.id, deleted: true } }))];

export async function deleteTache(tache, links) {
  await write(ecrituresSuppressionTache(tache, links));
}

/** Suppression d'une tâche depuis une liste (croix rouge ou glissement), annulable. */
export const supprimerTache = (tache, data) =>
  avecAnnulation(ecrituresSuppressionTache(tache, data.tache_articles.filter((l) => l.tache_id === tache.id)), `Tâche « ${tache.titre} » supprimée`);

export const setFait = (tache, fait) => update('taches', tache.id, { fait, statut: fait ? 'terminee' : 'a_traiter' });
export const setStatutTache = (tache, statut) => update('taches', tache.id, { statut, fait: statut === 'terminee' });
export const setDescription = (tache, description) => update('taches', tache.id, { description });

export async function createArticle({ nom, type, lieu_id = null, categorie_id = null, unite = null, a_acheter = false }, articles) {
  const clean = nom.trim();
  if (!clean) throw new Error('Nom vide');
  if (findSameName(clean, articles)) throw new Error(`« ${clean} » existe déjà.`);
  return insert('articles', { nom: clean, type, lieu_id, categorie_id, unite: unite || null, notes: null, cumul_quantites: defaultCumul(type), a_acheter: !!a_acheter });
}

/** Modification groupée : même catégorie ou même type pour plusieurs articles. */
export const bulkUpdateArticles = (ids, patch) => write([...ids].map((id) => ({ table: 'articles', row: { id, ...patch } })));

// ---------- Achats, rangement et stock ----------

export const acheter = (ids, data) => write(marquerAchete([...ids], data, espaceId()));
export const aAcheter = (ids, valeur = true) => write(marquerAAcheter([...ids], valeur));
/** Ranger des articles dans un lieu (leur quantité en stock suit). */
export const rangerArticles = (ids, lieuId, data) => write(ranger([...ids], lieuId, data));
export const setStock = (article, quantite, data) => write(fixerStock(article, quantite, data));

/** Duplique un article du catalogue avec ses items à proposer (nom suivi de « (copie) »). */
export async function duplicateArticle(article, data) {
  const id = uuid();
  const { id: _i, created_at: _c, updated_at: _u, rev: _r, _dirty: _d, ...champs } = article;
  const writes = [{ table: 'articles', row: { ...champs, id, nom: `${article.nom} (copie)`, a_acheter: !!article.a_acheter, achete_le: null, deleted: false } }];
  for (const l of data.article_accessoires.filter((x) => x.article_id === article.id)) {
    writes.push({ table: 'article_accessoires', row: { id: accessoireId(id, l.accessoire_id), article_id: id, accessoire_id: l.accessoire_id, quantite: l.quantite, deleted: false } });
  }
  await write(writes);
  return id;
}

/** Complète ou dédoublonne les références T- / I- / D- (rien à faire la plupart du temps). */
export async function verifierReferences(data) {
  const writes = corrigerReferences(data);
  if (writes.length) await write(writes);
  return writes.length;
}

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
  const { id, writes } = copyTache(modele, links, { deplacement_id: null, appartement_id: appartement_id || null, modele: false, modele_id: modele.id, statut: 'a_traiter', ordre });
  if (interventionId) writes.push(...ajouterTaches(interventionId, [id], { ...data, taches: [...data.taches, writes[0].row] }));
  await write(writes);
  return id;
}

/** Crée plusieurs tâches d'un coup à partir de tâches types. */
export async function createFromModeles(modeles, data, interventionId, appartement_id) {
  const ids = [];
  for (const m of modeles) ids.push(await createFromModele(m, data, interventionId, appartement_id, 0));
  return ids;
}

/** Reporte les modifications d'une tâche type sur les tâches ouvertes choisies. */
export const propagerModele = (taches, diff, data, modeleId) => write(taches.flatMap((t) => reporterSurTache(t, diff, data, modeleId)));

// ---------- Déplacements (un par voyage, une intervention par bien) ----------

export async function createVoyage({ nom, date_debut }, tacheIds, data) {
  const { id, writes } = creerVoyage({ nom, date_debut: date_debut || null }, tacheIds, data);
  await write(writes);
  return id;
}
export const addTachesToVoyage = (voyage, tacheIds, data) => write(rangerDansVoyage(voyage, tacheIds, data).writes);
export const affecter = (tacheId, voyageId, data) => write(affecterTache(tacheId, voyageId, data));

/** Renomme / redate un déplacement ; la date est reportée sur ses interventions. */
export async function updateVoyage(voyage, { nom, date_debut }, data) {
  const its = interventionsDuVoyage(voyage.id, data);
  const writes = its.map((i) => ({ table: 'deplacements', row: { id: i.id, date_debut: date_debut || null } }));
  if (voyage.virtuel) writes.push({ table: 'deplacements', row: { id: voyage.id, nom } });
  else writes.push({ table: 'voyages', row: { id: voyage.id, nom, date_debut: date_debut || null } });
  await write(writes);
}

/** Supprime un déplacement et ses interventions ; les tâches restent dans la liste générale. */
export async function deleteVoyage(voyage, data) {
  for (const i of interventionsDuVoyage(voyage.id, data)) await deleteIntervention(i, data);
  if (!voyage.virtuel) await remove('voyages', voyage.id);
}

/** Démarre (ou remet en préparation) toutes les interventions ouvertes d'un déplacement. */

/** Inclure / exclure un commentaire ou une photo du rapport. */
export const setDansRapport = (table, id, dans_rapport) => update(table, id, { dans_rapport });

// ---------- Interventions ----------

export const updateIntervention = (id, patch) => update('deplacements', id, patch);
export const createIntervention = (nom, date_debut) => insert('deplacements', { nom, date_debut: date_debut || null, statut: 'en_preparation' });
export const addTachesToIntervention = (interventionId, tacheIds, data) => write(ajouterTaches(interventionId, tacheIds, data));
export const removeTacheFromIntervention = (interventionId, tacheId, data) => write(retirerTache(interventionId, tacheId, data));
/** Retrait d'une tâche de l'intervention (croix bleue ou glissement partiel), annulable. La tâche reste dans la liste. */
export const retirerTacheAnnulable = (interventionId, tache, data) => avecAnnulation(retirerTache(interventionId, tache.id, data), `« ${tache.titre} » retirée de l'intervention`);
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
    // Les photos sont rangées dans le dossier du compte (règle de sécurité du stockage).
    const chemin = `${espaceId() ?? 'local'}/${intervention ?? 'sans-intervention'}/${photoId}.jpg`;
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

function ecrituresSuppressionArticle(article, data) {
  const links = data.tache_articles.filter((l) => l.article_id === article.id);
  const prises = data.prise_articles.filter((p) => p.article_id === article.id);
  const accs = data.article_accessoires.filter((x) => x.article_id === article.id || x.accessoire_id === article.id);
  return [
    ...accs.map((x) => ({ table: 'article_accessoires', row: { id: x.id, deleted: true } })),
    { table: 'articles', row: { id: article.id, deleted: true } },
    ...links.map((l) => ({ table: 'tache_articles', row: { id: l.id, deleted: true } })),
    ...prises.map((p) => ({ table: 'prise_articles', row: { id: p.id, deleted: true } })),
  ];
}

export async function deleteArticle(article, data) {
  await write(ecrituresSuppressionArticle(article, data));
}

/** Suppression d'un article depuis le catalogue (croix rouge ou glissement), annulable. */
export const supprimerArticle = (article, data) => avecAnnulation(ecrituresSuppressionArticle(article, data), `« ${article.nom} » supprimé du catalogue`);

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


// ---------- Nouveau compte : catégories de départ et reprise du catalogue partagé ----------

/** Catalogue que l'administrateur propose aux nouveaux comptes (articles, accessoires, tâches types). */
export async function chargerCatalogue() {
  const { data, error } = await supabase.rpc('catalogue_partage');
  if (error) {
    throw new Error(error.code === 'PGRST202' ? "Le catalogue partagé n'est pas encore disponible (la base doit être mise à jour)." : error.message);
  }
  if (!data) throw new Error("Aucun catalogue n'est partagé pour l'instant.");
  return data;
}

const ligneLocale = (data) => ({ articles: data.articles, categories: data.categories, taches: data.taches });

/** Reprend une partie du catalogue partagé dans son propre catalogue. */
export async function importerCatalogue(catalogue, choix, data) {
  const { writes, stats } = planImport(catalogue, choix, ligneLocale(data));
  await write(writes);
  return stats;
}

/** Premier démarrage : catégories par défaut, et reprise éventuelle d'une partie du catalogue. */
export async function terminerBienvenue(catalogue, choix, data) {
  const depart = categoriesDeDepart(espaceId(), data.categories);
  const writes = [...depart];
  let stats = null;
  if (catalogue && choix) {
    const plan = planImport(catalogue, choix, { ...ligneLocale(data), categories: [...data.categories, ...depart.map((w) => w.row)] });
    writes.push(...plan.writes);
    stats = plan.stats;
  }
  await write(writes);
  await db.meta.put({ key: 'onboarding', value: 'fait' });
  return stats;
}
