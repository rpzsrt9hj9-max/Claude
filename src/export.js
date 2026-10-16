// Exports : texte partageable (WhatsApp), CSV, JSON.
import { groupByLieu, formatQty } from '../shared/calc.js';
import { STATUTS, TYPES, TYPE_ICON } from '../shared/schema.js';

export function loadingListText(dep, trip, lieux, { onlyMissing = true } = {}) {
  const items = onlyMissing ? trip.items.filter((i) => !i.status.complet) : trip.items;
  const lines = [`🚗 ${dep.nom} – à charger (${items.length})`, ''];
  for (const g of groupByLieu(items, lieux)) {
    lines.push(`📍 ${g.lieu ? g.lieu.nom : 'Lieu non renseigné'}`);
    for (const i of g.items) {
      const reste = i.status.etat === 'partiel' ? ` (reste ${formatQty(i.total - i.status.taken, i.article.unite)})` : '';
      lines.push(`${i.status.complet ? '☑' : '☐'} ${TYPE_ICON[i.article.type]} ${i.article.nom} × ${formatQty(i.total, i.article.unite)}${reste}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

export async function shareText(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

const csvCell = (v) => {
  const s = v == null ? '' : typeof v === 'boolean' ? (v ? 'oui' : 'non') : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');

export function download(filename, content, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV de tout : une ligne par (déplacement, tâche, article). */
export function csvTout(data) {
  const by = (list) => new Map(list.map((x) => [x.id, x]));
  const deps = by(data.deplacements);
  const apps = by(data.appartements);
  const arts = by(data.articles);
  const lieux = by(data.lieux);
  const prises = new Map(data.prise_articles.map((p) => [`${p.deplacement_id}~${p.article_id}`, p]));
  const cats = by(data.categories);
  const rows = [['Déplacement', 'Statut', 'Tâche', 'Appartement', 'Fait', 'Description', 'Article', 'Type', 'Catégorie', 'Quantité', 'Unité', 'Lieu', 'Pris', 'Quantité prise']];
  for (const t of data.taches) {
    const dep = deps.get(t.deplacement_id);
    const links = data.tache_articles.filter((l) => l.tache_id === t.id);
    const base = [t.modele ? 'Tâche type' : dep?.nom, t.modele ? '' : STATUTS[dep?.statut], t.titre, apps.get(t.appartement_id)?.nom, !!t.fait, t.description];
    if (!links.length) rows.push(base);
    for (const l of links) {
      const a = arts.get(l.article_id);
      if (!a) continue;
      const p = prises.get(`${t.deplacement_id}~${a.id}`);
      rows.push([...base, a.nom, TYPES[a.type], cats.get(a.categorie_id)?.nom, String(l.quantite).replace('.', ','), a.unite, lieux.get(a.lieu_id)?.nom, !!p?.pris, p?.quantite_prise]);
    }
  }
  return toCsv(rows);
}

export function csvCatalogue(data) {
  const lieux = new Map(data.lieux.map((l) => [l.id, l.nom]));
  return toCsv([
    ['Article', 'Type', 'Catégorie', 'Lieu', 'Unité', 'Additionner les quantités', 'Notes'],
    ...data.articles.map((a) => [a.nom, TYPES[a.type], data.categories.find((c) => c.id === a.categorie_id)?.nom, lieux.get(a.lieu_id), a.unite, !!a.cumul_quantites, a.notes]),
  ]);
}

export function jsonBackup(data) {
  return JSON.stringify({ exported_at: new Date().toISOString(), ...data }, null, 2);
}
