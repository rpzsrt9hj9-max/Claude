// Hooks d'accès aux données : tout le catalogue est petit, on le charge en mémoire
// et on recalcule les dérivés (quantités, « prête ») à chaque changement.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, onSyncState, syncState } from './db.js';
import { TABLE_NAMES } from '../shared/schema.js';
import { computeTrip } from '../shared/calc.js';

export function useAllData() {
  return useLiveQuery(async () => {
    const out = {};
    for (const t of TABLE_NAMES) out[t] = (await db[t].toArray()).filter((r) => !r.deleted);
    const byName = (a, b) => a.nom.localeCompare(b.nom, 'fr');
    out.lieux.sort(byName);
    out.categories.sort(byName);
    out.modeles = out.taches.filter((t) => t.modele).sort((a, b) => a.titre.localeCompare(b.titre, 'fr'));
    out.appartements.sort(byName);
    out.articles.sort(byName);
    out.deplacements.sort((a, b) => (b.date_debut || '').localeCompare(a.date_debut || '') || b.created_at - a.created_at);
    return out;
  }, []);
}

export const DataContext = createContext(null);
export const useData = () => useContext(DataContext);

export function useTrip(data, deplacementId) {
  return useMemo(() => (data && deplacementId ? computeTrip(deplacementId, data) : null), [data, deplacementId]);
}

export function useSyncState() {
  const [s, setS] = useState({ ...syncState });
  useEffect(() => onSyncState(setS), []);
  return s;
}

export function useLocalState(key, initial) {
  const [v, setV] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? initial : JSON.parse(raw);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {}
  }, [key, v]);
  return [v, setV];
}
