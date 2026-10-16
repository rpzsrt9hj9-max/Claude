import { useMemo, useState } from 'react';
import { useData, useLocalState } from '../data.js';
import { BigCheck, Button, Empty, Icon, Pill, MicButton, Sheet } from '../components/ui.jsx';
import { TacheEditor } from './TacheEditor.jsx';
import { saveTache, setFait, createFromModele } from '../actions.js';
import { TYPES, TYPE_ICON, TYPE_ORDER } from '../../shared/schema.js';

export function TachesView() {
  const { data, trip, depId } = useData();
  const [filtre, setFiltre] = useLocalState('filtre-appartement', '');
  const [masquerFaites, setMasquerFaites] = useLocalState('masquer-faites', false);
  const [editing, setEditing] = useState(null); // id de tâche | 'new' | null
  // La tâche est relue dans les données à jour (utile juste après une duplication).
  const editingTache = editing && editing !== 'new' ? data.taches.find((t) => t.id === editing) : null;
  const [quick, setQuick] = useState('');
  const [choosing, setChoosing] = useState(false);

  const appById = useMemo(() => new Map(data.appartements.map((a) => [a.id, a])), [data.appartements]);
  const appsUsed = useMemo(() => {
    const ids = new Set(trip.taches.map((t) => t.tache.appartement_id));
    return data.appartements.filter((a) => ids.has(a.id));
  }, [trip, data.appartements]);

  const visible = trip.taches.filter((t) => (!filtre || t.tache.appartement_id === filtre) && (!masquerFaites || !t.tache.fait));
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
  const nbFaites = trip.taches.filter((t) => t.tache.fait).length;

  const quickAdd = async () => {
    if (!quick.trim()) return;
    const ordre = Math.max(0, ...trip.taches.map((t) => t.tache.ordre || 0)) + 1;
    await saveTache({ deplacement_id: depId, titre: quick, description: '', appartement_id: filtre || null, links: [] }, [], ordre);
    setQuick('');
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 text-sm text-slate-600 dark:text-slate-400">
        <span>{trip.taches.length} tâches</span>·<span className="text-emerald-700 dark:text-emerald-400">{nbPretes} prêtes</span>·<span>{nbFaites} faites</span>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[['', 'Toutes'], ...appsUsed.map((a) => [a.id, a.nom])].map(([id, nom]) => (
          <button
            key={id || 'all'}
            type="button"
            onClick={() => setFiltre(id)}
            className={`min-h-11 shrink-0 rounded-full px-4 font-medium ${filtre === id ? 'bg-sky-600 text-white' : 'bg-white text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-300'}`}
          >
            {nom}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMasquerFaites(!masquerFaites)}
          className={`min-h-11 shrink-0 rounded-full px-4 text-sm ${masquerFaites ? 'bg-slate-700 text-white' : 'bg-white text-slate-500 shadow-sm dark:bg-slate-900'}`}
        >
          {masquerFaites ? 'Faites masquées' : 'Masquer faites'}
        </button>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          quickAdd();
        }}
      >
        <input className="min-w-0 flex-1" placeholder="Ajout rapide d'une tâche…" value={quick} onChange={(e) => setQuick(e.target.value)} aria-label="Ajout rapide d'une tâche" />
        <MicButton onResult={(t) => setQuick((v) => (v ? `${v} ${t}` : t.charAt(0).toUpperCase() + t.slice(1)))} />
        <Button type="submit" variant="primary" icon="plus" aria-label="Ajouter" className="!px-3" />
      </form>

      {groups.length === 0 && <Empty>Aucune tâche. Ajoute-en une avec le bouton +</Empty>}

      {groups.map(([appId, list]) => (
        <section key={appId}>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
            <Icon name="home" className="size-4" /> {appById.get(appId)?.nom ?? 'Sans appartement'}
          </h2>
          <ul className="space-y-2">
            {list.map((t) => (
              <TacheRow key={t.tache.id} info={t} onOpen={() => setEditing(t.tache.id)} />
            ))}
          </ul>
        </section>
      ))}

      <button
        type="button"
        onClick={() => (data.modeles.length ? setChoosing(true) : setEditing('new'))}
        aria-label="Nouvelle tâche"
        className="fixed right-4 bottom-24 z-30 flex size-16 items-center justify-center rounded-full bg-sky-600 text-white shadow-lg active:scale-95"
      >
        <Icon name="plus" className="size-8" strokeWidth={2.5} />
      </button>

      {(editing === 'new' || editingTache) && (
        <TacheEditor
          key={editing}
          tache={editingTache}
          defaultAppartementId={filtre}
          onClose={() => setEditing(null)}
          onOpen={(id) => setEditing(id)}
        />
      )}

      {choosing && (
        <Sheet title="Nouvelle tâche" onClose={() => setChoosing(false)}>
          <div className="space-y-2">
            <Button variant="primary" icon="plus" className="w-full !min-h-14 text-lg" onClick={() => { setChoosing(false); setEditing('new'); }}>
              Tâche vide
            </Button>
            <h3 className="pt-3 text-sm font-bold uppercase text-slate-500">À partir d'une tâche type</h3>
            {data.modeles.map((m) => {
              const n = data.tache_articles.filter((l) => l.tache_id === m.id).length;
              return (
                <button
                  key={m.id}
                  type="button"
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-white px-4 text-left shadow-sm active:bg-violet-100 dark:bg-slate-900"
                  onClick={async () => {
                    const ordre = Math.max(0, ...trip.taches.map((t) => t.tache.ordre || 0)) + 1;
                    const id = await createFromModele(m, data, depId, filtre, ordre);
                    setChoosing(false);
                    setEditing(id);
                  }}
                >
                  <span className="text-2xl">📋</span>
                  <span className="flex-1">
                    <span className="block font-semibold">{m.titre}</span>
                    <span className="text-sm text-slate-500">{n} article(s)</span>
                  </span>
                  <Icon name="chevron" className="size-5 text-slate-400" />
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
    </div>
  );
}

function TacheRow({ info, onOpen }) {
  const { tache, prete, byType } = info;
  const fait = !!tache.fait;
  const tone = fait
    ? 'bg-slate-100 opacity-60 dark:bg-slate-900/50'
    : prete
      ? 'bg-emerald-50 ring-2 ring-emerald-500/60 dark:bg-emerald-500/10'
      : 'bg-white dark:bg-slate-900';
  return (
    <li className={`flex items-center gap-3 rounded-2xl p-2 shadow-sm ${tone}`}>
      <BigCheck size="size-12" etat={fait ? 'complet' : 'vide'} label={fait ? 'Marquer non faite' : 'Marquer faite'} onClick={() => setFait(tache, !fait)} />
      <button type="button" className="min-h-12 min-w-0 flex-1 text-left" onClick={onOpen}>
        <span className={`block font-semibold ${fait ? 'line-through' : ''}`}>{tache.titre}</span>
        <span className="mt-1 flex flex-wrap gap-1">
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
      <Icon name="chevron" className="size-5 shrink-0 text-slate-400" />
    </li>
  );
}
