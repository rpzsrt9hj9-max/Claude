import { useMemo, useState } from 'react';
import { useData, useLocalState } from '../data.js';
import { BigCheck, Button, Empty, Icon, MicButton, Sheet } from '../components/ui.jsx';
import { TacheEditor } from './TacheEditor.jsx';
import { saveTache, setStatutTache, createFromModeles } from '../actions.js';
import { matchesSearch } from '../../shared/match.js';
import { STATUTS_TACHE, enRetard, joursDepuis, liens, planification, progressionEtapes, statutTache, tachesGenerales } from '../../shared/interventions.js';
import { CLASSEMENTS_TACHES, classerTaches } from '../../shared/classement.js';
import { libellePlanification, trouverVoyage, voyageDe } from '../../shared/voyages.js';
import { refTache } from '../../shared/references.js';
import { useReglages } from '../reglages.js';

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
export function FiltreBiens({ value, onChange, appartements, dense }) {
  const set = new Set(value);
  const basculer = (id) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    onChange([...n]);
  };
  const taille = dense ? 'min-h-8 px-3 text-xs' : 'min-h-11 px-4';
  const style = (on) => (on ? 'bg-sky-600 text-white' : 'bg-white text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-300');
  return (
    <div className={`-mx-4 flex overflow-x-auto px-4 pb-1 ${dense ? 'gap-1.5' : 'gap-2'}`}>
      <button type="button" onClick={() => onChange([])} className={`${taille} shrink-0 rounded-full font-medium ${style(set.size === 0)}`}>
        Tous les biens
      </button>
      {appartements.map((a) => (
        <button key={a.id} type="button" aria-pressed={set.has(a.id)} onClick={() => basculer(a.id)} className={`${taille} shrink-0 rounded-full font-medium ${style(set.has(a.id))}`}>
          {set.has(a.id) ? '✓ ' : ''}
          {a.nom}
        </button>
      ))}
      <button type="button" aria-pressed={set.has('')} onClick={() => basculer('')} className={`${taille} shrink-0 rounded-full ${dense ? '' : 'text-sm'} ${style(set.has(''))}`}>
        Sans bien
      </button>
    </div>
  );
}

/** Contexte de classement : bien et déplacement d'une tâche. */
export function contexteClassement(data, tousLiens, appById) {
  return {
    bien: (t) => appById.get(t.appartement_id) ?? null,
    voyage: (t) => {
      const i = planification(t.id, data, tousLiens);
      return i ? trouverVoyage(voyageDe(i, data), data) : null;
    },
  };
}

/** Titre de groupe (et sous-groupe) d'une liste classée. */
export function TitreGroupe({ groupe, sous = false, dense }) {
  return (
    <h2
      className={`${sous ? `mt-2 mb-1 text-xs font-semibold ${groupe.dernier ? 'text-slate-400' : 'text-sky-700 dark:text-sky-400'}` : `mb-1.5 text-sm font-bold uppercase tracking-wide ${groupe.alerte ? 'text-red-600' : 'text-slate-500'}`} ${dense ? '' : 'pt-1'}`}
    >
      {sous ? '› ' : ''}
      {groupe.titre} <span className="font-normal">({groupe.items.length})</span>
    </h2>
  );
}

/** Liste générale des tâches (indépendante des interventions). */
export function BacklogView() {
  const { data } = useData();
  const { dense, ajoutRapide } = useReglages();
  const [biens, setBiens] = useLocalState('filtre-biens', []);
  const [filtre, setFiltre] = useLocalState('filtre-statut', 'ouvertes');
  const [nonPlanifiees, setNonPlanifiees] = useLocalState('filtre-non-planifiees', false);
  const [classement, setClassement] = useLocalState('classement-taches', 'bien');
  const [q, setQ] = useState('');
  const [quick, setQuick] = useState('');
  const [editing, setEditing] = useState(null); // id | 'new'
  const [choosing, setChoosing] = useState(false);
  const editingTache = editing && editing !== 'new' ? data.taches.find((t) => t.id === editing) : null;

  const appById = useMemo(() => new Map(data.appartements.map((a) => [a.id, a])), [data.appartements]);
  const tousLiens = useMemo(() => liens(data), [data]);
  const toutes = tachesGenerales(data);
  const compte = (f) => toutes.filter((t) => garder(t, f)).length;

  const visibles = toutes
    .filter((t) => garder(t, filtre))
    .filter((t) => !biens.length || biens.includes(t.appartement_id || ''))
    .filter((t) => !nonPlanifiees || !planification(t.id, data, tousLiens))
    .filter((t) => !q.trim() || matchesSearch(`${t.titre} ${t.description ?? ''} ${appById.get(t.appartement_id)?.nom ?? ''} ${refTache(t)}`, q));

  const groupes = classerTaches(visibles, classement, contexteClassement(data, tousLiens, appById));

  const bienParDefaut = biens.length === 1 ? biens[0] || null : null;
  const quickAdd = async () => {
    if (!quick.trim()) return;
    await saveTache({ titre: quick, description: '', appartement_id: bienParDefaut, links: [] }, [], 0);
    setQuick('');
  };

  // En classement par bien ou par déplacement, les titres de groupes disent déjà où est la tâche.
  const ligne = (t) => <LigneTache key={t.id} tache={t} app={appById.get(t.appartement_id)} intervention={planification(t.id, data, tousLiens)} onOpen={() => setEditing(t.id)} dense={dense} groupee={classement !== 'echeance'} />;

  return (
    <div className={dense ? 'space-y-2' : 'space-y-4'}>
      <FiltreBiens value={biens} onChange={setBiens} appartements={data.appartements} dense={dense} />
      <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1">
        {FILTRES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFiltre(id)}
            className={`${dense ? 'min-h-8 px-3 text-xs' : 'min-h-10 px-4 text-sm'} shrink-0 rounded-full font-medium ${filtre === id ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-white text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300'}`}
          >
            {label} <span className="opacity-60">{compte(id)}</span>
          </button>
        ))}
        <button
          type="button"
          aria-pressed={nonPlanifiees}
          onClick={() => setNonPlanifiees(!nonPlanifiees)}
          className={`${dense ? 'min-h-8 px-3 text-xs' : 'min-h-10 px-4 text-sm'} shrink-0 rounded-full font-medium ${nonPlanifiees ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300'}`}
        >
          {nonPlanifiees ? '✓ ' : ''}Non planifiées
        </button>
      </div>

      <div className="flex gap-2">
        {toutes.length > 8 && <input type="search" className={`min-w-0 flex-1 ${dense ? '!min-h-10' : ''}`} placeholder="🔍 Filtrer les tâches" value={q} onChange={(e) => setQ(e.target.value)} />}
        <select className={`${toutes.length > 8 ? 'w-40 shrink-0' : 'w-full'} ${dense ? '!min-h-10 text-sm' : ''}`} value={classement} onChange={(e) => setClassement(e.target.value)} aria-label="Classer les tâches">
          {CLASSEMENTS_TACHES.map(([v, l]) => (
            <option key={v} value={v}>
              ↕ {l}
            </option>
          ))}
        </select>
      </div>

      {ajoutRapide && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            quickAdd();
          }}
        >
          <input className={`min-w-0 flex-1 ${dense ? '!min-h-10' : ''}`} placeholder={bienParDefaut ? `Ajout rapide (${appById.get(bienParDefaut)?.nom})…` : 'Ajout rapide d’une tâche…'} value={quick} onChange={(e) => setQuick(e.target.value)} aria-label="Ajout rapide d'une tâche" />
          <MicButton onResult={(t) => setQuick((v) => (v ? `${v} ${t}` : t.charAt(0).toUpperCase() + t.slice(1)))} />
          <Button type="submit" variant="primary" icon="plus" aria-label="Ajouter" className="!px-3" />
        </form>
      )}

      {groupes.length === 0 && <Empty>{toutes.length ? 'Aucune tâche avec ces filtres.' : 'Aucune tâche. Ajoute-en une avec le bouton +'}</Empty>}

      {groupes.map((g) => (
        <section key={g.id || 'aucun'}>
          <TitreGroupe groupe={g} dense={dense} />
          {g.sous && !(g.sous.length === 1 && g.sous[0].dernier) ? (
            g.sous.map((s) => (
              <div key={s.id || 'aucun'}>
                <TitreGroupe groupe={s} sous dense={dense} />
                <ul className={dense ? 'space-y-1' : 'space-y-2'}>{s.items.map(ligne)}</ul>
              </div>
            ))
          ) : (
            <ul className={dense ? 'space-y-1' : 'space-y-2'}>{g.items.map(ligne)}</ul>
          )}
        </section>
      ))}

      <BoutonAjout onClick={() => (data.modeles.length ? setChoosing(true) : setEditing('new'))} label="Nouvelle tâche" />

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

/** Bouton rond « + » au-dessus de la barre du bas. */
export function BoutonAjout({ onClick, label }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="fixed right-4 bottom-16 z-30 mb-[env(safe-area-inset-bottom)] flex size-14 items-center justify-center rounded-full bg-sky-600 text-white shadow-lg active:scale-95">
      <Icon name="plus" className="size-7" strokeWidth={2.5} />
    </button>
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

/** Ligne de tâche de la liste générale. Ligne 2 : « Déplacement › Intervention · échéance » (ou le bien si non planifiée). */
export function LigneTache({ tache, app, intervention, onOpen, extra, dense, groupee = false }) {
  const { data } = useData();
  const s = statutTache(tache);
  const fait = s === 'terminee';
  const retard = enRetard(tache);
  const etapes = progressionEtapes(tache.description);
  const nbCom = (data.commentaires || []).filter((c) => c.tache_id === tache.id).length;
  const nbArt = data.tache_articles.filter((l) => l.tache_id === tache.id).length;
  const ou = groupee
    ? intervention?.nom_perso?.trim() ? `🚐 ${intervention.nom_perso.trim()}` : null
    : intervention ? `🚐 ${libellePlanification(intervention, data)}` : app ? `🏠 ${app.nom}` : null;
  const compteurs = (
    <>
      {!fait && tache.created_at && <span title={`Créée le ${new Date(tache.created_at).toLocaleDateString('fr-FR')}`}>⏳ {ouverteDepuis(tache.created_at)}</span>}
      {etapes.total > 0 && <span>☑️ {etapes.faites}/{etapes.total}</span>}
      {nbArt > 0 && <span>🧰 {nbArt}</span>}
      {nbCom > 0 && <span>💬 {nbCom}</span>}
    </>
  );
  if (dense)
    return (
      <li className={`flex items-center gap-2 rounded-xl py-1 pr-2 pl-2.5 shadow-sm ${fait ? 'bg-slate-100 opacity-60 dark:bg-slate-900/50' : 'bg-white dark:bg-slate-900'}`}>
        <BigCheck compact etat={fait ? 'complet' : 'vide'} label={fait ? 'Remettre à traiter' : 'Marquer terminée'} onClick={() => setStatutTache(tache, fait ? 'a_traiter' : 'terminee')} />
        <button type="button" className="min-h-11 min-w-0 flex-1 text-left" onClick={onOpen}>
          <span className={`block truncate text-[15px] font-semibold ${fait ? 'line-through' : ''}`}>{tache.titre}</span>
          <span className="flex gap-2 text-xs text-slate-500">
            <span className={`min-w-0 truncate ${intervention ? 'text-sky-700 dark:text-sky-400' : ''}`}>
              {[
                ou ?? (groupee ? null : <span key="sb" className="text-slate-400">Sans bien</span>),
                tache.echeance && <span key="e" className={retard ? 'font-bold text-red-600' : ''}>📅 {dateCourte(tache.echeance)}</span>,
                s === 'reportee' && <span key="r" className="font-semibold text-amber-600">{STATUTS_TACHE.reportee}</span>,
                !ou && !tache.echeance && s !== 'reportee' && tache.ref ? <span key="ref" className="text-slate-400">{refTache(tache)}</span> : null,
              ]
                .filter(Boolean)
                .reduce((acc, el, k) => (k ? [...acc, ' · ', el] : [el]), [])}
            </span>
            <span className="ml-auto hidden shrink-0 gap-2 sm:flex">{compteurs}</span>
          </span>
          {extra}
        </button>
      </li>
    );
  return (
    <li className={`flex items-center gap-3 rounded-2xl p-2 shadow-sm ${fait ? 'bg-slate-100 opacity-60 dark:bg-slate-900/50' : 'bg-white dark:bg-slate-900'}`}>
      <BigCheck size="size-12" etat={fait ? 'complet' : 'vide'} label={fait ? 'Remettre à traiter' : 'Marquer terminée'} onClick={() => setStatutTache(tache, fait ? 'a_traiter' : 'terminee')} />
      <button type="button" className="min-h-12 min-w-0 flex-1 text-left" onClick={onOpen}>
        <span className={`block font-semibold break-words ${fait ? 'line-through' : ''}`}>
          {tache.titre} {tache.ref ? <span className="text-xs font-normal text-slate-400">{refTache(tache)}</span> : null}
        </span>
        <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
          {ou && <span className={intervention ? 'text-sky-700 dark:text-sky-400' : ''}>{ou}</span>}
          {tache.echeance && <span className={retard ? 'font-bold text-red-600' : ''}>📅 {dateCourte(tache.echeance)}</span>}
          {s === 'reportee' && <span className="font-semibold text-amber-600">{STATUTS_TACHE.reportee}</span>}
          {compteurs}
        </span>
        {extra}
      </button>
      <Icon name="chevron" className="size-5 shrink-0 text-slate-400" />
    </li>
  );
}
