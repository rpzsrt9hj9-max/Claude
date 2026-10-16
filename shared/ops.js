// Opérations composées : fusion d'articles, duplication de déplacement.
// Elles retournent une liste d'écritures { table, row } (row complet ou partiel avec id),
// appliquées ensuite par le client ; elles ne touchent jamais directement la base.

import { tacheArticleId, priseId, accessoireId, uuid } from './schema.js';

/**
 * Fusionne l'article `dropId` dans `keepId` : liaisons de tâches et états « pris » reportés,
 * puis l'article en double est supprimé.
 * data = { articles, tache_articles, prise_articles } (lignes non supprimées)
 */
export function mergeArticles(keepId, dropId, data) {
  if (keepId === dropId) throw new Error('Choisis deux articles différents.');
  const keep = data.articles.find((a) => a.id === keepId);
  const drop = data.articles.find((a) => a.id === dropId);
  if (!keep || !drop) throw new Error('Article introuvable.');
  const writes = [];

  if (!keep.lieu_id && drop.lieu_id) writes.push({ table: 'articles', row: { id: keep.id, lieu_id: drop.lieu_id } });
  if (!keep.unite && drop.unite) writes.push({ table: 'articles', row: { id: keep.id, unite: drop.unite } });
  if (drop.notes && drop.notes !== keep.notes) {
    const notes = [keep.notes, drop.notes].filter(Boolean).join('\n');
    writes.push({ table: 'articles', row: { id: keep.id, notes } });
  }

  // Liaisons tâche ↔ article
  const keepLinks = new Map(data.tache_articles.filter((l) => l.article_id === keepId).map((l) => [l.tache_id, l]));
  for (const link of data.tache_articles.filter((l) => l.article_id === dropId)) {
    writes.push({ table: 'tache_articles', row: { id: link.id, deleted: true } });
    const existing = keepLinks.get(link.tache_id);
    if (existing) {
      writes.push({
        table: 'tache_articles',
        row: { id: existing.id, quantite: (Number(existing.quantite) || 0) + (Number(link.quantite) || 0) },
      });
    } else {
      writes.push({
        table: 'tache_articles',
        row: { id: tacheArticleId(link.tache_id, keepId), tache_id: link.tache_id, article_id: keepId, quantite: link.quantite, deleted: false },
      });
    }
  }

  // États « pris »
  const keepPrises = new Map(data.prise_articles.filter((p) => p.article_id === keepId).map((p) => [p.deplacement_id, p]));
  for (const p of data.prise_articles.filter((x) => x.article_id === dropId)) {
    writes.push({ table: 'prise_articles', row: { id: p.id, deleted: true } });
    const existing = keepPrises.get(p.deplacement_id);
    if (existing) {
      const qp = existing.quantite_prise == null && p.quantite_prise == null
        ? null
        : (Number(existing.quantite_prise) || 0) + (Number(p.quantite_prise) || 0);
      writes.push({ table: 'prise_articles', row: { id: existing.id, pris: !!(existing.pris || p.pris), quantite_prise: qp } });
    } else {
      writes.push({
        table: 'prise_articles',
        row: { id: priseId(p.deplacement_id, keepId), deplacement_id: p.deplacement_id, article_id: keepId, pris: p.pris, quantite_prise: p.quantite_prise, deleted: false },
      });
    }
  }

  // Accessoires : ceux du doublon passent sur l'article conservé, et il devient l'accessoire des autres outils
  const accs = data.article_accessoires || [];
  const existingAcc = new Set(accs.filter((x) => x.article_id === keepId).map((x) => x.accessoire_id));
  const existingParents = new Set(accs.filter((x) => x.accessoire_id === keepId).map((x) => x.article_id));
  for (const a of accs.filter((x) => x.article_id === dropId || x.accessoire_id === dropId)) {
    writes.push({ table: 'article_accessoires', row: { id: a.id, deleted: true } });
    const parent = a.article_id === dropId ? keepId : a.article_id;
    const child = a.accessoire_id === dropId ? keepId : a.accessoire_id;
    if (parent === child) continue;
    if (parent === keepId ? existingAcc.has(child) : existingParents.has(parent)) continue;
    writes.push({ table: 'article_accessoires', row: { id: accessoireId(parent, child), article_id: parent, accessoire_id: child, quantite: a.quantite, deleted: false } });
    if (parent === keepId) existingAcc.add(child);
    else existingParents.add(parent);
  }

  writes.push({ table: 'articles', row: { id: dropId, deleted: true } });
  return writes;
}

/**
 * Copie une tâche et ses articles (dupliquer une tâche, enregistrer comme tâche type,
 * créer une tâche à partir d'une tâche type).
 * overrides : { deplacement_id, modele, titre, appartement_id, ordre }
 */
export function copyTache(tache, links, overrides = {}) {
  const id = uuid();
  const writes = [
    {
      table: 'taches',
      row: {
        id,
        deplacement_id: tache.deplacement_id ?? null,
        titre: tache.titre,
        description: tache.description ?? null,
        appartement_id: tache.appartement_id ?? null,
        ordre: tache.ordre ?? 0,
        modele: !!tache.modele,
        ...overrides,
        fait: false,
        deleted: false,
      },
    },
  ];
  for (const l of links) {
    writes.push({ table: 'tache_articles', row: { id: tacheArticleId(id, l.article_id), tache_id: id, article_id: l.article_id, quantite: l.quantite, deleted: false } });
  }
  return { id, writes };
}

/** Accessoires à proposer quand on ajoute un article à une tâche (hors ceux déjà présents). */
export function accessoiresFor(articleId, data, alreadyLinked = new Set()) {
  const byId = new Map(data.articles.map((a) => [a.id, a]));
  return (data.article_accessoires || [])
    .filter((x) => x.article_id === articleId && !alreadyLinked.has(x.accessoire_id) && byId.has(x.accessoire_id))
    .map((x) => ({ article: byId.get(x.accessoire_id), quantite: Number(x.quantite) || 1 }))
    .sort((a, b) => a.article.nom.localeCompare(b.article.nom, 'fr'));
}

/**
 * Duplique un déplacement : tâches et liaisons copiées, « fait » et « pris » remis à zéro.
 */
export function duplicateTrip(deplacementId, data, { nom, date_debut = null }) {
  const writes = [];
  const newDepId = uuid();
  writes.push({ table: 'deplacements', row: { id: newDepId, nom, date_debut, statut: 'en_preparation', deleted: false } });
  const taches = data.taches.filter((t) => t.deplacement_id === deplacementId && !t.modele);
  for (const t of taches) {
    const newId = uuid();
    writes.push({
      table: 'taches',
      row: { id: newId, deplacement_id: newDepId, titre: t.titre, description: t.description, appartement_id: t.appartement_id, fait: false, ordre: t.ordre, deleted: false },
    });
    for (const l of data.tache_articles.filter((x) => x.tache_id === t.id)) {
      writes.push({
        table: 'tache_articles',
        row: { id: tacheArticleId(newId, l.article_id), tache_id: newId, article_id: l.article_id, quantite: l.quantite, deleted: false },
      });
    }
  }
  return { id: newDepId, writes };
}

/** Applique des écritures sur des tableaux en mémoire (utilisé par les tests). */
export function applyWrites(data, writes) {
  const out = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  for (const { table, row } of writes) {
    out[table] ||= [];
    const i = out[table].findIndex((r) => r.id === row.id);
    if (i >= 0) out[table][i] = { ...out[table][i], ...row };
    else out[table].push({ ...row });
  }
  for (const k of Object.keys(out)) out[k] = out[k].filter((r) => !r.deleted);
  return out;
}
