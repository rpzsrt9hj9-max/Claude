import { describe, it, expect } from 'vitest';
import {
  listeVoyages, interventionsDuVoyage, tachesVoyage, statutVoyage, creerVoyage, rangerDansVoyage, affecterTache, nomIntervention,
} from '../shared/voyages.js';
import { tachesDuModele, diffModele, reporterSurTache } from '../shared/modeles.js';
import { tachesIntervention, planification } from '../shared/interventions.js';
import { computeTrip, groupByType } from '../shared/calc.js';
import { applyWrites } from '../shared/ops.js';
import { cleSortie } from '../shared/schema.js';

function base() {
  return {
    voyages: [],
    deplacements: [{ id: 'OLD', nom: 'Ancienne intervention', statut: 'en_preparation' }],
    appartements: [{ id: 'A', nom: 'Bien A' }, { id: 'B', nom: 'Bien B' }],
    taches: [
      { id: 'a1', titre: 'Vernis', appartement_id: 'A', statut: 'a_traiter' },
      { id: 'a2', titre: 'Joint', appartement_id: 'A', statut: 'a_traiter' },
      { id: 'b1', titre: 'Porte', appartement_id: 'B', statut: 'reportee' },
      { id: 'x', titre: 'Sans bien', statut: 'a_traiter' },
      { id: 'o1', titre: 'Ancienne', appartement_id: 'A', statut: 'a_traiter' },
    ],
    intervention_taches: [{ id: 'OLD~o1', intervention_id: 'OLD', tache_id: 'o1', ordre: 1 }],
    articles: [
      { id: 'pon', nom: 'Ponceuse', type: 'outillage', cumul_quantites: false, lieu_id: 'G' },
      { id: 'abr', nom: 'Abrasif', type: 'consommable', cumul_quantites: true, lieu_id: 'G' },
      { id: 'vis', nom: 'Vis', type: 'materiel', cumul_quantites: true },
    ],
    lieux: [{ id: 'G', nom: 'Garage' }],
    tache_articles: [
      { id: 'a1~pon', tache_id: 'a1', article_id: 'pon', quantite: 1 },
      { id: 'a1~abr', tache_id: 'a1', article_id: 'abr', quantite: 2 },
      { id: 'b1~pon', tache_id: 'b1', article_id: 'pon', quantite: 1 },
      { id: 'b1~abr', tache_id: 'b1', article_id: 'abr', quantite: 3 },
      { id: 'b1~vis', tache_id: 'b1', article_id: 'vis', quantite: 10 },
    ],
    prise_articles: [],
    commentaires: [],
    photos: [],
  };
}

describe('déplacements', () => {
  it('une ancienne intervention apparaît comme un déplacement virtuel', () => {
    const d = base();
    expect(listeVoyages(d).map((v) => [v.id, !!v.virtuel])).toEqual([['OLD', true]]);
    expect(interventionsDuVoyage('OLD', d).map((i) => i.id)).toEqual(['OLD']);
  });

  it('crée une intervention par bien', () => {
    let d = base();
    const { id, writes } = creerVoyage({ nom: 'Pau', date_debut: '2026-11-20' }, ['a1', 'b1', 'a2', 'x'], d);
    d = applyWrites(d, writes);
    const its = interventionsDuVoyage(id, d);
    expect(its.map((i) => nomIntervention(i, d))).toEqual(['Bien A', 'Bien B', 'Pau – Sans bien']);
    expect(tachesIntervention(its[0].id, d).map((t) => t.id)).toEqual(['a1', 'a2']);
    expect(its.every((i) => i.date_debut === '2026-11-20')).toBe(true);
    expect(tachesVoyage(id, d).map((t) => t.id).sort()).toEqual(['a1', 'a2', 'b1', 'x']);
  });

  it('mutualise le chargement du déplacement et garde « À sortir » par intervention', () => {
    let d = base();
    const { id, writes } = creerVoyage({ nom: 'Pau' }, ['a1', 'b1'], d);
    d = applyWrites(d, writes);
    const tout = computeTrip(id, d, tachesVoyage(id, d));
    expect(tout.items.find((i) => i.article.id === 'pon').total).toBe(1); // outil mutualisé
    expect(tout.items.find((i) => i.article.id === 'abr').total).toBe(5); // consommables additionnés
    const [ia, ib] = interventionsDuVoyage(id, d);
    const sortirA = computeTrip(cleSortie(ia.id), d, tachesIntervention(ia.id, d));
    expect(sortirA.items.map((i) => i.article.id).sort()).toEqual(['abr', 'pon']);
    const sortirB = computeTrip(cleSortie(ib.id), d, tachesIntervention(ib.id, d));
    expect(sortirB.items.find((i) => i.article.id === 'abr').total).toBe(3);
    expect(groupByType(tout.items, d.lieux).map((g) => g.type)).toEqual(['outillage', 'consommable', 'materiel']);
  });

  it("ajouter une tâche d'un nouveau bien crée son intervention", () => {
    let d = base();
    const c = creerVoyage({ nom: 'Pau' }, ['a1'], d);
    d = applyWrites(d, c.writes);
    const v = listeVoyages(d).find((x) => x.id === c.id);
    d = applyWrites(d, rangerDansVoyage(v, ['b1', 'a2'], d).writes);
    const its = interventionsDuVoyage(c.id, d);
    expect(its.length).toBe(2);
    expect(tachesIntervention(its[0].id, d).map((t) => t.id)).toEqual(['a1', 'a2']);
  });

  it('un déplacement virtuel devient réel quand on ajoute un autre bien', () => {
    let d = base();
    const v = listeVoyages(d)[0];
    d = applyWrites(d, rangerDansVoyage(v, ['b1'], d).writes);
    expect(d.voyages.map((x) => x.id)).toEqual(['OLD']);
    expect(interventionsDuVoyage('OLD', d).length).toBe(2);
    expect(listeVoyages(d).length).toBe(1);
  });

  it("change l'affectation d'une tâche depuis sa fiche", () => {
    let d = base();
    const p1 = creerVoyage({ nom: 'Pau' }, ['a1'], d);
    d = applyWrites(d, p1.writes);
    const p2 = creerVoyage({ nom: 'Bordeaux' }, [], d);
    d = applyWrites(d, p2.writes);
    d = applyWrites(d, affecterTache('a1', p2.id, d));
    expect(tachesVoyage(p2.id, d).map((t) => t.id)).toEqual(['a1']);
    expect(tachesVoyage(p1.id, d)).toEqual([]);
    d = applyWrites(d, affecterTache('a1', null, d));
    expect(planification('a1', d)).toBeNull();
  });

  it('statut déduit des interventions', () => {
    let d = base();
    const { id, writes } = creerVoyage({ nom: 'Pau' }, ['a1', 'b1'], d);
    d = applyWrites(d, writes);
    expect(statutVoyage(id, d)).toBe('en_preparation');
    const [ia, ib] = interventionsDuVoyage(id, d);
    d = applyWrites(d, [{ table: 'deplacements', row: { id: ia.id, statut: 'termine' } }]);
    expect(statutVoyage(id, d)).toBe('en_preparation'); // plus d'état « en cours » : à faire tant que tout n'est pas terminé
    d = applyWrites(d, [{ table: 'deplacements', row: { id: ib.id, statut: 'termine' } }]);
    expect(statutVoyage(id, d)).toBe('termine');
  });
});

describe('tâches types', () => {
  const avant = { liens: [{ article_id: 'pon', quantite: 1 }, { article_id: 'abr', quantite: 2 }], description: '- [ ] Poncer' };
  const apres = { liens: [{ article_id: 'pon', quantite: 1 }, { article_id: 'abr', quantite: 4 }, { article_id: 'vis', quantite: 5 }], description: '- [ ] Poncer\n- [ ] Vernir' };

  it('calcule la différence', () => {
    const diff = diffModele(avant, apres);
    expect(diff.ajouts).toEqual([{ article_id: 'vis', quantite: 5 }]);
    expect(diff.quantites).toEqual([{ article_id: 'abr', quantite: 4 }]);
    expect(diff.retraits).toEqual([]);
    expect(diff.etapes).toEqual(['Vernir']);
    expect(diffModele(avant, avant).vide).toBe(true);
  });

  it('retrouve les tâches ouvertes du modèle (lien ou même titre)', () => {
    const d = base();
    d.taches.push({ id: 'm2', titre: 'vernis ', statut: 'a_traiter', modele_id: 'autre' });
    d.taches.push({ id: 'm3', titre: 'Autre titre', statut: 'a_traiter', modele_id: 'M' });
    d.taches.push({ id: 'm4', titre: 'Vernis', statut: 'terminee', modele_id: 'M' });
    expect(tachesDuModele({ id: 'M', titre: 'Vernis' }, d).map((t) => t.id)).toEqual(['a1', 'm3']);
  });

  it('reporte la modification sans toucher aux étapes cochées', () => {
    let d = base();
    d.taches[0].description = '- [x] Poncer';
    const diff = diffModele(avant, apres);
    d = applyWrites(d, reporterSurTache(d.taches[0], diff, d, 'M'));
    const t = d.taches.find((x) => x.id === 'a1');
    expect(t.description).toBe('- [x] Poncer\n- [ ] Vernir');
    expect(t.modele_id).toBe('M');
    const liens = d.tache_articles.filter((l) => l.tache_id === 'a1');
    expect(liens.find((l) => l.article_id === 'abr').quantite).toBe(4);
    expect(liens.find((l) => l.article_id === 'vis').quantite).toBe(5);
  });
});
