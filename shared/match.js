// Rapprochement de noms (anti-doublons) : normalisation, pluriels, Levenshtein et trigrammes.

export const STRONG = 0.85; // ressemblance forte : confirmation obligatoire avant création
export const SUGGEST = 0.6; // simple suggestion

/** Minuscules, sans accents, ponctuation remplacée par des espaces. */
export function normalize(s) {
  return (s ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function singular(token) {
  if (token.length > 3 && /[sx]$/.test(token) && !/\d/.test(token)) return token.slice(0, -1);
  return token;
}

/** Clé de comparaison : normalisée, au singulier, sans espaces (« 12 v » == « 12V »). */
export function nameKey(s) {
  return normalize(s).split(' ').map(singular).join('');
}

/** Recherche « contient », insensible à la casse et aux accents. */
export function matchesSearch(text, query) {
  const q = normalize(query);
  if (!q) return true;
  const t = normalize(text);
  return q.split(' ').every((w) => t.includes(w));
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function trigrams(s) {
  const p = `  ${s} `;
  const set = new Set();
  for (let i = 0; i < p.length - 2; i++) set.add(p.slice(i, i + 3));
  return set;
}

function dice(a, b) {
  const ta = trigrams(a);
  const tb = trigrams(b);
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}

const numbers = (s) => (normalize(s).match(/\d+/g) || []).sort().join(',');

/** Score de ressemblance entre 0 et 1. */
export function similarity(a, b) {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  const lev = 1 - levenshtein(ka, kb) / Math.max(ka.length, kb.length);
  let score = Math.max(lev, dice(ka, kb));
  if (Math.min(ka.length, kb.length) >= 4 && (ka.includes(kb) || kb.includes(ka))) score = Math.max(score, 0.75);
  // « Bouchon Ø30 » et « Bouchon Ø40 » sont des articles différents : jamais une ressemblance forte.
  const na = numbers(a);
  const nb = numbers(b);
  if ((na || nb) && na !== nb) score = Math.min(score, 0.7);
  return score;
}

/** Articles existants qui ressemblent au nom saisi, du plus proche au moins proche. */
export function findSimilar(name, articles, limit = 3) {
  return articles
    .map((article) => ({ article, score: similarity(name, article.nom) }))
    .filter((m) => m.score >= SUGGEST)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}

/** Retourne l'élément dont le nom est identique (casse, accents, pluriel ignorés), sinon undefined. */
export function findSameName(name, items) {
  const k = nameKey(name);
  return items.find((i) => nameKey(i.nom) === k);
}
