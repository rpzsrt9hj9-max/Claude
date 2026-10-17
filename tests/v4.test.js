import { describe, it, expect } from 'vitest';
import { corrigerReferences, refTache, formatRef } from '../shared/references.js';
import { estBatterie, estChargeur, tension, motsMarque, typeBatterie, batteriesCompatibles } from '../shared/accessoires.js';
import { classerTaches, classerInterventions } from '../shared/classement.js';
import { lieuVehicule, marquerAchete, marquerAAcheter, ranger, quantiteStock, fixerStock, deplacerStock, nbAAcheter } from '../shared/achats.js';
import { computeTrip } from '../shared/calc.js';
import { accessoiresFor, applyWrites } from '../shared/ops.js';
import { nomIntervention, libellePlanification } from '../shared/voyages.js';

describe('références', () => {
  it('numérote les éléments sans référence par ordre de création', () => {
    const data = { taches: [{ id: 'b', created_at: 2 }, { id: 'a', created_at: 1 }, { id: 'm', created_at: 0, modele: true }], deplacements: [], voyages: [{ id: 'v', created_at: 5 }] };
    const w = corrigerReferences(data);
    expect(w).toEqual([
      { table: 'taches', row: { id: 'a', ref: 1 } },
      { table: 'taches', row: { id: 'b', ref: 2 } },
      { table: 'voyages', row: { id: 'v', ref: 1 } },
    ]);
  });
  it('renumérote le doublon le plus récent et ne touche à rien si tout va bien', () => {
    const data = { taches: [{ id: 'a', ref: 1, created_at: 1 }, { id: 'b', ref: 2, created_at: 2 }, { id: 'c', ref: 2, created_at: 3 }], deplacements: [], voyages: [] };
    expect(corrigerReferences(data)).toEqual([{ table: 'taches', row: { id: 'c', ref: 3 } }]);
    expect(corrigerReferences(applyWrites(data, corrigerReferences(data)))).toEqual([]);
  });
  it('format T-0042', () => {
    expect(refTache({ ref: 42 })).toBe('T-0042');
    expect(formatRef('D', null)).toBe('');
  });
});

describe('batteries et marques', () => {
  it('reconnaît batteries, chargeurs, tension et marque dans le nom', () => {
    expect(estBatterie({ nom: 'Batterie Bosch 18V 4Ah' })).toBe(true);
    expect(estChargeur({ nom: 'Chargeur Bosch 18 V' })).toBe(true);
    expect(estBatterie({ nom: 'Ponceuse Bosch 18V' })).toBe(false);
    expect(tension('Visseuse Bosch 18V')).toBe('18');
    expect(tension('Perceuse Makita 18 volts')).toBe('18');
    expect(tension('Visseuse 10,8 V')).toBe('10.8');
    expect(tension('Ponceuse 230 W')).toBe(null);
    expect(motsMarque('Batterie Bosch 18V 4Ah')).toEqual(['bosch']);
    expect(typeBatterie({ nom: 'Batterie Bosch 18V 4Ah' })).toBe(typeBatterie({ nom: 'Batterie Bosch 18 V 2Ah' }));
  });
  it('propose les batteries de même tension, celles de même marque en premier', () => {
    const articles = [
      { id: 'b1', nom: 'Batterie Bosch 18V 2Ah' },
      { id: 'b2', nom: 'Batterie Bosch 18V 4Ah' },
      { id: 'p1', nom: 'Batterie Parkside 18V' },
      { id: 'b3', nom: 'Batterie Bosch 12V' },
      { id: 'c1', nom: 'Chargeur Bosch 18V' },
    ];
    const r = batteriesCompatibles({ id: 'v', nom: 'Visseuse Bosch 18V' }, articles);
    expect(r.map((x) => [x.article.id, x.marque])).toEqual([['b1', true], ['b2', true], ['p1', false]]);
    expect(batteriesCompatibles({ id: 'x', nom: 'Ponceuse filaire' }, articles)).toEqual([]);
  });
  it('ne propose jamais de chargeur automatiquement', () => {
    const data = {
      articles: [{ id: 'pon', nom: 'Ponceuse Bosch 18V' }, { id: 'bat', nom: 'Batterie Bosch 18V' }, { id: 'chg', nom: 'Chargeur Bosch 18V' }],
      article_accessoires: [{ article_id: 'pon', accessoire_id: 'bat', quantite: 1 }, { article_id: 'pon', accessoire_id: 'chg', quantite: 1 }],
    };
    expect(accessoiresFor('pon', data).map((x) => x.article.id)).toEqual(['bat']);
  });
});

describe('quantités des accessoires', () => {
  const base = () => ({
    articles: [
      { id: 'pon', nom: 'Ponceuse Bosch 18V', type: 'outillage', cumul_quantites: false },
      { id: 'vis', nom: 'Visseuse Bosch 18V', type: 'outillage', cumul_quantites: false },
      { id: 'bat', nom: 'Batterie Bosch 18V 4Ah', type: 'accessoire', cumul_quantites: false },
      { id: 'for', nom: 'Forets bois', type: 'accessoire', cumul_quantites: false },
      { id: 'chg', nom: 'Chargeur Bosch 18V', type: 'accessoire', cumul_quantites: false },
    ],
    article_accessoires: [{ article_id: 'pon', accessoire_id: 'bat', quantite: 1 }, { article_id: 'vis', accessoire_id: 'bat', quantite: 1 }],
    taches: [{ id: 't1', titre: 'Poncer porte' }, { id: 't2', titre: 'Poncer volet' }, { id: 't3', titre: 'Visser étagère' }],
    tache_articles: [
      { tache_id: 't1', article_id: 'pon', quantite: 1 }, { tache_id: 't1', article_id: 'bat', quantite: 1 }, { tache_id: 't1', article_id: 'for', quantite: 1 },
      { tache_id: 't2', article_id: 'pon', quantite: 1 }, { tache_id: 't2', article_id: 'bat', quantite: 1 }, { tache_id: 't2', article_id: 'for', quantite: 1 },
      { tache_id: 't3', article_id: 'vis', quantite: 1 }, { tache_id: 't3', article_id: 'bat', quantite: 1 }, { tache_id: 't3', article_id: 'chg', quantite: 1 },
    ],
    prise_articles: [],
  });
  const total = (trip, id) => trip.items.find((i) => i.article.id === id).total;
  it('une batterie par outil distinct, même si un outil sert dans plusieurs tâches', () => {
    const d = base();
    const trip = computeTrip('D', d, d.taches);
    expect(total(trip, 'bat')).toBe(2); // ponceuse + visseuse
    expect(total(trip, 'pon')).toBe(1);
  });
  it('les autres accessoires ne se multiplient pas, un seul chargeur', () => {
    const d = base();
    const trip = computeTrip('D', d, d.taches);
    expect(total(trip, 'for')).toBe(1);
    expect(total(trip, 'chg')).toBe(1);
  });
  it('une batterie ajoutée seule garde sa quantité', () => {
    const d = base();
    d.tache_articles = [{ tache_id: 't1', article_id: 'bat', quantite: 3 }];
    expect(total(computeTrip('D', d, d.taches), 'bat')).toBe(3);
  });
  it("si la batterie n'est prévue que dans la tâche de la ponceuse, une seule", () => {
    const d = base();
    d.tache_articles = d.tache_articles.filter((l) => !(l.tache_id === 't3' && l.article_id === 'bat'));
    expect(total(computeTrip('D', d, d.taches), 'bat')).toBe(1);
  });
});

describe('noms et classements', () => {
  const data = {
    appartements: [{ id: 'A', nom: 'Bien A' }, { id: 'B', nom: 'Bien B' }],
    voyages: [{ id: 'V', nom: 'Pau', date_debut: '2026-11-20' }],
    deplacements: [{ id: 'I1', nom: 'Pau – Bien A', voyage_id: 'V', appartement_id: 'A', nom_perso: 'rotation locataire' }, { id: 'I2', nom: 'Pau – Bien B', voyage_id: 'V', appartement_id: 'B' }],
    taches: [],
    intervention_taches: [],
  };
  it("affiche le bien d'abord, puis le nom choisi", () => {
    expect(nomIntervention(data.deplacements[0], data)).toBe('Bien A · rotation locataire');
    expect(nomIntervention(data.deplacements[1], data)).toBe('Bien B');
    expect(libellePlanification(data.deplacements[0], data)).toBe('Pau › Bien A · rotation locataire');
  });
  it('classe les tâches par bien puis par déplacement, ou l’inverse', () => {
    const taches = [
      { id: 't1', titre: 'a', appartement_id: 'A', echeance: '2026-12-01' },
      { id: 't2', titre: 'b', appartement_id: 'A', echeance: '2026-11-01' },
      { id: 't3', titre: 'c', appartement_id: 'B' },
      { id: 't4', titre: 'd' },
    ];
    const plan = { t1: 'V', t3: 'V' };
    const ctx = {
      bien: (t) => data.appartements.find((a) => a.id === t.appartement_id) ?? null,
      voyage: (t) => (plan[t.id] ? data.voyages[0] : null),
    };
    const parBien = classerTaches(taches, 'bien', ctx);
    expect(parBien.map((g) => g.titre)).toEqual(['Bien A', 'Bien B', 'Sans bien']);
    expect(parBien[0].items.map((t) => t.id)).toEqual(['t2', 't1']);
    expect(parBien[0].sous.map((s) => s.titre)).toEqual(['Pau', 'Non planifiées']);
    const parVoyage = classerTaches(taches, 'deplacement', ctx);
    expect(parVoyage.map((g) => g.titre)).toEqual(['Pau', 'Non planifiées']);
    expect(parVoyage[0].sous.map((s) => s.titre)).toEqual(['Bien A', 'Bien B']);
    expect(classerTaches(taches, 'echeance', ctx).map((g) => g.titre)).toContain('Sans échéance');
  });
  it('classe les interventions par bien ou par déplacement', () => {
    const ctx = { bien: (i) => data.appartements.find((a) => a.id === i.appartement_id), voyage: () => data.voyages[0] };
    expect(classerInterventions(data.deplacements, 'bien', ctx).map((g) => g.titre)).toEqual(['Bien A', 'Bien B']);
    expect(classerInterventions(data.deplacements, 'deplacement', ctx).map((g) => [g.titre, g.items.length])).toEqual([['Pau', 2]]);
  });
});

describe('achats et stock', () => {
  const base = () => ({
    lieux: [{ id: 'G', nom: 'Garage' }],
    articles: [{ id: 'a', nom: 'Peinture', lieu_id: 'G', a_acheter: true }, { id: 'b', nom: 'Rouleau', lieu_id: null }],
    stocks: [{ id: 'a~G', article_id: 'a', lieu_id: 'G', quantite: 2 }],
  });
  it('crée le lieu Véhicule une seule fois (identifiant fixe)', () => {
    const d = base();
    const v = lieuVehicule(d.lieux, 'ABCD-1234');
    expect(v.writes.length).toBe(1);
    expect(lieuVehicule([...d.lieux, v.writes[0].row], 'ABCD-1234')).toEqual({ id: v.id, writes: [] });
  });
  it('à acheter -> acheté (véhicule, stock qui suit) -> rangé', () => {
    let d = base();
    expect(nbAAcheter(d.articles)).toBe(1);
    d = applyWrites(d, marquerAchete(['a'], d, 'u1', 1000));
    const a = d.articles.find((x) => x.id === 'a');
    const vehicule = d.lieux.find((l) => l.nom === 'Véhicule');
    expect([a.a_acheter, a.achete_le, a.lieu_id]).toEqual([false, 1000, vehicule.id]);
    expect(quantiteStock('a', d.stocks)).toBe(2);
    expect(d.stocks.find((s) => s.article_id === 'a').lieu_id).toBe(vehicule.id);
    expect(nbAAcheter(d.articles)).toBe(0);
    d = applyWrites(d, ranger(['a'], 'G', d));
    const r = d.articles.find((x) => x.id === 'a');
    expect([r.lieu_id, r.achete_le]).toEqual(['G', null]);
    expect(d.stocks.find((s) => s.article_id === 'a').lieu_id).toBe('G');
  });
  it('remettre à acheter et fixer la quantité', () => {
    let d = base();
    d = applyWrites(d, marquerAAcheter(['b']));
    expect(d.articles.find((x) => x.id === 'b').a_acheter).toBe(true);
    d = applyWrites(d, fixerStock(d.articles[1], 5, d));
    expect(quantiteStock('b', d.stocks)).toBe(5);
    expect(quantiteStock('zzz', d.stocks)).toBe(null);
    expect(deplacerStock(d.articles[1], null, d)).toEqual([]);
  });
});
