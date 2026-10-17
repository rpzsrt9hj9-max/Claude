import { describe, expect, it } from 'vitest';
import { COLONNES, COL, lireItems, lireType, planSynchro } from '../shared/sheet.js';

let n = 0;
const nouvelId = () => `n${++n}`;
const T = 1000;

function serveur() {
  const r = (o) => ({ created_at: 1, updated_at: 1, deleted: false, ...o });
  return {
    lieux: [r({ id: 'L1', nom: 'Garage' })],
    categories: [r({ id: 'C1', nom: 'Électricité' })],
    articles: [
      r({ id: 'p', nom: 'Perceuse 18V', type: 'outillage', lieu_id: 'L1', categorie_id: 'C1', cumul_quantites: false, a_acheter: false }),
      r({ id: 'b', nom: 'Batterie 18V', type: 'accessoire', lieu_id: 'L1', cumul_quantites: false }),
      r({ id: 'v', nom: 'Vis 4x40', type: 'consommable', cumul_quantites: true }),
    ],
    article_accessoires: [r({ id: 'p~b', article_id: 'p', accessoire_id: 'b', quantite: 1 })],
    stocks: [r({ id: 'v~sans-lieu', article_id: 'v', lieu_id: null, quantite: 200 })],
    usages: { p: { n: 2, titres: ['Étagère', 'Cadre'] } },
  };
}

/** Synchro complète puis renvoie un « serveur » mis à jour (écritures appliquées). */
function appliquer(srv, writes) {
  const out = structuredClone(srv);
  for (const { table, row } of writes) {
    const l = out[table];
    const i = l.findIndex((x) => x.id === row.id);
    if (i >= 0) l[i] = row;
    else l.push(row);
  }
  return out;
}
const ligne = (o) => {
  const c = Array(COLONNES.length).fill('');
  for (const [k, v] of Object.entries(o)) c[COL[k]] = v;
  return c;
};

describe('Google Sheet : lecture des cellules', () => {
  it('types souples et items avec quantités', () => {
    expect(['Outil', 'outillage', 'Accessoires', 'conso', 'Matériaux', 'batterie', 'truc'].map(lireType)).toEqual(['outillage', 'outillage', 'accessoire', 'consommable', 'materiel', 'accessoire', null]);
    expect(lireItems('Batterie 18V ×2; Chargeur;  ; Foret x3')).toEqual([
      { nom: 'Batterie 18V', quantite: 2 },
      { nom: 'Chargeur', quantite: 1 },
      { nom: 'Foret', quantite: 3 },
    ]);
  });
});

describe('Google Sheet : synchronisation', () => {
  it('première synchro : le Sheet vide reçoit tout le catalogue, rien n’est écrit sur le serveur', () => {
    const p = planSynchro({ serveur: serveur(), lignes: [], etat: {}, maintenant: T, nouvelId });
    expect(p.writes).toEqual([]);
    expect(p.lignes.map((l) => l[COL.Nom])).toEqual(['Batterie 18V', 'Perceuse 18V', 'Vis 4x40']);
    const perceuse = p.lignes.find((l) => l[COL.ID] === 'p');
    expect(perceuse[COL.Type]).toBe('Outillage');
    expect(perceuse[COL['Items à proposer']]).toBe('Batterie 18V');
    expect(perceuse[COL['Utilisé dans']]).toBe('2 tâches');
    expect(p.lignes.find((l) => l[COL.ID] === 'v')[COL.Stock]).toBe(200);
  });

  it('ajout en masse : nouvelles lignes, lieux et catégories créés, items reliés, doublon de nom relié', () => {
    const srv = serveur();
    const p0 = planSynchro({ serveur: srv, lignes: [], maintenant: T, nouvelId });
    const lignes = [
      ...p0.lignes,
      ligne({ Nom: 'Visseuse 18V', Type: 'outil', Lieu: 'Atelier', Catégorie: 'électricité', Stock: '1', 'Items à proposer': 'batterie 18v ×2; Inconnu' }),
      ligne({ Nom: 'Peinture blanche', Type: 'Matériaux', Unité: 'L', 'À acheter': true }),
    ];
    const p = planSynchro({ serveur: srv, lignes, etat: p0.etat, maintenant: T, nouvelId });
    const art = p.writes.filter((w) => w.table === 'articles').map((w) => w.row);
    const visseuse = art.find((a) => a.nom === 'Visseuse 18V');
    expect(visseuse).toMatchObject({ type: 'outillage', categorie_id: 'C1', cumul_quantites: false, created_at: T, updated_at: T, deleted: false });
    expect(p.writes.find((w) => w.table === 'lieux').row.nom).toBe('Atelier');
    expect(p.writes.find((w) => w.table === 'article_accessoires').row).toMatchObject({ article_id: visseuse.id, accessoire_id: 'b', quantite: 2 });
    expect(p.writes.find((w) => w.table === 'stocks').row).toMatchObject({ article_id: visseuse.id, lieu_id: visseuse.lieu_id, quantite: 1 });
    expect(art.find((a) => a.nom === 'Peinture blanche')).toMatchObject({ type: 'materiel', unite: 'L', a_acheter: true, cumul_quantites: true });
    expect(p.journal.some((j) => j.action === 'Item inconnu')).toBe(true);
    // Les nouvelles lignes reçoivent leur identifiant.
    expect(p.lignes.find((l) => l[COL.Nom] === 'Visseuse 18V')[COL.ID]).toBe(visseuse.id);
    // Rien à refaire à la synchro suivante.
    const srv2 = appliquer(srv, p.writes);
    expect(planSynchro({ serveur: srv2, lignes: p.lignes, etat: p.etat, maintenant: T + 1, nouvelId }).writes).toEqual([]);
  });

  it('modification dans le Sheet -> serveur ; modification dans l’appli -> Sheet', () => {
    const srv = serveur();
    const p0 = planSynchro({ serveur: srv, lignes: [], maintenant: T, nouvelId });
    // Le Sheet renomme la vis et change son stock ; l'appli change le lieu de la perceuse.
    const lignes = p0.lignes.map((l) => (l[COL.ID] === 'v' ? Object.assign([...l], { [COL.Nom]: 'Vis 4x40 inox', [COL.Stock]: 150 }) : l));
    const srv2 = structuredClone(srv);
    srv2.lieux.push({ id: 'L2', nom: 'Cave', deleted: false });
    srv2.articles.find((a) => a.id === 'p').lieu_id = 'L2';
    const p = planSynchro({ serveur: srv2, lignes, etat: p0.etat, maintenant: T, nouvelId });
    expect(p.writes.find((w) => w.table === 'articles').row).toMatchObject({ id: 'v', nom: 'Vis 4x40 inox' });
    expect(p.writes.filter((w) => w.table === 'articles')).toHaveLength(1); // la perceuse n'est pas renvoyée
    expect(p.writes.find((w) => w.table === 'stocks').row).toMatchObject({ id: 'v~sans-lieu', quantite: 150 });
    expect(p.lignes.find((l) => l[COL.ID] === 'p')[COL.Lieu]).toBe('Cave');
  });

  it('suppression dans le Sheet : directe si l’article ne sert à rien, bloquée s’il est utilisé dans une tâche', () => {
    const srv = serveur();
    const p0 = planSynchro({ serveur: srv, lignes: [], maintenant: T, nouvelId });
    const lignes = p0.lignes.filter((l) => l[COL.ID] !== 'v' && l[COL.ID] !== 'p');
    const p = planSynchro({ serveur: srv, lignes, etat: p0.etat, maintenant: T, nouvelId });
    expect(p.writes.find((w) => w.table === 'articles').row).toMatchObject({ id: 'v', deleted: true });
    expect(p.writes.find((w) => w.table === 'stocks').row).toMatchObject({ id: 'v~sans-lieu', deleted: true });
    expect(p.bloquees).toEqual([{ id: 'p', nom: 'Perceuse 18V', n: 2, titres: ['Étagère', 'Cadre'] }]);
    expect(p.lignes.some((l) => l[COL.ID] === 'p')).toBe(true); // ligne remise
    // Après confirmation : la perceuse est supprimée avec ses liens d'items.
    const pc = planSynchro({ serveur: srv, lignes, etat: p0.etat, maintenant: T, nouvelId, supprimerUtilises: true });
    expect(pc.bloquees).toEqual([]);
    expect(pc.writes.some((w) => w.table === 'articles' && w.row.id === 'p' && w.row.deleted)).toBe(true);
    expect(pc.writes.some((w) => w.table === 'article_accessoires' && w.row.id === 'p~b' && w.row.deleted)).toBe(true);
  });

  it('supprimé dans l’appli -> ligne retirée du Sheet ; nouvel article de l’appli -> ajouté au Sheet', () => {
    const srv = serveur();
    const p0 = planSynchro({ serveur: srv, lignes: [], maintenant: T, nouvelId });
    const srv2 = structuredClone(srv);
    srv2.articles.find((a) => a.id === 'v').deleted = true;
    srv2.articles.push({ id: 'm', nom: 'Marteau', type: 'outillage', deleted: false, updated_at: 5 });
    const p = planSynchro({ serveur: srv2, lignes: p0.lignes, etat: p0.etat, maintenant: T, nouvelId });
    expect(p.writes).toEqual([]);
    expect(p.lignes.map((l) => l[COL.ID])).toEqual(['b', 'p', 'm']);
  });

  it('ligne copiée-collée (même ID deux fois) -> la copie devient un nouvel article', () => {
    const srv = serveur();
    const p0 = planSynchro({ serveur: srv, lignes: [], maintenant: T, nouvelId });
    const copie = Object.assign([...p0.lignes[1]], { [COL.Nom]: 'Perceuse 18V (2)' });
    const p = planSynchro({ serveur: srv, lignes: [...p0.lignes, copie], etat: p0.etat, maintenant: T, nouvelId });
    const cree = p.writes.find((w) => w.table === 'articles').row;
    expect(cree.id).not.toBe('p');
    expect(cree.nom).toBe('Perceuse 18V (2)');
  });
});
