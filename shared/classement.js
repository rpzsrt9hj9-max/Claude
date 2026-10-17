// Classements des listes : tâches par bien, par déplacement ou par échéance ; interventions par bien ou par déplacement.

import { comparerEcheance, enRetard, aujourdhui } from './interventions.js';

export const CLASSEMENTS_TACHES = [
  ['bien', 'Bien › déplacement'],
  ['deplacement', 'Déplacement › bien'],
  ['echeance', 'Échéance'],
];
export const CLASSEMENTS_INTERVENTIONS = [
  ['bien', 'Par bien'],
  ['deplacement', 'Par déplacement'],
];

const triNom = (a, b) => {
  if (a.dernier !== b.dernier) return a.dernier ? 1 : -1;
  return a.titre.localeCompare(b.titre, 'fr');
};

function grouper(items, cle) {
  const m = new Map();
  for (const it of items) {
    const { id, titre, dernier = false, ordre = null } = cle(it);
    if (!m.has(id)) m.set(id, { id, titre, dernier, ordre, items: [] });
    m.get(id).items.push(it);
  }
  return [...m.values()];
}

/**
 * Tâches classées en groupes (et sous-groupes) : [{ id, titre, items, sous?: [...] }].
 * ctx = { bien(t) -> { id, nom } | null, voyage(t) -> { id, nom, date_debut } | null }
 */
export function classerTaches(taches, mode, ctx) {
  const tri = (l) => l.slice().sort(comparerEcheance);
  const parBien = (t) => {
    const b = ctx.bien(t);
    return b ? { id: b.id, titre: b.nom } : { id: '', titre: 'Sans bien', dernier: true };
  };
  const parVoyage = (t) => {
    const v = ctx.voyage(t);
    return v ? { id: v.id, titre: v.nom, ordre: v.date_debut || '9999' } : { id: '', titre: 'Non planifiées', dernier: true, ordre: '9999' };
  };
  if (mode === 'echeance') {
    const jour = aujourdhui();
    return [
      { id: 'retard', titre: 'En retard', items: tri(taches.filter((t) => enRetard(t, jour))), alerte: true },
      { id: 'avec', titre: 'Avec échéance', items: tri(taches.filter((t) => t.echeance && !enRetard(t, jour))) },
      { id: 'sans', titre: 'Sans échéance', items: tri(taches.filter((t) => !t.echeance)) },
    ].filter((g) => g.items.length);
  }
  const [principal, secondaire] = mode === 'deplacement' ? [parVoyage, parBien] : [parBien, parVoyage];
  const groupes = grouper(taches, principal);
  groupes.sort(mode === 'deplacement' ? (a, b) => (a.dernier !== b.dernier ? (a.dernier ? 1 : -1) : String(a.ordre).localeCompare(String(b.ordre)) || a.titre.localeCompare(b.titre, 'fr')) : triNom);
  return groupes.map((g) => {
    const sous = grouper(g.items, secondaire).sort(mode === 'deplacement' ? triNom : (a, b) => (a.dernier !== b.dernier ? (a.dernier ? 1 : -1) : String(a.ordre).localeCompare(String(b.ordre))));
    return { ...g, items: tri(g.items), sous: sous.map((s) => ({ ...s, items: tri(s.items) })) };
  });
}

/** Interventions groupées par bien ou par déplacement. ctx = { bien(i), voyage(i) } */
export function classerInterventions(interventions, mode, ctx) {
  const parDate = (a, b) => (a.date_debut || '9999').localeCompare(b.date_debut || '9999');
  const cle = mode === 'deplacement'
    ? (i) => {
        const v = ctx.voyage(i);
        return v ? { id: v.id, titre: v.nom, ordre: v.date_debut || '9999' } : { id: '', titre: 'Sans déplacement', dernier: true };
      }
    : (i) => {
        const b = ctx.bien(i);
        return b ? { id: b.id, titre: b.nom } : { id: '', titre: 'Sans bien', dernier: true };
      };
  const groupes = grouper(interventions, cle);
  groupes.sort(mode === 'deplacement' ? (a, b) => (a.dernier !== b.dernier ? (a.dernier ? 1 : -1) : String(a.ordre).localeCompare(String(b.ordre))) : triNom);
  return groupes.map((g) => ({ ...g, items: g.items.slice().sort(parDate) }));
}
