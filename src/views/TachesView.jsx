import { useMemo, useState } from 'react';
import { useData, useLocalState } from '../data.js';
import { BigCheck, Button, Empty, Icon, Pill, MicButton } from '../components/ui.jsx';
import { Etapes } from '../components/Etapes.jsx';
import { TacheEditor } from './TacheEditor.jsx';
import { BoutonAjout, ChoixModele, dateCourte } from './BacklogView.jsx';
import { useReglages } from '../reglages.js';
import { ChoixTaches } from './ChoixTaches.jsx';
import { saveTache, setStatutTache, createFromModeles, addTachesToIntervention, addTachesToVoyage, retirerTacheAnnulable, supprimerTache } from '../actions.js';
import { Glissable } from '../components/Glissable.jsx';
import { BoutonTacheChrono, formatEstimation } from '../components/Chrono.jsx';
import { estimerTache, indexTaches, tempsTache } from '../../shared/estimations.js';
import { formatDuree } from '../../shared/temps.js';
import { bienIntervention, interventionsDuVoyage } from '../../shared/voyages.js';
import { TYPES, TYPE_ICON, TYPE_ORDER } from '../../shared/schema.js';
import { STATUTS_TACHE, enRetard, statutTache } from '../../shared/interventions.js';

/** Onglet « Tâches » d'une intervention. */
export function TachesView() {
  const { data, trip, dep, voyage, interventionId } = useData();
  const bien = bienIntervention(dep, data);
  const { dense, ajoutRapide } = useReglages();
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
  const indexEstim = useMemo(() => indexTaches(data), [data]);
  const surPlace = trip.taches.filter((t) => statutTache(t.tache) !== 'terminee').reduce((s, t) => s + (estimerTache(t.tache, data, indexEstim)?.mediane ?? 0), 0);

  const quickAdd = async () => {
    if (!quick.trim()) return;
    const id = await saveTache({ titre: quick, description: '', appartement_id: filtreActif || bien || null, links: [] }, [], 0);
    await addTachesToIntervention(interventionId, [id], { ...data, taches: [...data.taches, { id }] });
    setQuick('');
  };

  return (
    <div className={dense ? 'space-y-2' : 'space-y-4'}>
      <div className="flex flex-wrap gap-x-1.5 text-sm text-slate-600 dark:text-slate-400 [&>span]:whitespace-nowrap">
        <span>{trip.taches.length} tâches</span>·<span className="text-emerald-700 dark:text-emerald-400">{nbPretes} prêtes</span>·<span>{nbFaites} terminées</span>
        {surPlace > 0 && (
          <>
            ·<span>sur place ≈ {formatDuree(surPlace)}</span>
          </>
        )}
      </div>

      {ouverte && (
        <Button variant="primary" icon="plus" className={`w-full ${dense ? '' : '!min-h-14 text-lg'}`} onClick={() => setAjout(true)}>
          Ajouter des tâches
        </Button>
      )}

      {appsUsed.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {[['', 'Tous les biens'], ...appsUsed.map((a) => [a.id, a.nom])].map(([id, nom]) => (
            <button
              key={id || 'all'}
              type="button"
              onClick={() => setFiltre(id)}
              className={`${dense ? 'min-h-8 px-3 text-xs' : 'min-h-11 px-4'} shrink-0 rounded-full font-medium ${filtreActif === id ? 'bg-sky-600 text-white' : 'bg-white text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-300'}`}
            >
              {nom}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMasquerFaites(!masquerFaites)}
            className={`${dense ? 'min-h-8 px-3 text-xs' : 'min-h-11 px-4 text-sm'} shrink-0 rounded-full ${masquerFaites ? 'bg-slate-700 text-white' : 'bg-white text-slate-500 shadow-sm dark:bg-slate-900'}`}
          >
            {masquerFaites ? 'Terminées masquées' : 'Masquer terminées'}
          </button>
        </div>
      )}

      {ouverte && ajoutRapide && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            quickAdd();
          }}
        >
          <input className={`min-w-0 flex-1 ${dense ? '!min-h-10' : ''}`} placeholder="Nouvelle tâche pour cette intervention…" value={quick} onChange={(e) => setQuick(e.target.value)} aria-label="Ajout rapide d'une tâche" />
          <MicButton onResult={(t) => setQuick((v) => (v ? `${v} ${t}` : t.charAt(0).toUpperCase() + t.slice(1)))} />
          <Button type="submit" variant="secondary" icon="plus" aria-label="Créer" className="!px-3" />
        </form>
      )}

      {groups.length === 0 && <Empty>Aucune tâche dans cette intervention.</Empty>}

      {groups.map(([appId, list]) => (
        <section key={appId}>
          {groups.length > 1 && (
            <h2 className="mb-1.5 flex items-center gap-2 text-sm font-bold tracking-wide text-slate-500 uppercase">
              <Icon name="home" className="size-4" /> {appById.get(appId)?.nom ?? 'Sans bien'}
            </h2>
          )}
          <ul className={dense ? 'space-y-1' : 'space-y-2'}>
            {list.map((t) => (
              <TacheRow
                key={t.tache.id}
                info={t}
                dense={dense}
                onOpen={() => setEditing(t.tache.id)}
                onRetirer={ouverte ? () => retirerTacheAnnulable(interventionId, t.tache, data) : null}
                onSupprimer={() => supprimerTache(t.tache, data)}
              />
            ))}
          </ul>
        </section>
      ))}

      {ouverte && <BoutonAjout onClick={() => (data.modeles.length ? setChoosing(true) : setEditing('new'))} label="Nouvelle tâche" />}

      {(editing === 'new' || editingTache) && (
        <TacheEditor key={editing} tache={editingTache} defaultAppartementId={filtreActif || bien} interventionId={interventionId} onClose={() => setEditing(null)} onOpen={(id) => setEditing(id)} />
      )}
      {choosing && (
        <ChoixModele
          onClose={() => setChoosing(false)}
          onVide={() => {
            setChoosing(false);
            setEditing('new');
          }}
          onModeles={async (modeles) => {
            const ids = await createFromModeles(modeles, data, interventionId, filtreActif || bien);
            setChoosing(false);
            if (ids.length === 1) setEditing(ids[0]);
          }}
        />
      )}
      {ajout && (
        <ChoixTaches
          intervention={interventionsDuVoyage(voyage.id, data).map((i) => i.id)}
          biensParDefaut={bien ? [bien] : undefined}
          onClose={() => setAjout(false)}
          onValider={async (ids) => {
            // Chaque tâche rejoint l'intervention de son bien dans ce déplacement.
            await addTachesToVoyage(voyage, ids, data);
            setAjout(false);
          }}
        />
      )}
    </div>
  );
}

function TacheRow({ info, onOpen, onRetirer, onSupprimer, dense }) {
  const { ctxChrono, data } = useData();
  const passe = tempsTache(info.tache.id, data);
  const estim = estimerTache(info.tache, data);
  const temps = (passe > 0 || estim) && (
    <span className="text-xs text-slate-500">
      {passe > 0 && `⏱ ${formatDuree(passe)}`}
      {passe > 0 && estim ? ' / ' : ''}
      {estim && formatEstimation(estim, true)}
    </span>
  );
  const { tache, prete, byType } = info;
  const statut = statutTache(tache);
  const fait = statut === 'terminee';
  // Fonds opaques : la couleur du glissement apparaît dessous.
  const tone = fait ? 'bg-slate-100 dark:bg-slate-900' : prete ? 'bg-emerald-50 ring-2 ring-inset ring-emerald-500/60 dark:bg-emerald-950' : 'bg-white dark:bg-slate-900';
  const pastilles = TYPE_ORDER.map((type) => {
    const list = byType[type] ?? [];
    if (!list.length) return null;
    const done = list.filter((x) => x.item.status.complet).length;
    return (
      <Pill key={type} ok={done === list.length}>
        {TYPE_ICON[type]} {TYPES[type]} {done === list.length ? '✓' : `${done}/${list.length}`}
      </Pill>
    );
  });
  const glisse = { retirer: onRetirer, supprimer: onSupprimer, libelleRetirer: 'Retirer de l’intervention' };
  if (dense)
    return (
      <Glissable className="rounded-xl shadow-sm" fond={fait ? 'bg-slate-100 dark:bg-slate-900' : 'bg-white dark:bg-slate-900'} {...glisse}>
      <div className={`flex items-center gap-2 py-1 pr-1 pl-2.5 ${fait ? 'opacity-60' : ''}`}>
        <BigCheck compact etat={fait ? 'complet' : 'vide'} label={fait ? 'Remettre à traiter' : 'Marquer terminée'} onClick={() => setStatutTache(tache, fait ? 'a_traiter' : 'terminee')} />
        <button type="button" className="min-h-11 min-w-0 flex-1 text-left" onClick={onOpen}>
          <span className={`flex items-center gap-1.5 text-[15px] font-semibold ${fait ? 'line-through' : ''}`}>
            {!fait && prete && <span className="size-2.5 shrink-0 rounded-full bg-emerald-500" title="Prête" aria-label="Prête" />}
            <span className="truncate">{tache.titre}</span>
          </span>
          {temps}
          {(tache.echeance || statut === 'reportee' || statut === 'en_cours') && (
            <span className="block truncate text-xs text-slate-500">
              {tache.echeance && <span className={enRetard(tache) ? 'font-bold text-red-600' : ''}>📅 {dateCourte(tache.echeance)}</span>}
              {statut === 'reportee' && <span className="font-semibold text-amber-600"> · {STATUTS_TACHE.reportee}</span>}
              {statut === 'en_cours' && <span className="font-semibold text-violet-600"> · {STATUTS_TACHE.en_cours}</span>}
            </span>
          )}
          <span className="mt-0.5 hidden flex-wrap gap-1 sm:flex">{pastilles}</span>
        </button>
        {!fait && ctxChrono && <BoutonTacheChrono tache={tache} ctx={ctxChrono} />}
      </div>
      </Glissable>
    );
  return (
    <Glissable className="rounded-2xl shadow-sm" fond={tone} {...glisse}>
    <div className={`p-2 ${fait ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        <BigCheck size="size-12" etat={fait ? 'complet' : 'vide'} label={fait ? 'Remettre à traiter' : 'Marquer terminée'} onClick={() => setStatutTache(tache, fait ? 'a_traiter' : 'terminee')} />
        <button type="button" className="min-h-12 min-w-0 flex-1 text-left" onClick={onOpen}>
          <span className={`block font-semibold break-words ${fait ? 'line-through' : ''}`}>{tache.titre}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1">
            {tache.echeance && <span className={`text-xs ${enRetard(tache) ? 'font-bold text-red-600' : 'text-slate-500'}`}>📅 {dateCourte(tache.echeance)}</span>}
            {statut === 'reportee' && <span className="text-xs font-semibold text-amber-600">{STATUTS_TACHE.reportee}</span>}
            {statut === 'en_cours' && <span className="text-xs font-semibold text-violet-600">{STATUTS_TACHE.en_cours}</span>}
            {pastilles}
            {!fait && prete && <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">✓ Prête</span>}
            {temps}
          </span>
        </button>
        {!fait && ctxChrono && <BoutonTacheChrono tache={tache} ctx={ctxChrono} />}
      </div>
      {!fait && tache.description?.includes('[') && (
        <div className="mt-1 pl-14">
          <Etapes description={tache.description} tache={tache} compact />
        </div>
      )}
    </div>
    </Glissable>
  );
}
