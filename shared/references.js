// Références automatiques : T-0042 (tâche), I-0017 (intervention), D-0008 (déplacement).
// Numéro croissant par compte et par type. Une référence manquante (élément créé par une ancienne
// version) ou en double (deux appareils hors ligne) est corrigée automatiquement : la plus ancienne
// garde son numéro, l'autre prend le suivant libre. Tous les appareils calculent la même correction.

export const PREFIXES = { taches: 'T', deplacements: 'I', voyages: 'D' };

export const formatRef = (prefixe, n) => (n ? `${prefixe}-${String(n).padStart(4, '0')}` : '');
export const refTache = (t) => formatRef('T', t?.ref);
export const refIntervention = (i) => formatRef('I', i?.ref);
export const refVoyage = (v) => formatRef('D', v?.ref);

const concernees = (table, rows) => (table === 'taches' ? rows.filter((t) => !t.modele) : rows);
const ordre = (a, b) => (a.created_at ?? 0) - (b.created_at ?? 0) || String(a.id).localeCompare(String(b.id));

/** Écritures qui complètent ou dédoublonnent les références (vide si tout est en ordre). */
export function corrigerReferences(data) {
  const writes = [];
  for (const table of Object.keys(PREFIXES)) {
    const rows = concernees(table, data[table] || []).slice().sort(ordre);
    let max = Math.max(0, ...rows.map((r) => Number(r.ref) || 0));
    const vus = new Set();
    for (const r of rows) {
      const n = Number(r.ref) || 0;
      if (n > 0 && !vus.has(n)) {
        vus.add(n);
        continue;
      }
      max += 1;
      vus.add(max);
      writes.push({ table, row: { id: r.id, ref: max } });
    }
  }
  return writes;
}
