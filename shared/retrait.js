// « Je ne le prends finalement pas » : retirer un article de la liste à prendre d'un déplacement.
// L'article est retiré des tâches qui l'utilisent (et des affaires du déplacement) ; les tâches types
// concernées ne sont modifiées que si l'utilisateur le confirme, une par une.

import { tacheArticleId, voyageArticleId } from './schema.js';

/**
 * item : élément de computeTrip (usages [{ tache, quantite }]) ; voyageId : déplacement.
 * Renvoie { groupes: [{ bien, taches: [titre] }], duDeplacement, modeles: [{ modele, taches }], writes, writesModele(id) }.
 */
export function planRetrait(item, voyageId, data) {
  const articleId = item.article.id;
  const taches = [...new Map(item.usages.filter((u) => u.tache).map((u) => [u.tache.id, u.tache])).values()];
  const nomBien = (id) => data.appartements.find((a) => a.id === id)?.nom ?? 'Sans bien';
  const parBien = new Map();
  for (const t of taches) {
    const b = nomBien(t.appartement_id);
    if (!parBien.has(b)) parBien.set(b, []);
    parBien.get(b).push(t.titre);
  }
  const groupes = [...parBien.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr')).map(([bien, titres]) => ({ bien, taches: titres.sort((x, y) => x.localeCompare(y, 'fr')) }));
  const duDeplacement = item.usages.some((u) => u.voyage);

  const liens = (data.tache_articles || []).filter((l) => l.article_id === articleId && taches.some((t) => t.id === l.tache_id));
  const writes = liens.map((l) => ({ table: 'tache_articles', row: { id: l.id, deleted: true } }));
  if (duDeplacement) writes.push({ table: 'voyage_articles', row: { id: voyageArticleId(voyageId, articleId), deleted: true } });

  // Tâches types d'où viennent ces tâches et qui contiennent encore l'article.
  const modeles = new Map();
  for (const t of taches) {
    const m = t.modele_id && data.taches.find((x) => x.id === t.modele_id && x.modele);
    if (!m || !(data.tache_articles || []).some((l) => l.tache_id === m.id && l.article_id === articleId)) continue;
    if (!modeles.has(m.id)) modeles.set(m.id, { modele: m, taches: [] });
    modeles.get(m.id).taches.push(t.titre);
  }
  const writesModele = (modeleId) => {
    const l = (data.tache_articles || []).find((x) => x.tache_id === modeleId && x.article_id === articleId);
    return [{ table: 'tache_articles', row: { id: l?.id ?? tacheArticleId(modeleId, articleId), deleted: true } }];
  };
  return { groupes, duDeplacement, modeles: [...modeles.values()], writes, writesModele };
}

/** Texte de la fenêtre de confirmation, tâches regroupées par bien. */
export function texteRetrait(item, plan) {
  const lignes = plan.groupes.map((g) => `🏠 ${g.bien}\n${g.taches.map((t) => `   • ${t}`).join('\n')}`);
  if (plan.duDeplacement) lignes.push('🚐 Affaires du déplacement');
  return `Attention, « ${item.article.nom} » est utilisé pour :\n\n${lignes.join('\n\n')}\n\nÊtes-vous sûr de vouloir l'enlever ?`;
}
