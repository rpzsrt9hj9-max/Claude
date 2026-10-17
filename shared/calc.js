// Règles de calcul : quantités à prendre, état « pris », tâches « prêtes ».
// Rien de tout cela n'est saisi à la main : tout est recalculé à partir des données.
import { tachesIntervention } from './interventions.js';
import { estBatterie, quantiteBatterie } from './accessoires.js';

const round = (n) => Math.round(n * 1000) / 1000;

/** État de prise d'un article pour une quantité totale donnée. */
export function priseStatus(total, prise) {
  const qp = prise?.quantite_prise;
  const pris = (qp ?? (prise?.pris ? total : 0));
  const taken = Math.max(0, Number(pris) || 0);
  let etat = 'vide';
  if (total > 0 && taken >= total) etat = 'complet';
  else if (taken > 0) etat = 'partiel';
  return { taken: round(taken), total: round(total), etat, complet: etat === 'complet' };
}

/**
 * Calcule les quantités et cases cochées d'une liste de tâches.
 * deplacementId = clé des cases « Pris » (déplacement, ou cleSortie(intervention) pour « Sorti »).
 * taches : par défaut, les tâches de l'intervention deplacementId.
 * data = { articles, taches, tache_articles, prise_articles, intervention_taches, lieux } (lignes non supprimées)
 */
export function computeTrip(deplacementId, data, taches = tachesIntervention(deplacementId, data)) {
  const tacheById = new Map(taches.map((t) => [t.id, t]));
  const articleById = new Map(data.articles.map((a) => [a.id, a]));
  const priseByArticle = new Map(
    data.prise_articles.filter((p) => p.deplacement_id === deplacementId).map((p) => [p.article_id, p]),
  );

  // Besoins par article
  const needs = new Map();
  const linksByTache = new Map();
  for (const link of data.tache_articles) {
    const tache = tacheById.get(link.tache_id);
    const article = articleById.get(link.article_id);
    if (!tache || !article) continue;
    if (!linksByTache.has(tache.id)) linksByTache.set(tache.id, []);
    linksByTache.get(tache.id).push(link);
    if (!needs.has(article.id)) needs.set(article.id, { article, usages: [] });
    needs.get(article.id).usages.push({ tache, quantite: Number(link.quantite) || 0 });
  }

  const items = [];
  const liensTaches = data.tache_articles.filter((l) => tacheById.has(l.tache_id));
  for (const need of needs.values()) {
    const qs = need.usages.map((u) => u.quantite);
    // Matériel : on additionne. Outillage : on prend le maximum (une perceuse pour trois tâches).
    // Batteries : une par outil (distinct) qui la propose.
    const total = estBatterie(need.article)
      ? quantiteBatterie(need.article, need.usages, liensTaches, data.article_accessoires || [])
      : need.article.cumul_quantites ? qs.reduce((s, q) => s + q, 0) : Math.max(...qs);
    const prise = priseByArticle.get(need.article.id);
    items.push({ ...need, total: round(total), prise, status: priseStatus(total, prise) });
  }
  items.sort((a, b) => a.article.nom.localeCompare(b.article.nom, 'fr'));
  const itemByArticle = new Map(items.map((i) => [i.article.id, i]));

  const tachesInfo = taches.map((tache) => {
    const links = linksByTache.get(tache.id) || [];
    const byType = { outillage: [], accessoire: [], consommable: [], materiel: [] };
    for (const l of links) {
      const art = articleById.get(l.article_id);
      (byType[art.type] ?? byType.materiel).push({ link: l, article: art, item: itemByArticle.get(art.id) });
    }
    const ready = (list) => list.every((x) => x.item.status.complet);
    const materielPret = ready(byType.materiel);
    const outillagePret = ready(byType.outillage);
    const consommablePret = ready(byType.consommable);
    return {
      tache,
      byType,
      materiel: byType.materiel,
      outillage: byType.outillage,
      consommable: byType.consommable,
      materielPret,
      outillagePret,
      consommablePret,
      accessoire: byType.accessoire,
      prete: materielPret && outillagePret && consommablePret && ready(byType.accessoire),
    };
  });

  const progress = (type) => {
    const list = items.filter((i) => i.article.type === type);
    return { done: list.filter((i) => i.status.complet).length, total: list.length };
  };

  return {
    taches: tachesInfo,
    items,
    progress: { materiel: progress('materiel'), outillage: progress('outillage'), accessoire: progress('accessoire'), consommable: progress('consommable') },
  };
}

/** Regroupe des éléments ({ article }) selon un champ de l'article (lieu_id, categorie_id) ; les « sans » à la fin. */
export function groupBy(items, list, field) {
  const byId = new Map(list.map((l) => [l.id, l]));
  const groups = new Map();
  for (const it of items) {
    const ref = byId.get(it.article[field]);
    const key = ref ? ref.id : '';
    if (!groups.has(key)) groups.set(key, { ref, lieu: ref, items: [] });
    groups.get(key).items.push(it);
  }
  return [...groups.values()].sort((a, b) => {
    if (!a.ref) return 1;
    if (!b.ref) return -1;
    return a.ref.nom.localeCompare(b.ref.nom, 'fr');
  });
}

/** Regroupe des éléments par type (outillage, accessoires, consommables, matériel), puis par lieu dans chaque type. */
export function groupByType(items, lieux, ordre = ['outillage', 'accessoire', 'consommable', 'materiel']) {
  return ordre
    .map((type) => ({ type, items: items.filter((i) => i.article.type === type) }))
    .filter((g) => g.items.length)
    .map((g) => ({ ...g, lieux: groupBy(g.items, lieux, 'lieu_id') }));
}

/** Regroupe des éléments par lieu (les articles sans lieu à la fin). */
export const groupByLieu = (items, lieux) => groupBy(items, lieux, 'lieu_id');

export function formatQty(n, unite) {
  const v = Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
  return unite ? `${v} ${unite}` : v;
}
