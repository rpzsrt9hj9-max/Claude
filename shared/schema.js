// Modèle de données commun à la base Supabase et au client (IndexedDB).
// Chaque table a aussi : id, created_at, updated_at, deleted (suppression logique pour la synchro).

export const TABLES = {
  lieux: ['nom'],
  appartements: ['nom'],
  categories: ['nom'],
  // a_acheter : à acheter (pastille du catalogue) ; achete_le : date d'achat (ms), tant qu'il n'est pas rangé.
  // kit : « basique » (caisse à vérifier) dont le contenu est dans kit_contenus.
  // caisse_mode : auto | commun | reparti (rangement dans les caisses d'un déplacement).
  articles: ['nom', 'type', 'lieu_id', 'categorie_id', 'notes', 'unite', 'cumul_quantites', 'a_acheter', 'achete_le', 'kit', 'caisse_mode'],
  // Contenu d'un basique (kit) : ex. Basique outillage -> visseuse, embouts, cutter…
  kit_contenus: ['kit_id', 'article_id', 'quantite'],
  // « Items à proposer » avec un article (ex. ponceuse -> batterie, peinture -> rouleau, bâche)
  article_accessoires: ['article_id', 'accessoire_id', 'quantite'],
  // Déplacement (voyage) : regroupe une intervention par bien ; porte la liste de chargement.
  // ref : numéro de référence (D-0008), croissant par compte.
  // caisses : regroupements de caisses choisis (JSON : [[clé, clé…], …] = caisses fusionnées).
  voyages: ['nom', 'date_debut', 'ref', 'caisses'],
  // Affaires à prendre liées au déplacement lui-même, pas à une tâche (lunettes de soleil…).
  voyage_articles: ['voyage_id', 'article_id', 'quantite'],
  // Interventions (nom historique de la table : « deplacements ») ; date_debut = date d'intervention.
  // voyage_id = déplacement parent ; appartement_id = bien de l'intervention.
  // nom_perso : nom facultatif choisi par l'utilisateur (« Bien A · rotation locataire ») ; ref : I-0017.
  deplacements: ['nom', 'date_debut', 'statut', 'voyage_id', 'appartement_id', 'nom_perso', 'ref'],
  // Liste générale des tâches. Une tâche type (modèle) a modele = true.
  // statut : a_traiter | en_cours | reportee | terminee ; echeance : AAAA-MM-JJ.
  // deplacement_id et fait : anciens champs, conservés pour les données existantes.
  // modele_id = tâche type d'origine (pour reporter les modifications du modèle).
  // constat_id = intervention dont l'état des lieux a fait naître la tâche (« à prévoir »).
  taches: ['deplacement_id', 'titre', 'description', 'appartement_id', 'fait', 'ordre', 'modele', 'statut', 'echeance', 'modele_id', 'ref', 'constat_id'],
  tache_articles: ['tache_id', 'article_id', 'quantite'],
  prise_articles: ['deplacement_id', 'article_id', 'pris', 'quantite_prise'],
  // Tâches d'une intervention (gardé après clôture : historique). resultat = statut donné à la clôture.
  intervention_taches: ['intervention_id', 'tache_id', 'resultat', 'ordre'],
  // Commentaires horodatés (created_at) : d'une tâche (tache_id) ou du compte rendu (tache_id vide).
  // intervention_id = intervention ouverte au moment du commentaire.
  // dans_rapport = false : exclu du rapport d'intervention (inclus par défaut).
  // genre = 'constat' : note de l'état des lieux de l'intervention (« j'ai vu ça, il y a ça à faire »).
  commentaires: ['tache_id', 'intervention_id', 'texte', 'auteur', 'dans_rapport', 'genre'],
  // Photos jointes à un commentaire ; le fichier est dans le bucket Supabase Storage « photos ».
  photos: ['commentaire_id', 'chemin', 'legende', 'dans_rapport'],
  // Stock : quantité d'un article dans un lieu (une ligne par article et par lieu ; id = article~lieu).
  // L'écran ne gère pour l'instant qu'une quantité, au lieu principal de l'article.
  stocks: ['article_id', 'lieu_id', 'quantite'],
  // Suivi du temps : une période (debut, fin en ms ; fin vide = chrono en cours).
  // activite : trajet | preparation | achats | rangement | tache | etude (plans, devis) | planification.
  // Contexte connu au moment du chrono (pour la répartition à l'affichage) ; contexte = écran (« catalogue »…).
  temps: ['activite', 'debut', 'fin', 'voyage_id', 'intervention_id', 'tache_id', 'appartement_id', 'contexte', 'note'],
};

export const TABLE_NAMES = Object.keys(TABLES);

// Champs booléens et numériques (pour la génération du schéma SQL)
export const BOOL_FIELDS = new Set(['cumul_quantites', 'fait', 'pris', 'deleted', 'modele', 'dans_rapport', 'a_acheter', 'kit']);
export const REAL_FIELDS = new Set(['quantite', 'quantite_prise', 'ordre', 'ref', 'achete_le', 'debut', 'fin']);

// Deux états visibles : « À faire » et « Terminée » (l'ancien « En cours » s'affiche « À faire »).
export const STATUTS = {
  en_preparation: 'À faire',
  en_cours: 'À faire',
  termine: 'Terminée',
};

export const TYPES = { outillage: 'Outillage', accessoire: 'Accessoires', consommable: 'Consommables', materiel: 'Matériel' };
export const TYPE_ICON = { outillage: '🔧', accessoire: '🔋', consommable: '⚙️', materiel: '📦' };
export const TYPE_ORDER = ['outillage', 'accessoire', 'consommable', 'materiel'];
// Outillage et accessoires ne se cumulent pas (une perceuse pour trois tâches) ; matériel et consommables s'additionnent.
// Exception : les batteries, une par outil qui la propose (voir shared/accessoires.js).
export const defaultCumul = (type) => type !== 'outillage' && type !== 'accessoire';

// Identifiants déterministes pour les tables de liaison : deux appareils hors ligne
// qui cochent le même article produisent la même ligne (pas de doublon à la synchro).
export const tacheArticleId = (tacheId, articleId) => `${tacheId}~${articleId}`;
export const accessoireId = (articleId, accessoireIdValue) => `${articleId}~${accessoireIdValue}`;
export const priseId = (deplacementId, articleId) => `${deplacementId}~${articleId}`;
// Cases « Sorti de la voiture » d'une intervention : même table que « Pris », clé distincte.
export const cleSortie = (interventionId) => `sortir~${interventionId}`;
export const stockId = (articleId, lieuId) => `${articleId}~${lieuId ?? 'sans-lieu'}`;
export const interventionTacheId = (interventionId, tacheId) => `${interventionId}~${tacheId}`;
export const kitContenuId = (kitId, articleId) => `${kitId}~${articleId}`;
export const voyageArticleId = (voyageId, articleId) => `${voyageId}~${articleId}`;
// Case « vérifié » d'un élément du contenu d'un basique, dans la table prise_articles.
export const cleKit = (kitId, articleId) => `kit~${kitId}~${articleId}`;

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
