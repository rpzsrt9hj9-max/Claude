// Tâches types : report des modifications d'un modèle sur les tâches ouvertes créées à partir de lui.

import { tacheArticleId } from './schema.js';
import { estTerminee, lignesDescription } from './interventions.js';
import { nameKey } from './match.js';

/** Tâches ouvertes issues d'un modèle (lien modele_id, ou même titre pour les anciennes tâches). */
export function tachesDuModele(modele, data) {
  const cle = nameKey(modele.titre);
  return data.taches.filter(
    (t) => !t.modele && !estTerminee(t) && (t.modele_id === modele.id || (!t.modele_id && nameKey(t.titre) === cle)),
  );
}

const etapes = (description) => lignesDescription(description).filter((l) => l.type === 'case').map((l) => l.texte.trim());

/**
 * Différence entre l'ancienne et la nouvelle version d'un modèle.
 * liens = [{ article_id, quantite }]
 */
export function diffModele(avant, apres) {
  const av = new Map(avant.liens.map((l) => [l.article_id, Number(l.quantite) || 0]));
  const ap = new Map(apres.liens.map((l) => [l.article_id, Number(l.quantite) || 0]));
  const ajouts = [...ap].filter(([id]) => !av.has(id)).map(([article_id, quantite]) => ({ article_id, quantite }));
  const retraits = [...av.keys()].filter((id) => !ap.has(id));
  const quantites = [...ap].filter(([id, q]) => av.has(id) && av.get(id) !== q).map(([article_id, quantite]) => ({ article_id, quantite }));
  const avantEtapes = new Set(etapes(avant.description).map(nameKey));
  const nouvellesEtapes = etapes(apres.description).filter((e) => !avantEtapes.has(nameKey(e)));
  const vide = !ajouts.length && !retraits.length && !quantites.length && !nouvellesEtapes.length;
  return { ajouts, retraits, quantites, etapes: nouvellesEtapes, vide };
}

/** Écritures pour reporter une différence de modèle sur une tâche (cases déjà cochées et commentaires intacts). */
export function reporterSurTache(tache, diff, data, modeleId) {
  const writes = [];
  const liens = data.tache_articles.filter((l) => l.tache_id === tache.id);
  const deja = new Map(liens.map((l) => [l.article_id, l]));
  for (const a of diff.ajouts) {
    if (!deja.has(a.article_id)) {
      writes.push({ table: 'tache_articles', row: { id: tacheArticleId(tache.id, a.article_id), tache_id: tache.id, article_id: a.article_id, quantite: a.quantite, deleted: false } });
    }
  }
  for (const id of diff.retraits) {
    if (deja.has(id)) writes.push({ table: 'tache_articles', row: { id: deja.get(id).id, deleted: true } });
  }
  for (const q of diff.quantites) {
    if (deja.has(q.article_id)) writes.push({ table: 'tache_articles', row: { id: deja.get(q.article_id).id, quantite: q.quantite } });
  }
  const presentes = new Set(etapes(tache.description).map(nameKey));
  const aAjouter = diff.etapes.filter((e) => !presentes.has(nameKey(e)));
  const row = {};
  if (aAjouter.length) {
    const base = (tache.description || '').replace(/\s+$/, '');
    row.description = [base, ...aAjouter.map((e) => `- [ ] ${e}`)].filter(Boolean).join('\n');
  }
  // Une ancienne tâche reconnue par son titre est désormais rattachée au modèle.
  if (!tache.modele_id && modeleId) row.modele_id = modeleId;
  if (Object.keys(row).length) writes.push({ table: 'taches', row: { id: tache.id, ...row } });
  return writes;
}
