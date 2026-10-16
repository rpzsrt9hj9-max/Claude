import { describe, it, expect } from 'vitest';
import {
  statutTache, liens, tachesIntervention, planification, candidats, ajouterTaches, retirerTache,
  propositionCloture, cloturer, recap, lignesDescription, basculerEtape, ajouterEtape, progressionEtapes,
  decocherTout, enRetard,
} from '../shared/interventions.js';
import { computeTrip } from '../shared/calc.js';
import { applyWrites } from '../shared/ops.js';

function base() {
  return {
    deplacements: [
      { id: 'I1', nom: 'Pau novembre', statut: 'en_preparation' },
      { id: 'I2', nom: 'Bordeaux', statut: 'en_preparation' },
      { id: 'OLD', nom: 'Ancien', statut: 'termine' },
    ],
    appartements: [{ id: 'P', nom: 'Bien P' }, { id: 'B', nom: 'Bien B' }],
    taches: [
      { id: 't1', titre: 'Joint douche', appartement_id: 'P', statut: 'a_traiter', echeance: '2026-11-10' },
      { id: 't2', titre: 'Vernis plan', appartement_id: 'P', statut: 'reportee', echeance: '2026-10-01' },
      { id: 't3', titre: 'Peinture', appartement_id: 'B', statut: 'a_traiter', echeance: '2026-12-20' },
      { id: 't4', titre: 'Fait', appartement_id: 'P', statut: 'terminee' },
      { id: 't5', titre: 'Ancienne tâche', appartement_id: 'P', fait: false, deplacement_id: 'I2', ordre: 2 },
      { id: 'm', titre: 'Modèle', modele: true },
    ],
    intervention_taches: [
      { id: 'I2~t3', intervention_id: 'I2', tache_id: 't3', ordre: 1 },
      { id: 'OLD~t2', intervention_id: 'OLD', tache_id: 't2', ordre: 1, resultat: 'reportee' },
    ],
    articles: [
      { id: 'vis', nom: 'Vis', type: 'materiel', cumul_quantites: true },
      { id: 'perc', nom: 'Perceuse', type: 'outillage', cumul_quantites: false },
    ],
    tache_articles: [
      { id: 't1~vis', tache_id: 't1', article_id: 'vis', quantite: 2 },
      { id: 't2~vis', tache_id: 't2', article_id: 'vis', quantite: 3 },
      { id: 't1~perc', tache_id: 't1', article_id: 'perc', quantite: 1 },
      { id: 't2~perc', tache_id: 't2', article_id: 'perc', quantite: 1 },
    ],
    prise_articles: [],
    commentaires: [],
    photos: [],
  };
}

describe('statuts', () => {
  it('reprend les anciennes tâches (fait) en statut', () => {
    expect(statutTache({ fait: true })).toBe('terminee');
    expect(statutTache({ fait: false })).toBe('a_traiter');
    expect(statutTache({ fait: true, statut: 'reportee' })).toBe('reportee');
  });
  it('en retard seulement si échéance passée et pas terminée', () => {
    expect(enRetard({ echeance: '2026-01-01', statut: 'a_traiter' }, '2026-10-16')).toBe(true);
    expect(enRetard({ echeance: '2026-01-01', statut: 'terminee' }, '2026-10-16')).toBe(false);
    expect(enRetard({ statut: 'a_traiter' }, '2026-10-16')).toBe(false);
  });
});

describe('planification', () => {
  it("garde les tâches d'anciens déplacements via un lien hérité", () => {
    const d = base();
    expect(tachesIntervention('I2', d).map((t) => t.id)).toEqual(['t3', 't5']);
    expect(liens(d).find((l) => l.tache_id === 't5').herite).toBe(true);
  });
  it('une intervention close ne compte pas comme planification', () => {
    const d = base();
    expect(planification('t2', d)).toBeNull();
    expect(planification('t3', d).id).toBe('I2');
  });
  it('propose libres et « ailleurs » séparément, jamais les terminées ni les modèles', () => {
    const { libres, ailleurs } = candidats('I1', base());
    expect(libres.map((t) => t.id)).toEqual(['t2', 't1']); // tri par échéance
    expect(ailleurs.map((a) => [a.tache.id, a.intervention.id])).toEqual([['t3', 'I2'], ['t5', 'I2']]);
  });
  it('filtre par biens (choix multiple) et par échéance', () => {
    const d = base();
    expect(candidats('I1', d, { appartements: ['B'] }).ailleurs.map((a) => a.tache.id)).toEqual(['t3']);
    expect(candidats('I1', d, { appartements: ['P', 'B'], echeanceMax: '2026-10-31' }).libres.map((t) => t.id)).toEqual(['t2']);
  });
  it("déplace une tâche d'une autre intervention ouverte", () => {
    let d = base();
    d = applyWrites(d, ajouterTaches('I1', ['t1', 't3', 't5'], d));
    expect(tachesIntervention('I1', d).map((t) => t.id)).toEqual(['t1', 't3', 't5']);
    expect(tachesIntervention('I2', d)).toEqual([]);
    expect(planification('t5', d).id).toBe('I1');
  });
  it('retirer une tâche la laisse dans la liste générale', () => {
    let d = base();
    d = applyWrites(d, retirerTache('I2', 't3', d));
    expect(tachesIntervention('I2', d).map((t) => t.id)).toEqual(['t5']);
    expect(d.taches.some((t) => t.id === 't3')).toBe(true);
  });
  it("le matériel de l'intervention vient de ses tâches", () => {
    let d = base();
    d = applyWrites(d, ajouterTaches('I1', ['t1', 't2'], d));
    const trip = computeTrip('I1', d);
    expect(trip.items.find((i) => i.article.id === 'vis').total).toBe(5);
    expect(trip.items.find((i) => i.article.id === 'perc').total).toBe(1);
  });
});

describe('clôture', () => {
  it('propose « Reportée » par défaut pour les tâches non terminées', () => {
    let d = base();
    d.taches.find((t) => t.id === 't3').statut = 'terminee';
    expect(propositionCloture('I2', d).map((p) => [p.tache.id, p.statut])).toEqual([['t3', 'terminee'], ['t5', 'reportee']]);
  });
  it('applique les statuts, garde l’historique et ferme l’intervention', () => {
    let d = base();
    d = applyWrites(d, cloturer('I2', [{ tache_id: 't3', statut: 'terminee' }, { tache_id: 't5', statut: 'reportee' }], d));
    expect(d.deplacements.find((x) => x.id === 'I2').statut).toBe('termine');
    expect(statutTache(d.taches.find((t) => t.id === 't5'))).toBe('reportee');
    expect(d.intervention_taches.find((l) => l.id === 'I2~t5').resultat).toBe('reportee');
    expect(tachesIntervention('I2', d).map((t) => t.id)).toEqual(['t3', 't5']);
    // La tâche reportée redevient proposable dans une nouvelle intervention
    expect(candidats('I1', d).libres.map((t) => t.id)).toContain('t5');
  });
});

describe('récap', () => {
  it('regroupe compte rendu, commentaires des tâches et photos', () => {
    const d = base();
    d.commentaires = [
      { id: 'c1', tache_id: 't3', intervention_id: 'I2', texte: 'Acheter blanc mat', created_at: 2 },
      { id: 'c2', tache_id: null, intervention_id: 'I2', texte: 'Tout s’est bien passé', created_at: 3 },
      { id: 'c3', tache_id: 't3', intervention_id: null, texte: 'Avant', created_at: 1 },
    ];
    d.photos = [{ id: 'p1', commentaire_id: 'c2', chemin: 'I2/p1.jpg' }];
    const r = recap('I2', d);
    expect(r.compteRendu.map((c) => c.id)).toEqual(['c2']);
    expect(r.parTache.find((g) => g.tache.id === 't3').commentaires.map((c) => c.id)).toEqual(['c3', 'c1']);
    expect(r.photos.map((p) => p.id)).toEqual(['p1']);
  });
});

describe('cases à cocher dans la description', () => {
  const desc = 'Procédure :\n- [ ] Poncer\n- [x] Dépoussiérer';
  it('repère les cases', () => {
    const l = lignesDescription(desc);
    expect(l.map((x) => x.type)).toEqual(['texte', 'case', 'case']);
    expect(progressionEtapes(desc)).toEqual({ faites: 1, total: 2 });
  });
  it('coche, ajoute et remet à zéro', () => {
    expect(basculerEtape(desc, 1)).toBe('Procédure :\n- [x] Poncer\n- [x] Dépoussiérer');
    expect(basculerEtape(desc, 0)).toBe(desc);
    expect(ajouterEtape(desc, 'Vernir')).toBe(`${desc}\n- [ ] Vernir`);
    expect(ajouterEtape('', 'Vernir')).toBe('- [ ] Vernir');
    expect(decocherTout(desc)).toBe('Procédure :\n- [ ] Poncer\n- [ ] Dépoussiérer');
  });
});
