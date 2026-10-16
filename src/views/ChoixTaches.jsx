import { useMemo, useState } from 'react';
import { useData, useLocalState } from '../data.js';
import { Button, Empty, Icon, Sheet } from '../components/ui.jsx';
import { FiltreBiens, dateCourte } from './BacklogView.jsx';
import { STATUTS_TACHE, candidats, enRetard, statutTache } from '../../shared/interventions.js';

/**
 * Choix des tâches d'une intervention, avec filtres par biens (choix multiple) et par échéance.
 * Les tâches déjà prévues dans une autre intervention ouverte sont dans une section à part ;
 * les choisir les déplace (après confirmation).
 * intervention : ligne existante, ou null pendant la création.
 */
export function ChoixTaches({ intervention, titre = 'Ajouter des tâches', bouton = 'Ajouter', onClose, onValider, enTete }) {
  const { data } = useData();
  const [biens, setBiens] = useLocalState('choix-biens', []);
  const [echeanceMax, setEcheanceMax] = useState('');
  const [choix, setChoix] = useState(() => new Set());
  const [envoi, setEnvoi] = useState(false);
  const appById = useMemo(() => new Map(data.appartements.map((a) => [a.id, a])), [data.appartements]);

  const { libres, ailleurs } = candidats(intervention?.id ?? null, data, { appartements: biens, echeanceMax: echeanceMax || null });
  const basculer = (id) =>
    setChoix((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const choisirAilleurs = ({ tache, intervention: autre }) => {
    if (choix.has(tache.id)) return basculer(tache.id);
    const cible = intervention ? `« ${intervention.nom} »` : 'la nouvelle';
    if (confirm(`Retirer « ${tache.titre} » de l'intervention « ${autre.nom} » pour l'attribuer à ${cible} ?`)) basculer(tache.id);
  };
  const toutLibre = libres.length > 0 && libres.every((t) => choix.has(t.id));

  const ligne = (t, coche, onClick, note) => (
    <li key={t.id}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={coche}
        className={`flex min-h-14 w-full items-center gap-3 rounded-2xl p-2 text-left shadow-sm ${coche ? 'bg-sky-100 ring-2 ring-sky-500 dark:bg-sky-500/20' : 'bg-white dark:bg-slate-900'}`}
      >
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg border-2 ${coche ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
          {coche && <Icon name="check" strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold break-words">{t.titre}</span>
          <span className="flex flex-wrap gap-x-3 text-xs text-slate-500">
            {appById.get(t.appartement_id) && <span>🏠 {appById.get(t.appartement_id).nom}</span>}
            {t.echeance && <span className={enRetard(t) ? 'font-bold text-red-600' : ''}>📅 {dateCourte(t.echeance)}</span>}
            {statutTache(t) === 'reportee' && <span className="font-semibold text-amber-600">{STATUTS_TACHE.reportee}</span>}
            {note}
          </span>
        </span>
      </button>
    </li>
  );

  return (
    <Sheet
      title={titre}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          className="w-full text-lg"
          icon="check"
          disabled={envoi || (!choix.size && !enTete)}
          onClick={async () => {
            setEnvoi(true);
            try {
              await onValider([...choix]);
            } finally {
              setEnvoi(false);
            }
          }}
        >
          {bouton}
          {choix.size ? ` (${choix.size} tâche${choix.size > 1 ? 's' : ''})` : ''}
        </Button>
      }
    >
      <div className="space-y-4">
        {enTete}
        <FiltreBiens value={biens} onChange={setBiens} appartements={data.appartements} />
        <label className="flex items-center gap-2">
          <span className="shrink-0 text-sm font-medium text-slate-600 dark:text-slate-400">Échéance avant le</span>
          <input type="date" className="min-w-0 flex-1" value={echeanceMax} onChange={(e) => setEcheanceMax(e.target.value)} />
          {echeanceMax && <Button variant="ghost" icon="x" aria-label="Sans filtre de date" className="!px-2" onClick={() => setEcheanceMax('')} />}
        </label>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-500 uppercase">À planifier ({libres.length})</h3>
            {libres.length > 0 && (
              <button
                type="button"
                className="min-h-11 px-2 text-sm font-medium text-sky-700 dark:text-sky-400"
                onClick={() => setChoix((s) => {
                  const n = new Set(s);
                  libres.forEach((t) => (toutLibre ? n.delete(t.id) : n.add(t.id)));
                  return n;
                })}
              >
                {toutLibre ? 'Tout décocher' : 'Tout cocher'}
              </button>
            )}
          </div>
          {libres.length ? <ul className="space-y-2">{libres.map((t) => ligne(t, choix.has(t.id), () => basculer(t.id)))}</ul> : <Empty>Aucune tâche à planifier avec ces filtres.</Empty>}
        </section>

        {ailleurs.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-bold text-slate-500 uppercase">Déjà prévues ailleurs ({ailleurs.length})</h3>
            <ul className="space-y-2 opacity-90">
              {ailleurs.map((a) => ligne(a.tache, choix.has(a.tache.id), () => choisirAilleurs(a), <span className="text-sky-700 dark:text-sky-400">🚐 {a.intervention.nom}</span>))}
            </ul>
          </section>
        )}
      </div>
    </Sheet>
  );
}
