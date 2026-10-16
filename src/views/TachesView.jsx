import { useMemo, useState } from 'react';
import { useData, useLocalState } from '../data.js';
import { BigCheck, Button, Empty, Icon, Pill, MicButton } from '../components/ui.jsx';
import { Etapes } from '../components/Etapes.jsx';
import { TacheEditor } from './TacheEditor.jsx';
import { ChoixModele, dateCourte } from './BacklogView.jsx';
import { ChoixTaches } from './ChoixTaches.jsx';
import { saveTache, setStatutTache, createFromModele, addTachesToIntervention, removeTacheFromIntervention } from '../actions.js';
import { TYPES, TYPE_ICON, TYPE_ORDER } from '../../shared/schema.js';
import { STATUTS_TACHE, enRetard, statutTache } from '../../shared/interventions.js';

/** Onglet « Tâches » d'une intervention. */
export function TachesView() {
  const { data, trip, depId, dep } = useData();
  const [filtre, setFiltre] = useLocalState('filtre-appartement', '');
  const [masquerFaites, setMasquerFaites] = useLocalState('masquer-faites', false);
  const [editing, setEditing] = useState(null); // id de tâche | 'new' | null
  const editingTache = editing && editing !== 'new' ? data.taches.find((t) => t.id === editing) : null;
  const [quick, setQuick] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [ajout, setAjout] = useState(false);
  const ouverte = dep.statut !== 'termine';

  const appById = useMemo(() => new Map(data.appartements.map((a) => [a.id, a])), [data.appartements]);
  const appsUsed = useMemo(() => {
    const ids = new Set(trip.taches.map((t) => t.tache.appartement_id));
    return data.appartements.filter((a) => ids.has(a.id));
  }, [trip, data.appartements]);
  const filtreActif = appsUsed.some((a) => a.id === filtre) ? filtre : '';

  const visible = trip.taches.filter((t) => (!filtreActif || t.tache.appartement_id === filtreActif) && (!masquerFaites || statutTache(t.tache) !== 'terminee'));
  const groups = useMemo(() => {
    const m = new Map();
    for (const t of visible) {
      const k = t.tache.appartement_id || '';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(t);
    }
    return [...m.entries()].sort(([a], [b]) => (appById.get(a)?.nom || 'zzz').localeCompare(appById.get(b)?.nom || 'zzz', 'fr'));
  }, [visible, appById]);

  const nbPretes = trip.taches.filter((t) => t.prete).length;
  const nbFaites = trip.taches.filter((t) => statutTache(t.tache) === 'terminee').length;

  const quickAdd = async () => {
    if (!quick.trim()) return;
    const id = await saveTache({ titre: quick, description: '', appartement_id: filtreActif || null, links: [] }, [], 0);
    await addTachesToIntervention(depId, [id], { ...data, taches: [...data.taches, { id }] });
    setQuick('');
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 text-sm text-slate-600 dark:text-slate-400">
        <span>{trip.taches.length} tâches</span>·<span className="text-emerald-700 dark:text-emerald-400">{nbPretes} prêtes</span>·<span>{nbFaites} terminées</span>
      </div>

      {ouverte && (
        <Button variant="primary" icon="plus" className="w-full !min-h-14 text-lg" onClick={() => setAjout(true)}>
          Ajouter des tâches de la liste
        </Button>
      )}

      {appsUsed.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {[['', 'Tous les biens'], ...appsUsed.map((a) => [a.id, a.nom])].map(([id, nom]) => (
            <button
              key={id || 'all'}
              type="button"
              onClick={() => setFiltre(id)}
              className={`min-h-11 shrink-0 rounded-full px-4 font-medium ${filtreActif === id ? 'bg-sky-600 text-white' : 'bg-white text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-300'}`}
            >
              {nom}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMasquerFaites(!masquerFaites)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm ${masquerFaites ? 'bg-slate-700 text-white' : 'bg-white text-slate-500 shadow-sm dark:bg-slate-900'}`}
          >
            {masquerFaites ? 'Terminées masquées' : 'Masquer terminées'}
          </button>
        </div>
      )}

      {ouverte && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            quickAdd();
          }}
        >
          <input className="min-w-0 flex-1" placeholder="Nouvelle tâche pour cette intervention…" value={quick} onChange={(e) => setQuick(e.target.value)} aria-label="Ajout rapide d'une tâche" />
          <MicButton onResult={(t) => setQuick((v) => (v ? `${v} ${t}` : t.charAt(0).toUpperCase() + t.slice(1)))} />
          <Button type="submit" variant="secondary" icon="plus" aria-label="Créer" className="!px-3" />
        </form>
      )}

      {groups.length === 0 && <Empty>Aucune tâche dans cette intervention.</Empty>}

      {groups.map(([appId, list]) => (
        <section key={appId}>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold tracking-wide text-slate-500 uppercase">
            <Icon name="home" className="size-4" /> {appById.get(appId)?.nom ?? 'Sans bien'}
          </h2>
          <ul className="space-y-2">
            {list.map((t) => (
              <TacheRow
                key={t.tache.id}
                info={t}
                onOpen={() => setEditing(t.tache.id)}
                onRemove={ouverte ? () => confirm(`Retirer « ${t.tache.titre} » de l'intervention ? Elle reste dans la liste des tâches.`) && removeTacheFromIntervention(depId, t.tache.id, data) : null}
              />
            ))}
          </ul>
        </section>
      ))}

      {ouverte && (
        <button
          type="button"
          onClick={() => (data.modeles.length ? setChoosing(true) : setEditing('new'))}
          aria-label="Nouvelle tâche"
          className="fixed right-4 bottom-24 z-30 flex size-16 items-center justify-center rounded-full bg-sky-600 text-white shadow-lg active:scale-95"
        >
          <Icon name="plus" className="size-8" strokeWidth={2.5} />
        </button>
      )}

      {(editing === 'new' || editingTache) && (
        <TacheEditor key={editing} tache={editingTache} defaultAppartementId={filtreActif} interventionId={depId} onClose={() => setEditing(null)} onOpen={(id) => setEditing(id)} />
      )}
      {choosing && (
        <ChoixModele
          onClose={() => setChoosing(false)}
          onVide={() => {
            setChoosing(false);
            setEditing('new');
          }}
          onModele={async (m) => {
            const id = await createFromModele(m, data, depId, filtreActif, 0);
            setChoosing(false);
            setEditing(id);
          }}
        />
      )}
      {ajout && (
        <ChoixTaches
          intervention={dep}
          onClose={() => setAjout(false)}
          onValider={async (ids) => {
            await addTachesToIntervention(depId, ids, data);
            setAjout(false);
          }}
        />
      )}
    </div>
  );
}

function TacheRow({ info, onOpen, onRemove }) {
  const { tache, prete, byType } = info;
  const statut = statutTache(tache);
  const fait = statut === 'terminee';
  const tone = fait
    ? 'bg-slate-100 opacity-60 dark:bg-slate-900/50'
    : prete
      ? 'bg-emerald-50 ring-2 ring-emerald-500/60 dark:bg-emerald-500/10'
      : 'bg-white dark:bg-slate-900';
  return (
    <li className={`rounded-2xl p-2 shadow-sm ${tone}`}>
      <div className="flex items-center gap-3">
        <BigCheck size="size-12" etat={fait ? 'complet' : 'vide'} label={fait ? 'Remettre à traiter' : 'Marquer terminée'} onClick={() => setStatutTache(tache, fait ? 'a_traiter' : 'terminee')} />
        <button type="button" className="min-h-12 min-w-0 flex-1 text-left" onClick={onOpen}>
          <span className={`block font-semibold break-words ${fait ? 'line-through' : ''}`}>{tache.titre}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1">
            {tache.echeance && <span className={`text-xs ${enRetard(tache) ? 'font-bold text-red-600' : 'text-slate-500'}`}>📅 {dateCourte(tache.echeance)}</span>}
            {statut === 'reportee' && <span className="text-xs font-semibold text-amber-600">{STATUTS_TACHE.reportee}</span>}
            {TYPE_ORDER.map((type) => {
              const list = byType[type];
              if (!list.length) return null;
              const done = list.filter((x) => x.item.status.complet).length;
              return (
                <Pill key={type} ok={done === list.length}>
                  {TYPE_ICON[type]} {TYPES[type]} {done === list.length ? '✓' : `${done}/${list.length}`}
                </Pill>
              );
            })}
            {!fait && prete && <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">✓ Prête</span>}
          </span>
        </button>
        {onRemove && <Button variant="ghost" icon="x" aria-label={`Retirer ${tache.titre} de l'intervention`} className="!px-2 text-slate-400" onClick={onRemove} />}
      </div>
      {!fait && tache.description?.includes('[') && (
        <div className="mt-1 pl-14">
          <Etapes description={tache.description} tache={tache} compact />
        </div>
      )}
    </li>
  );
}
