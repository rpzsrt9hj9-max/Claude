// Modèle de données commun à la base Supabase et au client (IndexedDB).
// Chaque table a aussi : id, created_at, updated_at, deleted (suppression logique pour la synchro).

export const TABLES = {
  lieux: ['nom'],
  appartements: ['nom'],
  categories: ['nom'],
  articles: ['nom', 'type', 'lieu_id', 'categorie_id', 'notes', 'unite', 'cumul_quantites'],
  // Accessoires proposés avec un article (ex. meuleuse -> disques à meuler, batterie)
  article_accessoires: ['article_id', 'accessoire_id', 'quantite'],
  // Interventions (nom historique de la table : « deplacements ») ; date_debut = date d'intervention.
  deplacements: ['nom', 'date_debut', 'statut'],
  // Liste générale des tâches. Une tâche type (modèle) a modele = true.
  // statut : a_traiter | reportee | terminee ; echeance : AAAA-MM-JJ.
  // deplacement_id et fait : anciens champs, conservés pour les données existantes.
  taches: ['deplacement_id', 'titre', 'description', 'appartement_id', 'fait', 'ordre', 'modele', 'statut', 'echeance'],
  tache_articles: ['tache_id', 'article_id', 'quantite'],
  prise_articles: ['deplacement_id', 'article_id', 'pris', 'quantite_prise'],
  // Tâches d'une intervention (gardé après clôture : historique). resultat = statut donné à la clôture.
  intervention_taches: ['intervention_id', 'tache_id', 'resultat', 'ordre'],
  // Commentaires horodatés (created_at) : d'une tâche (tache_id) ou du compte rendu (tache_id vide).
  // intervention_id = intervention ouverte au moment du commentaire.
  commentaires: ['tache_id', 'intervention_id', 'texte', 'auteur'],
  // Photos jointes à un commentaire ; le fichier est dans le bucket Supabase Storage « photos ».
  photos: ['commentaire_id', 'chemin', 'legende'],
};

export const TABLE_NAMES = Object.keys(TABLES);

// Champs booléens et numériques (pour la génération du schéma SQL)
export const BOOL_FIELDS = new Set(['cumul_quantites', 'fait', 'pris', 'deleted', 'modele']);
export const REAL_FIELDS = new Set(['quantite', 'quantite_prise', 'ordre']);

export const STATUTS = {
  en_preparation: 'En préparation',
  en_cours: 'En cours',
  termine: 'Terminée',
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
export const interventionTacheId = (interventionId, tacheId) => `${interventionId}~${tacheId}`;

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
