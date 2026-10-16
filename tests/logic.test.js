import { describe, it, expect } from 'vitest';
import { computeTrip, priseStatus } from '../shared/calc.js';
import { similarity, findSimilar, findSameName, STRONG, nameKey } from '../shared/match.js';
import { mergeArticles, duplicateTrip, applyWrites } from '../shared/ops.js';
import { priseId, tacheArticleId } from '../shared/schema.js';

function fixture() {
  const data = {
    lieux: [{ id: 'L1', nom: 'garage A' }],
    articles: [
      { id: 'vis', nom: 'Petite vis', type: 'materiel', cumul_quantites: true },
      { id: 'perc', nom: 'Perceuse-visseuse 12V', type: 'outillage', cumul_quantites: false },
      { id: 'bat', nom: 'Batteries', type: 'outillage', cumul_quantites: false },
    ],
    taches: [
      { id: 'A', deplacement_id: 'D', titre: 'Fixer le cadre', ordre: 1 },
      { id: 'B', deplacement_id: 'D', titre: 'Finir la porte', ordre: 2 },
      { id: 'C', deplacement_id: 'D', titre: 'Étagère', ordre: 3 },
    ],
    tache_articles: [
      { id: 'A~vis', tache_id: 'A', article_id: 'vis', quantite: 1 },
      { id: 'B~vis', tache_id: 'B', article_id: 'vis', quantite: 1 },
      { id: 'A~perc', tache_id: 'A', article_id: 'perc', quantite: 1 },
      { id: 'B~perc', tache_id: 'B', article_id: 'perc', quantite: 1 },
      { id: 'C~perc', tache_id: 'C', article_id: 'perc', quantite: 1 },
      { id: 'A~bat', tache_id: 'A', article_id: 'bat', quantite: 1 },
      { id: 'C~bat', tache_id: 'C', article_id: 'bat', quantite: 2 },
    ],
    prise_articles: [],
  };
  return data;
}
const item = (trip, id) => trip.items.find((i) => i.article.id === id);
const pris = (data, articleId, quantite_prise = null) =>
  data.prise_articles.push({ id: priseId('D', articleId), deplacement_id: 'D', article_id: articleId, pris: true, quantite_prise });

describe('quantités', () => {
  it('additionne le matériel : vis 1 + 1 = 2, puis 1 + 3 = 4', () => {
    const data = fixture();
    expect(item(computeTrip('D', data), 'vis').total).toBe(2);
    data.tache_articles.find((l) => l.id === 'B~vis').quantite = 3;
    expect(item(computeTrip('D', data), 'vis').total).toBe(4);
  });
  it("prend le maximum pour l'outillage : perceuse × 1, batteries × 2", () => {
    const trip = computeTrip('D', fixture());
    expect(item(trip, 'perc').total).toBe(1);
    expect(item(trip, 'bat').total).toBe(2);
  });
  it('ignore les tâches des autres déplacements', () => {
    const data = fixture();
    data.taches.push({ id: 'X', deplacement_id: 'AUTRE' });
    data.tache_articles.push({ id: 'X~vis', tache_id: 'X', article_id: 'vis', quantite: 10 });
    expect(item(computeTrip('D', data), 'vis').total).toBe(2);
  });
});

describe('tâche prête', () => {
  it('passe en prête quand tout son matériel et son outillage sont pris', () => {
    const data = fixture();
    let a = computeTrip('D', data).taches.find((t) => t.tache.id === 'A');
    expect(a.prete).toBe(false);
    pris(data, 'vis', 2);
    pris(data, 'perc', 1);
    a = computeTrip('D', data).taches.find((t) => t.tache.id === 'A');
    expect(a.materielPret).toBe(true);
    expect(a.outillagePret).toBe(false);
    pris(data, 'bat', 2);
    a = computeTrip('D', data).taches.find((t) => t.tache.id === 'A');
    expect(a.prete).toBe(true);
  });
  it('une tâche sans article est prête', () => {
    const data = fixture();
    data.taches.push({ id: 'E', deplacement_id: 'D', titre: 'Vide' });
    expect(computeTrip('D', data).taches.find((t) => t.tache.id === 'E').prete).toBe(true);
  });
  it('repasse « à compléter » si la quantité totale augmente après avoir coché', () => {
    const data = fixture();
    pris(data, 'vis', 2);
    expect(item(computeTrip('D', data), 'vis').status.etat).toBe('complet');
    data.taches.push({ id: 'N', deplacement_id: 'D', titre: 'Nouvelle' });
    data.tache_articles.push({ id: 'N~vis', tache_id: 'N', article_id: 'vis', quantite: 1 });
    const s = item(computeTrip('D', data), 'vis').status;
    expect(s).toMatchObject({ etat: 'partiel', taken: 2, total: 3, complet: false });
  });
  it('priseStatus : pris sans quantité = quantité totale', () => {
    expect(priseStatus(3, { pris: true, quantite_prise: null }).complet).toBe(true);
    expect(priseStatus(3, { pris: false, quantite_prise: 1 }).etat).toBe('partiel');
    expect(priseStatus(3, undefined).etat).toBe('vide');
  });
  it('progression par type', () => {
    const data = fixture();
    pris(data, 'perc', 1);
    expect(computeTrip('D', data).progress.outillage).toEqual({ done: 1, total: 2 });
  });
});

describe('anti-doublons', () => {
  const articles = [{ id: '1', nom: 'Perceuse-visseuse 12V' }, { id: '2', nom: 'Bouchon Ø30' }, { id: '3', nom: 'Chiffons' }];
  it('« perceuse visseuse 12 v » propose « Perceuse-visseuse 12V »', () => {
    const m = findSimilar('perceuse visseuse 12 v', articles);
    expect(m[0].article.id).toBe('1');
    expect(m[0].score).toBeGreaterThanOrEqual(STRONG);
  });
  it('détecte casse, accents et pluriel', () => {
    expect(nameKey('Équerre')).toBe(nameKey('equerres'));
    expect(findSameName('chiffon', articles)?.id).toBe('3');
  });
  it('détecte les fautes de frappe', () => {
    expect(similarity('Perceuse visseuze 12V', 'Perceuse-visseuse 12V')).toBeGreaterThanOrEqual(STRONG);
  });
  it('Ø30 et Ø40 ne sont pas une ressemblance forte', () => {
    expect(similarity('Bouchon Ø40', 'Bouchon Ø30')).toBeLessThan(STRONG);
  });
  it('ne propose rien pour un nom sans rapport', () => {
    expect(findSimilar('Tournevis', articles)).toEqual([]);
  });
});

describe('fusion de doublons', () => {
  it('reporte les liaisons et les états « pris » puis supprime le doublon', () => {
    const data = fixture();
    data.articles.push({ id: 'vis2', nom: 'Petites vis', type: 'materiel', cumul_quantites: true, lieu_id: 'L1' });
    data.tache_articles.push({ id: 'A~vis2', tache_id: 'A', article_id: 'vis2', quantite: 4 });
    data.tache_articles.push({ id: 'C~vis2', tache_id: 'C', article_id: 'vis2', quantite: 5 });
    pris(data, 'vis2', 3);
    const out = applyWrites(data, mergeArticles('vis', 'vis2', data));
    expect(out.articles.find((a) => a.id === 'vis2')).toBeUndefined();
    expect(out.articles.find((a) => a.id === 'vis').lieu_id).toBe('L1');
    expect(out.tache_articles.filter((l) => l.article_id === 'vis2')).toEqual([]);
    expect(out.tache_articles.find((l) => l.id === 'A~vis').quantite).toBe(5); // 1 + 4
    expect(out.tache_articles.find((l) => l.id === tacheArticleId('C', 'vis')).quantite).toBe(5);
    expect(out.prise_articles.find((p) => p.id === priseId('D', 'vis'))).toMatchObject({ pris: true, quantite_prise: 3 });
    expect(item(computeTrip('D', out), 'vis').total).toBe(11);
  });
  it('refuse de fusionner un article avec lui-même', () => {
    expect(() => mergeArticles('vis', 'vis', fixture())).toThrow();
  });
});

describe('duplication de déplacement', () => {
  it('copie tâches et liaisons avec « pris » et « fait » remis à zéro', () => {
    const data = fixture();
    data.deplacements = [{ id: 'D', nom: 'Sortie 1' }];
    data.taches[0].fait = true;
    pris(data, 'vis', 2);
    const { id, writes } = duplicateTrip('D', data, { nom: 'Sortie 2' });
    const out = applyWrites(data, writes);
    const trip = computeTrip(id, out);
    expect(trip.taches).toHaveLength(3);
    expect(trip.taches.every((t) => !t.tache.fait)).toBe(true);
    expect(trip.items.every((i) => i.status.etat === 'vide')).toBe(true);
    expect(item(trip, 'vis').total).toBe(2);
  });
});

describe('catégories', async () => {
  const { ruleCategory, suggestCategorie } = await import('../shared/categories.js');
  it('classe les articles du jeu de départ', () => {
    expect(ruleCategory('Lames PVC')).toBe('Revêtement de sol');
    expect(ruleCategory('Rallonge PVC Ø30')).toBe('Plomberie');
    expect(ruleCategory('Raclette à carrelage')).toBe('Jardin');
    expect(ruleCategory('Jeux de clés appartement A')).toBe('Clés');
    expect(ruleCategory('Petite vis')).toBe('Quincaillerie et visserie');
    expect(ruleCategory('Bâche de protection')).toBe('Protection et masquage');
    expect(ruleCategory('Disques à meuler')).toBe('Abrasifs');
    expect(ruleCategory('Tréteaux')).toBe('Atelier');
    expect(ruleCategory('Truc inconnu')).toBe(null);
  });
  it("reprend la catégorie d'un article ressemblant", () => {
    const categories = [{ id: 'c1', nom: 'Visserie maison' }];
    const articles = [{ id: 'a', nom: 'Vis à bois 4x40', categorie_id: 'c1' }];
    expect(suggestCategorie('vis a bois 4x40', { categories, articles })?.id).toBe('c1');
  });
});

describe('accessoires et tâches types', async () => {
  const { copyTache, accessoiresFor } = await import('../shared/ops.js');
  it('propose les accessoires non encore présents', () => {
    const data = {
      articles: [{ id: 'meul', nom: 'Meuleuse' }, { id: 'disq', nom: 'Disques' }, { id: 'bat', nom: 'Batterie' }],
      article_accessoires: [
        { id: 'meul~disq', article_id: 'meul', accessoire_id: 'disq', quantite: 3 },
        { id: 'meul~bat', article_id: 'meul', accessoire_id: 'bat', quantite: 1 },
      ],
    };
    const prop = accessoiresFor('meul', data, new Set(['bat']));
    expect(prop.map((p) => [p.article.id, p.quantite])).toEqual([['disq', 3]]);
  });
  it('une tâche type copiée dans un déplacement compte dans les quantités', () => {
    const data = fixture();
    data.taches.push({ id: 'M', deplacement_id: null, modele: true, titre: 'Modèle' });
    data.tache_articles.push({ id: 'M~vis', tache_id: 'M', article_id: 'vis', quantite: 5 });
    expect(item(computeTrip('D', data), 'vis').total).toBe(2); // le modèle ne compte pas
    const { writes } = copyTache(data.taches.at(-1), [data.tache_articles.at(-1)], { deplacement_id: 'D', modele: false });
    const out = applyWrites(data, writes);
    expect(item(computeTrip('D', out), 'vis').total).toBe(7);
  });
  it('la fusion reporte les accessoires', () => {
    const data = fixture();
    data.articles.push({ id: 'vis2', nom: 'Vis', type: 'materiel', cumul_quantites: true });
    data.article_accessoires = [{ id: 'perc~vis2', article_id: 'perc', accessoire_id: 'vis2', quantite: 10 }];
    const out = applyWrites(data, mergeArticles('vis', 'vis2', data));
    expect(out.article_accessoires).toEqual([expect.objectContaining({ article_id: 'perc', accessoire_id: 'vis', quantite: 10 })]);
  });
});
