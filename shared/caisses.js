// Caisses de rangement d'un déplacement : une caisse par combinaison de biens (« Pasteur », « Pasteur + Mulot »…).
// Règle : outillage, accessoires, consommables et basiques vont dans la caisse commune des biens qui les utilisent ;
// le matériel est réparti par bien. Réglage par article (caisse_mode) : auto | commun | reparti.
// Les affaires liées au déplacement lui-même (aucune tâche) vont dans la caisse « Déplacement ».
// Des caisses peuvent être fusionnées (voyage.caisses = [[clé, clé…], …]).

export const MODES_CAISSE = [
  ['auto', 'Automatique'],
  ['commun', 'Toujours en commun'],
  ['reparti', 'Toujours réparti par bien'],
];
export const CLE_DEPLACEMENT = 'deplacement';

export function modeCaisse(article) {
  if (article.caisse_mode === 'commun' || article.caisse_mode === 'reparti') return article.caisse_mode;
  return article.type === 'materiel' && !article.kit ? 'reparti' : 'commun';
}

/** Fusions mémorisées sur le déplacement (texte JSON), toujours un tableau de tableaux de clés. */
export function lireFusions(voyage) {
  try {
    const v = JSON.parse(voyage?.caisses || '[]');
    return Array.isArray(v) ? v.filter((g) => Array.isArray(g) && g.length > 1) : [];
  } catch {
    return [];
  }
}

/**
 * items : trip.items (avec usages [{ tache, quantite }] ; tache vide = affaire du déplacement).
 * Renvoie { caisses: [{ cle, nom, biens, lignes: [{ article, quantite }] }], parArticle: Map(articleId -> [{ cle, nom, quantite }]) }
 */
export function calculerCaisses(items, data, fusions = []) {
  const nomBien = (id) => data.appartements.find((a) => a.id === id)?.nom ?? 'Sans bien';
  const cleDe = (biens) => (biens.length ? [...biens].sort().join('+') : CLE_DEPLACEMENT);
  const fusionDe = new Map();
  for (const g of fusions) for (const c of g) fusionDe.set(c, g.join('|'));
  const map = new Map();
  const ajouter = (biens, article, quantite) => {
    const base = cleDe(biens);
    const cle = fusionDe.get(base) ?? base;
    if (!map.has(cle)) map.set(cle, { cle, membres: new Set(), lignes: [] });
    const c = map.get(cle);
    c.membres.add(base);
    const l = c.lignes.find((x) => x.article.id === article.id);
    if (l) l.quantite += quantite;
    else c.lignes.push({ article, quantite });
  };

  for (const item of items) {
    const parBien = new Map();
    for (const u of item.usages) {
      const b = u.tache ? u.tache.appartement_id || '' : CLE_DEPLACEMENT;
      if (!parBien.has(b)) parBien.set(b, []);
      parBien.get(b).push(Number(u.quantite) || 0);
    }
    const biens = [...parBien.keys()].filter((b) => b !== CLE_DEPLACEMENT);
    const duDeplacement = parBien.has(CLE_DEPLACEMENT);
    if (modeCaisse(item.article) === 'reparti' && parBien.size > 1) {
      const somme = (qs) => (item.article.cumul_quantites ? qs.reduce((t, q) => t + q, 0) : Math.max(...qs));
      for (const [b, qs] of parBien) ajouter(b === CLE_DEPLACEMENT ? [] : [b], item.article, somme(qs));
    } else {
      // Affaire seulement du déplacement : caisse « Déplacement » ; sinon caisse commune des biens.
      ajouter(biens.length ? biens : duDeplacement ? [] : [''], item.article, item.total);
    }
  }

  const nomCle = (cle) => (cle === CLE_DEPLACEMENT ? 'Déplacement' : cle.split('+').map(nomBien).join(' + '));
  const caisses = [...map.values()].map((c) => {
    const membres = [...c.membres].sort();
    const biens = [...new Set(membres.flatMap((m) => (m === CLE_DEPLACEMENT ? [] : m.split('+'))))];
    return { cle: c.cle, membres, nom: membres.map(nomCle).join(' · '), biens, lignes: c.lignes.sort((a, b) => a.article.nom.localeCompare(b.article.nom, 'fr')) };
  });
  // Caisses d'un seul bien d'abord, puis les communes (de la plus petite à la plus grande), « Déplacement » à la fin.
  const poids = (c) => (c.cle === CLE_DEPLACEMENT ? 99 : c.biens.length);
  caisses.sort((a, b) => poids(a) - poids(b) || a.nom.localeCompare(b.nom, 'fr'));
  const parArticle = new Map();
  for (const c of caisses) for (const l of c.lignes) {
    if (!parArticle.has(l.article.id)) parArticle.set(l.article.id, []);
    parArticle.get(l.article.id).push({ cle: c.cle, nom: c.nom, quantite: l.quantite });
  }
  return { caisses, parArticle };
}

/** Fusionne deux caisses (clés de calculerCaisses, éventuellement déjà fusionnées). */
export function fusionner(fusions, cleA, cleB) {
  const membres = (cle) => cle.split('|');
  const nouvelles = fusions.filter((g) => !g.some((c) => membres(cleA).includes(c) || membres(cleB).includes(c)));
  return [...nouvelles, [...new Set([...membres(cleA), ...membres(cleB)])].sort()];
}

/** Sépare une caisse fusionnée en ses caisses d'origine. */
export const separer = (fusions, cle) => fusions.filter((g) => g.join('|') !== cle);
