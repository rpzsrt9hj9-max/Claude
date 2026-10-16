import { useMemo, useState } from 'react';
import { useData, useLocalState } from '../data.js';
import { BigCheck, Button, Empty, Icon, MicButton, Sheet } from '../components/ui.jsx';
import { TacheEditor } from './TacheEditor.jsx';
import { saveTache, setStatutTache, createFromModeles } from '../actions.js';
import { matchesSearch } from '../../shared/match.js';
import {
  STATUTS_TACHE, aujourdhui, comparerEcheance, enRetard, joursDepuis, liens, planification, progressionEtapes, statutTache, tachesGenerales,
} from '../../shared/interventions.js';

/** « aujourd'hui », « 1 jour », « 12 jours »… depuis la création. */
export const ouverteDepuis = (ms) => {
  const j = joursDepuis(ms);
  return j === 0 ? "aujourd'hui" : `${j} jour${j > 1 ? 's' : ''}`;
};

const FILTRES = [
  ['ouvertes', 'À faire'],
  ['reportee', 'Reportées'],
  ['terminee', 'Terminées'],
  ['toutes', 'Toutes'],
];

export const dateCourte = (iso) => (iso ? new Date(`${iso}T00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : '');

/** Sélecteur de biens à choix multiples (puces). Liste vide = tous les biens. */
export function FiltreBiens({ value, onChange, appartements }) {
  const set = new Set(value);
  const basculer = (id) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    onChange([...n]);
  };
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      <button type="button" onClick={() => onChange([])} className={`min-h-11 shrink-0 rounded-full px-4 font-medium ${set.size === 0 ? 'bg-sky-600 text-white' : 'bg-white text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-300'}`}>
        Tous les biens
      </button>
      {appartements.map((a) => (
        <button
          key={a.id}
          type="button"
          aria-pressed={set.has(a.id)}
          onClick={() => basculer(a.id)}
          className={`min-h-11 shrink-0 rounded-full px-4 font-medium ${set.has(a.id) ? 'bg-sky-600 text-white' : 'bg-white text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-300'}`}
        >
          {set.has(a.id) ? '✓ ' : ''}
          {a.nom}
        </button>
      ))}
      <button
        type="button"
        aria-pressed={set.has('')}
        onClick={() => basculer('')}
        className={`min-h-11 shrink-0 rounded-full px-4 text-sm ${set.has('') ? 'bg-sky-600 text-white' : 'bg-white text-slate-500 shadow-sm dark:bg-slate-900'}`}
      >
        Sans bien
      </button>
    </div>
  );
}

/** Liste générale des tâches (indépendante des interventions). */
export function BacklogView() {
  const { data } = useData();
  const [biens, setBiens] = useLocalState('filtre-biens', []);
  const [filtre, setFiltre] = useLocalState('filtre-statut', 'ouvertes');
  const [nonPlanifiees, setNonPlanifiees] = useLocalState('filtre-non-planifiees', false);
  const [q, setQ] = useState('');
  const [quick, setQuick] = useState('');
  const [editing, setEditing] = useState(null); // id | 'new'
  const [choosing, setChoosing] = useState(false);
  const editingTache = editing && editing !== 'new' ? data.taches.find((t) => t.id === editing) : null;

  const appById = useMemo(() => new Map(data.appartements.map((a) => [a.id, a])), [data.appartements]);
  const tousLiens = useMemo(() => liens(data), [data]);
  const jour = aujourdhui();
  const toutes = tachesGenerales(data);
  const compte = (f) => toutes.filter((t) => garder(t, f)).length;

  const visibles = toutes
    .filter((t) => garder(t, filtre))
    .filter((t) => !biens.length || biens.includes(t.appartement_id || ''))
    .filter((t) => !nonPlanifiees || !planification(t.id, data, tousLiens))
    .filter((t) => !q.trim() || matchesSearch(`${t.titre} ${t.description ?? ''} ${appById.get(t.appartement_id)?.nom ?? ''}`, q))
    .sort(comparerEcheance);

  const sections = [
    ['En retard', visibles.filter((t) => enRetard(t, jour))],
    ['Avec échéance', visibles.filter((t) => t.echeance && !enRetard(t, jour))],
    ['Sans échéance', visibles.filter((t) => !t.echeance)],
  ].filter(([, l]) => l.length);

  const bienParDefaut = biens.length === 1 ? biens[0] || null : null;
  const quickAdd = async () => {
    if (!quick.trim()) return;
    await saveTache({ titre: quick, description: '', appartement_id: bienParDefaut, links: [] }, [], 0);
    setQuick('');
  };

  return (
    <div className="space-y-4">
      <FiltreBiens value={biens} onChange={setBiens} appartements={data.appartements} />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTRES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFiltre(id)}
            className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-medium ${filtre === id ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-white text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300'}`}
          >
            {label} <span className="opacity-60">{compte(id)}</span>
          </button>
        ))}
        <button
          type="button"
          aria-pressed={nonPlanifiees}
          onClick={() => setNonPlanifiees(!nonPlanifiees)}
          className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-medium ${nonPlanifiees ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300'}`}
        >
          {nonPlanifiees ? '✓ ' : ''}Non planifiées
        </button>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          quickAdd();
        }}
      >
        <input className="min-w-0 flex-1" placeholder={bienParDefaut ? `Ajout rapide (${appById.get(bienParDefaut)?.nom})…` : 'Ajout rapide d’une tâche…'} value={quick} onChange={(e) => setQuick(e.target.value)} aria-label="Ajout rapide d'une tâche" />
        <MicButton onResult={(t) => setQuick((v) => (v ? `${v} ${t}` : t.charAt(0).toUpperCase() + t.slice(1)))} />
        <Button type="submit" variant="primary" icon="plus" aria-label="Ajouter" className="!px-3" />
      </form>

      {toutes.length > 8 && <input type="search" className="w-full" placeholder="🔍 Filtrer les tâches" value={q} onChange={(e) => setQ(e.target.value)} />}

      {sections.length === 0 && <Empty>{toutes.length ? 'Aucune tâche avec ces filtres.' : 'Aucune tâche. Ajoute-en une avec le bouton +'}</Empty>}

      {sections.map(([titre, list]) => (
        <section key={titre}>
          <h2 className={`mb-2 text-sm font-bold tracking-wide uppercase ${titre === 'En retard' ? 'text-red-600' : 'text-slate-500'}`}>
            {titre} <span className="font-normal">({list.length})</span>
          </h2>
          <ul className="space-y-2">
            {list.map((t) => (
              <LigneTache key={t.id} tache={t} app={appById.get(t.appartement_id)} intervention={planification(t.id, data, tousLiens)} onOpen={() => setEditing(t.id)} />
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
        <TacheEditor key={editing} tache={editingTache} defaultAppartementId={bienParDefaut} onClose={() => setEditing(null)} onOpen={(id) => setEditing(id)} />
      )}
      {choosing && (
        <ChoixModele
          onClose={() => setChoosing(false)}
          onVide={() => {
            setChoosing(false);
            setEditing('new');
          }}
          onModeles={async (modeles) => {
            const ids = await createFromModeles(modeles, data, null, bienParDefaut);
            setChoosing(false);
            if (ids.length === 1) setEditing(ids[0]);
          }}
        />
      )}
    </div>
  );
}

function garder(t, filtre) {
  const s = statutTache(t);
  if (filtre === 'toutes') return true;
  if (filtre === 'ouvertes') return s !== 'terminee';
  return s === filtre;
}

/** Choix de la nouvelle tâche : vide, ou une ou plusieurs tâches types d'un coup. */
export function ChoixModele({ onClose, onVide, onModeles }) {
  const { data } = useData();
  const [choix, setChoix] = useState(() => new Set());
  const [envoi, setEnvoi] = useState(false);
  const basculer = (id) =>
    setChoix((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  return (
    <Sheet
      title="Nouvelle tâche"
      onClose={onClose}
      footer={
        choix.size > 0 && (
          <Button
            variant="primary"
            icon="plus"
            className="w-full text-lg"
            disabled={envoi}
            onClick={async () => {
              setEnvoi(true);
              try {
                await onModeles(data.modeles.filter((m) => choix.has(m.id)));
              } finally {
                setEnvoi(false);
              }
            }}
          >
            Créer {choix.size} tâche{choix.size > 1 ? 's' : ''}
          </Button>
        )
      }
    >
      <div className="space-y-2">
        <Button variant="secondary" icon="plus" className="w-full !min-h-14 text-lg" onClick={onVide}>
          Tâche vide
        </Button>
        <h3 className="pt-3 text-sm font-bold text-slate-500 uppercase">Tâches types (plusieurs choix possibles)</h3>
        {data.modeles.map((m) => {
          const n = data.tache_articles.filter((l) => l.tache_id === m.id).length;
          const coche = choix.has(m.id);
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={coche}
              className={`flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left shadow-sm ${coche ? 'bg-violet-100 ring-2 ring-violet-500 dark:bg-violet-500/20' : 'bg-white dark:bg-slate-900'}`}
              onClick={() => basculer(m.id)}
            >
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg border-2 ${coche ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                {coche && <Icon name="check" strokeWidth={3} />}
              </span>
              <span className="flex-1">
                <span className="block font-semibold">📋 {m.titre}</span>
                <span className="text-sm text-slate-500">{n} article(s)</span>
              </span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

/** Ligne de tâche de la liste générale. */
export function LigneTache({ tache, app, intervention, onOpen, extra }) {
  const { data } = useData();
  const s = statutTache(tache);
  const fait = s === 'terminee';
  const retard = enRetard(tache);
  const etapes = progressionEtapes(tache.description);
  const nbCom = (data.commentaires || []).filter((c) => c.tache_id === tache.id).length;
  const nbArt = data.tache_articles.filter((l) => l.tache_id === tache.id).length;
  return (
    <li className={`flex items-center gap-3 rounded-2xl p-2 shadow-sm ${fait ? 'bg-slate-100 opacity-60 dark:bg-slate-900/50' : 'bg-white dark:bg-slate-900'}`}>
      <BigCheck size="size-12" etat={fait ? 'complet' : 'vide'} label={fait ? 'Remettre à traiter' : 'Marquer terminée'} onClick={() => setStatutTache(tache, fait ? 'a_traiter' : 'terminee')} />
      <button type="button" className="min-h-12 min-w-0 flex-1 text-left" onClick={onOpen}>
        <span className={`block font-semibold break-words ${fait ? 'line-through' : ''}`}>{tache.titre}</span>
        <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
          {app && <span>🏠 {app.nom}</span>}
          {tache.echeance && <span className={retard ? 'font-bold text-red-600' : ''}>📅 {dateCourte(tache.echeance)}</span>}
          {s === 'reportee' && <span className="font-semibold text-amber-600">{STATUTS_TACHE.reportee}</span>}
          {intervention && <span className="text-sky-700 dark:text-sky-400">🚐 {intervention.nom}</span>}
          {!fait && tache.created_at && <span title={`Créée le ${new Date(tache.created_at).toLocaleDateString('fr-FR')}`}>⏳ {ouverteDepuis(tache.created_at)}</span>}
          {etapes.total > 0 && <span>☑️ {etapes.faites}/{etapes.total}</span>}
          {nbArt > 0 && <span>🧰 {nbArt}</span>}
          {nbCom > 0 && <span>💬 {nbCom}</span>}
        </span>
        {extra}
      </button>
      <Icon name="chevron" className="size-5 shrink-0 text-slate-400" />
    </li>
  );
}
