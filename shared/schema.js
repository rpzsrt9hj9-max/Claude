// Modèle de données commun à la base Supabase et au client (IndexedDB).
// Chaque table a aussi : id, created_at, updated_at, deleted (suppression logique pour la synchro).

export const TABLES = {
  lieux: ['nom'],
  appartements: ['nom'],
  categories: ['nom'],
  articles: ['nom', 'type', 'lieu_id', 'categorie_id', 'notes', 'unite', 'cumul_quantites'],
  // Accessoires proposés avec un article (ex. meuleuse -> disques à meuler, batterie)
  article_accessoires: ['article_id', 'accessoire_id', 'quantite'],
  deplacements: ['nom', 'date_debut', 'statut'],
  // Une tâche type (modèle) a modele = true et pas de déplacement.
  taches: ['deplacement_id', 'titre', 'description', 'appartement_id', 'fait', 'ordre', 'modele'],
  tache_articles: ['tache_id', 'article_id', 'quantite'],
  prise_articles: ['deplacement_id', 'article_id', 'pris', 'quantite_prise'],
};

export const TABLE_NAMES = Object.keys(TABLES);

// Champs booléens et numériques (pour la génération du schéma SQL)
export const BOOL_FIELDS = new Set(['cumul_quantites', 'fait', 'pris', 'deleted', 'modele']);
export const REAL_FIELDS = new Set(['quantite', 'quantite_prise', 'ordre']);

export const STATUTS = {
  en_preparation: 'En préparation',
  en_cours: 'En cours',
  termine: 'Terminé',
};

export const TYPES = { outillage: 'Outillage', consommable: 'Consommables', materiel: 'Matériel' };
export const TYPE_ICON = { outillage: '🔧', consommable: '⚙️', materiel: '📦' };
export const TYPE_ORDER = ['outillage', 'consommable', 'materiel'];
// L'outillage ne se cumule pas (une perceuse pour trois tâches) ; matériel et consommables s'additionnent.
export const defaultCumul = (type) => type !== 'outillage';

// Identifiants déterministes pour les tables de liaison : deux appareils hors ligne
// qui cochent le même article produisent la même ligne (pas de doublon à la synchro).
export const tacheArticleId = (tacheId, articleId) => `${tacheId}~${articleId}`;
export const accessoireId = (articleId, accessoireIdValue) => `${articleId}~${accessoireIdValue}`;
export const priseId = (deplacementId, articleId) => `${deplacementId}~${articleId}`;

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
