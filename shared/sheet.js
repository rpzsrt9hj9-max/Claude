// Synchronisation du catalogue avec un Google Sheet (dans les deux sens, lancée à la main depuis le Sheet).
// Ce module ne fait aucun appel réseau : il compare le Sheet, le serveur et l'état de la dernière synchro,
// et renvoie les écritures à envoyer au serveur et les lignes à réécrire dans le Sheet.
// Il est empaqueté dans le script Google (google-sheet/Code.gs) et testé dans tests/sheet.test.js.

import { accessoireId, defaultCumul, stockId, uuid } from './schema.js';
import { nameKey } from './match.js';

export const COLONNES = ['ID', 'Nom', 'Type', 'Lieu', 'Catégorie', 'Unité', 'À acheter', 'Stock', 'Items à proposer', 'Notes', 'Utilisé dans', 'Modifié le'];
export const COL = Object.fromEntries(COLONNES.map((c, i) => [c, i]));
export const TYPES_SHEET = { outillage: 'Outillage', accessoire: 'Accessoire', consommable: 'Consommable', materiel: 'Matériel' };

/** « outil », « Outillage », « conso », « matériaux »… -> code du type, sinon null. */
export function lireType(texte) {
  const k = nameKey(texte);
  if (!k) return null;
  if (k.startsWith('out')) return 'outillage';
  if (k.startsWith('acc') || k.startsWith('bat')) return 'accessoire';
  if (k.startsWith('con')) return 'consommable';
  if (k.startsWith('mat')) return 'materiel';
  return null;
}

const texte = (v) => (v == null ? '' : String(v).trim());
const nombre = (v) => {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
};
const booleen = (v) => v === true || /^(true|vrai|oui|x|1)$/i.test(texte(v));

/** « Batterie 18V ×2; Chargeur » -> [{ nom, quantite }] */
export function lireItems(v) {
  return texte(v)
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(.*?)\s*[×x*]\s*(\d+(?:[.,]\d+)?)$/i);
      return m && m[1] ? { nom: m[1].trim(), quantite: Number(m[2].replace(',', '.')) } : { nom: s, quantite: 1 };
    });
}
const ecrireItems = (items) => items.map((i) => (i.quantite === 1 ? i.nom : `${i.nom} ×${String(i.quantite).replace('.', ',')}`)).join('; ');

/** Une ligne du Sheet (tableau de cellules) -> champs lus. */
export function lireLigne(cellules) {
  const c = (nom) => cellules[COL[nom]];
  return {
    id: texte(c('ID')),
    nom: texte(c('Nom')),
    typeTexte: texte(c('Type')),
    type: lireType(c('Type')),
    lieu: texte(c('Lieu')),
    categorie: texte(c('Catégorie')),
    unite: texte(c('Unité')),
    aAcheter: booleen(c('À acheter')),
    stock: nombre(c('Stock')),
    items: lireItems(c('Items à proposer')),
    notes: texte(c('Notes')),
  };
}

/** Empreinte des champs modifiables : sert à savoir qui a changé (Sheet ou appli) depuis la dernière synchro. */
export function signature(f) {
  return JSON.stringify([
    f.nom,
    f.type,
    nameKey(f.lieu),
    nameKey(f.categorie),
    f.unite,
    !!f.aAcheter,
    f.stock,
    f.items.map((i) => `${nameKey(i.nom)}×${i.quantite}`).sort(),
    f.notes,
  ]);
}

const vivants = (l) => (l || []).filter((x) => !x.deleted);

/** Index pratique de l'état du serveur. */
function indexer(srv) {
  const parId = (t) => new Map(vivants(srv[t]).map((x) => [x.id, x]));
  return { articles: parId('articles'), lieux: parId('lieux'), categories: parId('categories') };
}

function stockDe(articleId, srv) {
  const l = vivants(srv.stocks).filter((s) => s.article_id === articleId);
  return l.length ? l.reduce((t, s) => t + (Number(s.quantite) || 0), 0) : null;
}

/** Champs d'un article du serveur, dans la même forme que lireLigne. */
export function champsServeur(a, srv) {
  const ix = indexer(srv);
  const items = vivants(srv.article_accessoires)
    .filter((x) => x.article_id === a.id && ix.articles.has(x.accessoire_id))
    .map((x) => ({ nom: ix.articles.get(x.accessoire_id).nom, quantite: Number(x.quantite) || 1 }))
    .sort((x, y) => x.nom.localeCompare(y.nom, 'fr'));
  return {
    id: a.id,
    nom: texte(a.nom),
    type: a.type || 'materiel',
    typeTexte: TYPES_SHEET[a.type] ?? '',
    lieu: ix.lieux.get(a.lieu_id)?.nom ?? '',
    categorie: ix.categories.get(a.categorie_id)?.nom ?? '',
    unite: texte(a.unite),
    aAcheter: !!a.a_acheter,
    stock: stockDe(a.id, srv),
    items,
    notes: texte(a.notes),
  };
}

const dateCourte = (ms) => {
  if (!ms) return '';
  const d = new Date(Number(ms));
  const z = (n) => String(n).padStart(2, '0');
  return `${z(d.getDate())}/${z(d.getMonth() + 1)}/${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}`;
};

/** Cellules d'une ligne du Sheet pour un article du serveur. */
export function ligneDepuisServeur(a, srv) {
  const f = champsServeur(a, srv);
  const u = srv.usages?.[a.id];
  return [f.id, f.nom, TYPES_SHEET[f.type] ?? f.type, f.lieu, f.categorie, f.unite, f.aAcheter, f.stock ?? '', ecrireItems(f.items), f.notes, u ? `${u.n} tâche${u.n > 1 ? 's' : ''}` : '', dateCourte(a.updated_at)];
}

/**
 * Prépare une synchronisation.
 * serveur : { articles, lieux, categories, article_accessoires, stocks, usages: { [articleId]: { n, titres } } }
 * lignes : cellules du Sheet (sans l'en-tête) ; etat : { [id]: signature à la dernière synchro }
 * supprimerUtilises : supprimer aussi les articles déjà utilisés dans des tâches (après confirmation).
 * Renvoie { writes, lignes, etat, journal, bloquees } ; bloquees = suppressions d'articles utilisés, non faites.
 */
export function planSynchro({ serveur, lignes, etat = {}, maintenant = Date.now(), nouvelId = uuid, supprimerUtilises = false }) {
  // Copie de travail du serveur : on y applique nos écritures au fur et à mesure.
  const srv = {
    articles: vivants(serveur.articles).map((x) => ({ ...x })),
    lieux: vivants(serveur.lieux).map((x) => ({ ...x })),
    categories: vivants(serveur.categories).map((x) => ({ ...x })),
    article_accessoires: vivants(serveur.article_accessoires).map((x) => ({ ...x })),
    stocks: vivants(serveur.stocks).map((x) => ({ ...x })),
    usages: serveur.usages || {},
  };
  const writes = [];
  const journal = [];
  const note = (action, nom, detail = '') => journal.push({ action, nom, detail });

  // Écrit une ligne complète (le serveur exige toutes les colonnes obligatoires).
  const ecrire = (table, row) => {
    const liste = srv[table];
    const i = liste.findIndex((x) => x.id === row.id);
    const complet = { ...(i >= 0 ? liste[i] : { created_at: maintenant, deleted: false }), ...row, updated_at: maintenant };
    writes.push({ table, row: complet });
    if (complet.deleted) {
      if (i >= 0) liste.splice(i, 1);
    } else if (i >= 0) liste[i] = complet;
    else liste.push(complet);
    return complet;
  };
  const articleParId = (id) => srv.articles.find((a) => a.id === id);
  const articleParNom = (nom) => srv.articles.find((a) => nameKey(a.nom) === nameKey(nom));

  // Lieu ou catégorie d'après son nom (créé s'il n'existe pas).
  const refParNom = (table, nom, quoi) => {
    if (!nom) return null;
    const ex = srv[table].find((x) => nameKey(x.nom) === nameKey(nom));
    if (ex) return ex.id;
    const r = ecrire(table, { id: nouvelId(), nom });
    note(`${quoi} créé${quoi === 'Catégorie' ? 'e' : ''}`, nom);
    return r.id;
  };

  const fixerStockSrv = (articleId, lieuId, quantite) => {
    const cible = stockId(articleId, lieuId);
    for (const s of srv.stocks.filter((x) => x.article_id === articleId && (quantite == null || x.id !== cible))) ecrire('stocks', { id: s.id, deleted: true });
    if (quantite != null) ecrire('stocks', { id: cible, article_id: articleId, lieu_id: lieuId ?? null, quantite, deleted: false });
  };

  /** Envoie les champs d'une ligne du Sheet vers l'article (création si besoin), sans les items. */
  const pousser = (f, existant) => {
    let type = f.type;
    if (!type) {
      type = existant?.type || 'materiel';
      if (f.typeTexte) note('Type non reconnu', f.nom, `« ${f.typeTexte} » : ${TYPES_SHEET[type]} gardé`);
    }
    const row = {
      id: existant?.id ?? nouvelId(),
      nom: f.nom,
      type,
      lieu_id: refParNom('lieux', f.lieu, 'Lieu'),
      categorie_id: refParNom('categories', f.categorie, 'Catégorie'),
      unite: f.unite || null,
      a_acheter: f.aAcheter,
      notes: f.notes || null,
      deleted: false,
    };
    if (!existant || existant.type !== type) row.cumul_quantites = defaultCumul(type);
    if (!existant) row.achete_le = null;
    const stockAvant = existant ? stockDe(existant.id, srv) : null;
    const a = ecrire('articles', row);
    // La quantité suit l'article (au lieu principal) ; vide = pas de quantité suivie.
    if (stockAvant !== f.stock || (existant && existant.lieu_id !== a.lieu_id && stockAvant != null)) fixerStockSrv(a.id, a.lieu_id, f.stock);
    note(existant ? 'Modifié' : 'Ajouté', f.nom);
    return a;
  };

  /** Items à proposer d'une ligne : ajoute, retire ou change les quantités. */
  const pousserItems = (article, items) => {
    const voulus = new Map();
    for (const it of items) {
      const cible = articleParNom(it.nom);
      if (!cible) {
        note('Item inconnu', article.nom, `« ${it.nom} » n'existe pas dans le catalogue : ignoré`);
        continue;
      }
      if (cible.id !== article.id) voulus.set(cible.id, it.quantite);
    }
    const actuels = srv.article_accessoires.filter((x) => x.article_id === article.id);
    for (const x of actuels) if (!voulus.has(x.accessoire_id)) ecrire('article_accessoires', { id: x.id, deleted: true });
    for (const [accId, q] of voulus) {
      const x = actuels.find((y) => y.accessoire_id === accId);
      if (!x || Number(x.quantite) !== q) ecrire('article_accessoires', { id: x?.id ?? accessoireId(article.id, accId), article_id: article.id, accessoire_id: accId, quantite: q, deleted: false });
    }
  };

  // ---- 1. Lecture du Sheet ----
  const lus = [];
  const idsVus = new Set();
  for (const cellules of lignes) {
    const f = lireLigne(cellules);
    if (!f.nom) continue; // ligne vide (ou nom effacé : traitée comme supprimée)
    if (f.id && idsVus.has(f.id)) f.id = ''; // ligne copiée-collée : c'est un nouvel article
    if (f.id) idsVus.add(f.id);
    lus.push(f);
  }

  // ---- 2. Articles (sans les items, résolus ensuite quand tous les noms existent) ----
  const ordre = []; // ids des lignes gardées, dans l'ordre du Sheet
  const itemsAPousser = [];
  const serveurInitial = new Map(srv.articles.map((a) => [a.id, a]));
  for (const f of lus) {
    const s = f.id ? serveurInitial.get(f.id) : null;
    const dernier = f.id ? etat[f.id] : undefined;
    if (f.id && !s) {
      if (dernier !== undefined) {
        note("Supprimé dans l'appli", f.nom, 'ligne retirée du Sheet');
        continue;
      }
      f.id = ''; // identifiant inconnu : on le traite comme une nouvelle ligne
    }
    if (!f.id) {
      // Nouvelle ligne : si le nom existe déjà (et n'est pas déjà dans le Sheet), on la relie à cet article.
      const meme = articleParNom(f.nom);
      const existant = meme && !idsVus.has(meme.id) ? meme : null;
      if (meme && !existant) note('Doublon', f.nom, 'un article du même nom existe déjà : créé quand même');
      const a = pousser(f, existant);
      idsVus.add(a.id);
      ordre.push(a.id);
      itemsAPousser.push([a, f.items]);
      continue;
    }
    const sigSheet = signature(f);
    const sigSrv = signature(champsServeur(s, srv));
    ordre.push(s.id);
    if (sigSheet === sigSrv) continue;
    if (dernier !== undefined && sigSheet === dernier) continue; // seul l'appli a changé : la ligne sera réécrite
    if (dernier !== undefined && sigSrv !== dernier) note('Conflit', f.nom, "modifié dans le Sheet et dans l'appli : le Sheet l'emporte");
    const a = pousser(f, s);
    itemsAPousser.push([a, f.items]);
  }
  for (const [a, items] of itemsAPousser) pousserItems(articleParId(a.id) ?? a, items);

  // ---- 3. Lignes supprimées du Sheet ----
  const bloquees = [];
  const ajoutsFin = [];
  for (const a of [...serveurInitial.values()]) {
    if (idsVus.has(a.id) || etat[a.id] === undefined) continue;
    const u = srv.usages[a.id];
    if (u && !supprimerUtilises) {
      bloquees.push({ id: a.id, nom: a.nom, n: u.n, titres: u.titres || [] });
      ajoutsFin.push(a.id);
      note('Non supprimé', a.nom, `utilisé dans ${u.n} tâche${u.n > 1 ? 's' : ''} : ligne remise`);
      continue;
    }
    for (const x of srv.article_accessoires.filter((y) => y.article_id === a.id || y.accessoire_id === a.id)) ecrire('article_accessoires', { id: x.id, deleted: true });
    for (const s of srv.stocks.filter((y) => y.article_id === a.id)) ecrire('stocks', { id: s.id, deleted: true });
    ecrire('articles', { id: a.id, deleted: true });
    note('Supprimé', a.nom, u ? `était utilisé dans ${u.n} tâche${u.n > 1 ? 's' : ''}` : '');
  }

  // ---- 4. Articles créés dans l'appli (jamais vus par le Sheet) ----
  const nouveauxAppli = srv.articles
    .filter((a) => !idsVus.has(a.id) && etat[a.id] === undefined && serveurInitial.has(a.id))
    .sort((x, y) => x.nom.localeCompare(y.nom, 'fr'));
  for (const a of nouveauxAppli) note("Ajouté depuis l'appli", a.nom);

  // ---- 5. Lignes finales et nouvel état ----
  const ids = [...ordre, ...ajoutsFin, ...nouveauxAppli.map((a) => a.id)];
  const finales = [];
  const nouvelEtat = {};
  for (const id of ids) {
    const a = articleParId(id);
    if (!a) continue;
    finales.push(ligneDepuisServeur(a, srv));
    nouvelEtat[id] = signature(champsServeur(a, srv));
  }
  return { writes, lignes: finales, etat: nouvelEtat, journal, bloquees };
}
