// Catalogue de départ d'un nouveau compte : catégories par défaut, et reprise choisie d'une partie
// du catalogue partagé par l'administrateur (articles, accessoires, tâches types).

import { nameKey } from './match.js';
import { DEFAULT_CATEGORIES } from './categories.js';
import { tacheArticleId, accessoireId, uuid } from './schema.js';
import { decocherTout } from './interventions.js';

/**
 * Catégories de départ. Identifiants fixes par compte : si deux appareils démarrent en même temps,
 * ils écrivent les mêmes lignes (pas de doublons).
 */
export function categoriesDeDepart(espaceId, existantes = []) {
  const deja = new Set(existantes.map((c) => nameKey(c.nom)));
  const suffixe = String(espaceId).replace(/[^a-z0-9]/gi, '').slice(0, 8);
  return DEFAULT_CATEGORIES.filter((nom) => !deja.has(nameKey(nom))).map((nom) => ({
    table: 'categories',
    row: { id: `cat-${suffixe}-${nameKey(nom)}`, nom, deleted: false },
  }));
}

/**
 * Sélection complète à partir de coches : une tâche type entraîne ses articles,
 * un article entraîne ses accessoires (qu'on peut ensuite décocher).
 * choix = { articles: Set(id), modeles: Set(id) }
 */
export function etendreSelection(catalogue, choix, { avecAccessoires = true } = {}) {
  const articles = new Set(choix.articles);
  for (const m of catalogue.modeles) {
    if (choix.modeles.has(m.id)) for (const b of m.besoins) articles.add(b.article_id);
  }
  if (avecAccessoires) {
    for (const l of catalogue.accessoires) if (articles.has(l.article_id)) articles.add(l.accessoire_id);
  }
  return articles;
}

/** Accessoires d'un article du catalogue partagé. */
export const accessoiresDe = (catalogue, articleId) => catalogue.accessoires.filter((l) => l.article_id === articleId).map((l) => l.accessoire_id);

/**
 * Écritures pour reprendre une partie du catalogue partagé.
 * - un article déjà présent (même nom) n'est pas dupliqué : on réutilise le sien ;
 * - lieu et notes ne sont jamais repris ;
 * - une tâche type de même titre est ignorée.
 * local = { articles, categories, taches (avec modele = true) } lignes non supprimées du compte.
 * Renvoie { writes, stats }.
 */
export function planImport(catalogue, choix, local) {
  const writes = [];
  const stats = { articles: 0, dejaPresents: 0, categories: 0, modeles: 0, modelesIgnores: 0 };
  const articlesChoisis = etendreSelection(catalogue, choix, { avecAccessoires: false });
  for (const id of choix.articles) articlesChoisis.add(id);

  // Catégories : par nom, créées à la demande
  const catParNom = new Map(local.categories.map((c) => [nameKey(c.nom), c.id]));
  const catSource = new Map(catalogue.categories.map((c) => [c.id, c.nom]));
  const categorieLocale = (idSource) => {
    const nom = catSource.get(idSource);
    if (!nom) return null;
    const cle = nameKey(nom);
    if (!catParNom.has(cle)) {
      const id = uuid();
      catParNom.set(cle, id);
      writes.push({ table: 'categories', row: { id, nom, deleted: false } });
      stats.categories++;
    }
    return catParNom.get(cle);
  };

  // Articles : id source -> id local
  const articleLocal = new Map();
  const localParNom = new Map(local.articles.map((a) => [nameKey(a.nom), a.id]));
  for (const a of catalogue.articles) {
    if (!articlesChoisis.has(a.id)) continue;
    const cle = nameKey(a.nom);
    if (localParNom.has(cle)) {
      articleLocal.set(a.id, localParNom.get(cle));
      stats.dejaPresents++;
      continue;
    }
    const id = uuid();
    articleLocal.set(a.id, id);
    localParNom.set(cle, id);
    writes.push({
      table: 'articles',
      row: { id, nom: a.nom, type: a.type, lieu_id: null, categorie_id: categorieLocale(a.categorie_id), notes: null, unite: a.unite ?? null, cumul_quantites: !!a.cumul_quantites, deleted: false },
    });
    stats.articles++;
  }

  // Accessoires entre articles repris
  for (const l of catalogue.accessoires) {
    const parent = articleLocal.get(l.article_id);
    const enfant = articleLocal.get(l.accessoire_id);
    if (parent && enfant && parent !== enfant) {
      writes.push({ table: 'article_accessoires', row: { id: accessoireId(parent, enfant), article_id: parent, accessoire_id: enfant, quantite: l.quantite ?? 1, deleted: false } });
    }
  }

  // Tâches types
  const titresLocaux = new Set(local.taches.filter((t) => t.modele).map((t) => nameKey(t.titre)));
  for (const m of catalogue.modeles) {
    if (!choix.modeles.has(m.id)) continue;
    if (titresLocaux.has(nameKey(m.titre))) {
      stats.modelesIgnores++;
      continue;
    }
    const id = uuid();
    writes.push({
      table: 'taches',
      row: { id, titre: m.titre, description: decocherTout(m.description) || null, appartement_id: null, deplacement_id: null, ordre: 0, modele: true, statut: null, echeance: null, fait: false, deleted: false },
    });
    for (const b of m.besoins) {
      const art = articleLocal.get(b.article_id);
      if (art) writes.push({ table: 'tache_articles', row: { id: tacheArticleId(id, art), tache_id: id, article_id: art, quantite: b.quantite ?? 1, deleted: false } });
    }
    stats.modeles++;
  }
  return { writes, stats };
}
