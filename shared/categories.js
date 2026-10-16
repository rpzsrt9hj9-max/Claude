// Suggestion automatique de catégorie à partir du nom d'un article.
import { normalize, findSimilar, nameKey } from './match.js';

// Catégories proposées au départ (modifiables dans l'appli).
export const DEFAULT_CATEGORIES = [
  'Abrasifs', 'Atelier', 'Batteries et charge', 'Bois et finition', 'Clés', 'Électroportatif',
  'Forets et embouts', 'Jardin', 'Joints et étanchéité', 'Lames', 'Linge', 'Mesure et traçage',
  'Nettoyage', 'Outillage à main', 'Peinture', 'Plomberie', 'Protection et masquage',
  'Quincaillerie et visserie', 'Revêtement de sol',
];

// Règles testées dans l'ordre ; la première qui correspond l'emporte.
// types : limite la règle à certains types d'articles (sinon tous).
const RULES = [
  ['Batteries et charge', ['batterie', 'chargeur']],
  ['Abrasifs', ['papier a poncer', 'abrasif', 'disque', 'patin', 'toile emeri']],
  ['Forets et embouts', ['foret', 'meche', 'embout', 'scie cloche', 'trepan']],
  ['Lames', ['lame de cutter', 'lames de cutter', 'lame de scie', 'lames de scie']],
  ['Peinture', ['peinture', 'pinceau', 'rouleau', 'manchon de rouleau', 'manchons de rouleau', 'bac a peinture', 'sous couche', 'enduit', 'mini rouleau']],
  ['Bois et finition', ['huile', 'vernis', 'lasure', 'cire', 'vitrificateur']],
  ['Protection et masquage', ['bache', 'masquage', 'scotch', 'gant', 'masque', 'lunette', 'protection', 'genouillere']],
  ['Jardin', ['dechet vert', 'dechets verts', 'souffleur', 'rateau', 'secateur', 'tondeuse', 'raclette', 'jardin', 'feuille']],
  ['Revêtement de sol', ['lame pvc', 'lames pvc', 'parquet', 'plinthe', 'carrelage', 'sous couche sol']],
  ['Joints et étanchéité', ['silicone', 'mastic', 'cartouche', 'joint', 'colle']],
  ['Plomberie', ['bouchon', 'pvc', 'raccord', 'siphon', 'tube', 'robinet', 'flexible', 'deboucheur', 'ventouse', 'plomberie']],
  ['Nettoyage', ['microfibre', 'sopalin', 'nettoyant', 'vinaigre', 'chiffon', 'seau', 'eponge', 'balai', 'serpilliere', 'javel', 'brosse', 'aspirateur', 'lessive', 'degraissant']],
  ['Linge', ['drap', 'housse', 'taie', 'serviette', 'couette', 'linge', 'oreiller']],
  ['Mesure et traçage', ['metre', 'equerre', 'crayon', 'niveau', 'laser', 'cordeau']],
  ['Atelier', ['treteau', 'treteaux', 'etabli', 'serre joint', 'escabeau', 'echelle', 'rallonge electrique', 'enrouleur']],
  ['Électroportatif', ['perceuse', 'perforateur', 'visseuse', 'meuleuse', 'ponceuse', 'scie sauteuse', 'scie circulaire', 'decapeur thermique', 'multifonction']],
  ['Quincaillerie et visserie', ['vis', 'cheville', 'boulon', 'ecrou', 'clou', 'rondelle', 'serrure', 'charniere', 'crochet', 'piton', 'poignee', 'cylindre']],
  ['Clés', ['cle', 'cles', 'badge', 'bip']],
  ['Outillage à main', ['cutter', 'marteau', 'tournevis', 'pince', 'pistolet', 'grattoir', 'lame a gratter', 'spatule', 'scie', 'decapeur', 'couteau', 'cle a molette']],
];

const containsPhrase = (text, phrase) => ` ${text} `.includes(` ${phrase} `) || ` ${text} `.includes(` ${phrase}s `);

/** Nom de catégorie suggéré par les règles, ou null. */
export function ruleCategory(nom) {
  const t = normalize(nom);
  for (const [cat, words] of RULES) if (words.some((w) => containsPhrase(t, w))) return cat;
  return null;
}

/**
 * Catégorie suggérée (objet catégorie existant ou null) :
 * d'abord celle d'un article très ressemblant déjà classé, sinon les règles par mots-clés.
 */
export function suggestCategorie(nom, { categories, articles = [] }) {
  if (!nom?.trim()) return null;
  const similar = findSimilar(nom, articles.filter((a) => a.categorie_id), 1)[0];
  if (similar && similar.score >= 0.75) {
    const c = categories.find((x) => x.id === similar.article.categorie_id);
    if (c) return c;
  }
  const name = ruleCategory(nom);
  return name ? categories.find((c) => nameKey(c.nom) === nameKey(name)) ?? null : null;
}
