import { describe, it, expect } from 'vitest';
import { categoriesDeDepart, etendreSelection, planImport, accessoiresDe } from '../shared/catalogue.js';
import { DEFAULT_CATEGORIES } from '../shared/categories.js';
import { applyWrites } from '../shared/ops.js';

const catalogue = () => ({
  proprietaire: 'Papa',
  categories: [{ id: 'c1', nom: 'Électroportatif' }, { id: 'c2', nom: 'Ma catégorie perso' }],
  articles: [
    { id: 'pon', nom: 'Ponceuse orbitale', type: 'outillage', categorie_id: 'c1', unite: null, cumul_quantites: false },
    { id: 'bat', nom: 'Batterie 18 V', type: 'outillage', categorie_id: 'c1', unite: null, cumul_quantites: false },
    { id: 'abr', nom: 'Papier à poncer 120', type: 'consommable', categorie_id: 'c2', unite: 'feuilles', cumul_quantites: true },
    { id: 'ver', nom: 'Vernis', type: 'materiel', categorie_id: null, unite: 'L', cumul_quantites: true },
    { id: 'zzz', nom: 'Perceuse', type: 'outillage', categorie_id: 'c1', unite: null, cumul_quantites: false },
  ],
  accessoires: [{ article_id: 'pon', accessoire_id: 'bat', quantite: 1 }],
  modeles: [{ id: 'm1', titre: 'Vernis plan de travail', description: '- [x] Poncer\n- [ ] Vernir', besoins: [{ article_id: 'pon', quantite: 1 }, { article_id: 'ver', quantite: 2 }] }],
});
const vide = () => ({ articles: [], categories: [], taches: [] });
const choix = (articles = [], modeles = []) => ({ articles: new Set(articles), modeles: new Set(modeles) });

describe('catégories de départ', () => {
  it('crée les catégories par défaut avec des identifiants fixes', () => {
    const w = categoriesDeDepart('ABCD-1234-xyz', []);
    expect(w.length).toBe(DEFAULT_CATEGORIES.length);
    expect(w[0].row.id).toMatch(/^cat-ABCD1234-/);
    expect(categoriesDeDepart('ABCD-1234-xyz', []).map((x) => x.row.id)).toEqual(w.map((x) => x.row.id));
  });
  it('ne recrée pas une catégorie déjà présente', () => {
    expect(categoriesDeDepart('u', [{ nom: 'jardin' }, { nom: 'Plomberie' }]).length).toBe(DEFAULT_CATEGORIES.length - 2);
  });
});

describe('sélection', () => {
  it('une tâche type entraîne ses articles, un article entraîne ses accessoires', () => {
    const s = etendreSelection(catalogue(), choix([], ['m1']));
    expect([...s].sort()).toEqual(['bat', 'pon', 'ver']);
    expect(accessoiresDe(catalogue(), 'pon')).toEqual(['bat']);
  });
});

describe('reprise du catalogue', () => {
  it('reprend les articles choisis sans lieu ni notes, avec leur catégorie', () => {
    const { writes, stats } = planImport(catalogue(), choix(['pon', 'abr']), vide());
    const d = applyWrites({ articles: [], categories: [] }, writes);
    expect(d.articles.map((a) => a.nom).sort()).toEqual(['Papier à poncer 120', 'Ponceuse orbitale']);
    expect(d.articles.every((a) => a.lieu_id === null && a.notes === null)).toBe(true);
    expect(d.categories.map((c) => c.nom).sort()).toEqual(['Ma catégorie perso', 'Électroportatif']);
    const pon = d.articles.find((a) => a.nom === 'Ponceuse orbitale');
    expect(d.categories.find((c) => c.id === pon.categorie_id).nom).toBe('Électroportatif');
    expect(stats).toMatchObject({ articles: 2, categories: 2, dejaPresents: 0 });
  });

  it("n'importe pas ce qui n'est pas choisi", () => {
    const { writes } = planImport(catalogue(), choix(['ver']), vide());
    expect(writes.filter((w) => w.table === 'articles').map((w) => w.row.nom)).toEqual(['Vernis']);
  });

  it('réutilise un article déjà présent (même nom) et la catégorie de même nom', () => {
    const local = { articles: [{ id: 'mien', nom: 'ponceuse orbitale', type: 'outillage' }], categories: [{ id: 'cm', nom: 'electroportatif' }], taches: [] };
    const { writes, stats } = planImport(catalogue(), choix(['pon', 'bat']), local);
    expect(stats.dejaPresents).toBe(1);
    expect(writes.filter((w) => w.table === 'articles').length).toBe(1);
    const lien = writes.find((w) => w.table === 'article_accessoires');
    expect(lien.row.article_id).toBe('mien');
    const bat = writes.find((w) => w.table === 'articles').row;
    expect(bat.categorie_id).toBe('cm');
  });

  it('reprend une tâche type avec ses articles et des étapes décochées', () => {
    const { writes, stats } = planImport(catalogue(), choix([], ['m1']), vide());
    const d = applyWrites({ articles: [], categories: [], taches: [], tache_articles: [] }, writes);
    const t = d.taches[0];
    expect(t.modele).toBe(true);
    expect(t.description).toBe('- [ ] Poncer\n- [ ] Vernir');
    expect(d.tache_articles.length).toBe(2);
    expect(d.tache_articles.every((l) => d.articles.some((a) => a.id === l.article_id))).toBe(true);
    expect(stats.modeles).toBe(1);
  });

  it('ignore une tâche type de même titre', () => {
    const local = { articles: [], categories: [], taches: [{ id: 'x', titre: 'Vernis plan de travail', modele: true }] };
    const { writes, stats } = planImport(catalogue(), choix([], ['m1']), local);
    expect(stats.modelesIgnores).toBe(1);
    expect(writes.some((w) => w.table === 'taches')).toBe(false);
  });
});
