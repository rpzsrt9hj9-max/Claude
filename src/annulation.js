// Suppressions et retraits annulables : on mémorise l'état d'avant, un bandeau en bas propose « Annuler ».
import { useEffect, useState } from 'react';
import { db, write } from './db.js';

const DUREE = 6000;
let courant = null; // { id, message, inverse }
const abonnes = new Set();
const publier = (v) => {
  courant = v;
  abonnes.forEach((f) => f(v));
};

/** Applique des écritures et propose de les annuler (restaure les champs modifiés tels qu'ils étaient). */
export async function avecAnnulation(writes, message) {
  const inverse = [];
  for (const w of writes) {
    const avant = await db[w.table].get(w.row.id);
    const row = { id: w.row.id };
    for (const k of Object.keys(w.row)) if (k !== 'id') row[k] = avant ? (avant[k] ?? null) : k === 'deleted' ? true : null;
    if (!avant) row.deleted = true;
    inverse.push({ table: w.table, row });
  }
  await write(writes);
  const id = Date.now();
  publier({ id, message, inverse });
  setTimeout(() => courant?.id === id && publier(null), DUREE);
}

export async function annuler() {
  const c = courant;
  if (!c) return;
  publier(null);
  await write(c.inverse);
}

export const fermerAnnulation = () => publier(null);

export function useAnnulation() {
  const [v, setV] = useState(courant);
  useEffect(() => {
    abonnes.add(setV);
    return () => abonnes.delete(setV);
  }, []);
  return v;
}
