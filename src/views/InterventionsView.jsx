import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { DataContext, useData, useLocalState, useTrip } from '../data.js';
import { STATUTS } from '../../shared/schema.js';
import { STATUTS_TACHE, STATUT_ORDER, propositionCloture, recap, statutTache, tachesIntervention, liens } from '../../shared/interventions.js';
import { Button, Empty, Icon, Sheet, TextField } from '../components/ui.jsx';
import { CommentaireItem, ListeCommentaires, NouveauCommentaire, Photo, dateHeure } from '../components/Commentaires.jsx';
import { TachesView } from './TachesView.jsx';
import { ArticlesView } from './ArticlesView.jsx';
import { ChecklistView, PrintableList } from './ChecklistView.jsx';
import { ChoixTaches } from './ChoixTaches.jsx';
import * as A from '../actions.js';

const SOUS_ONGLETS = [
  ['taches', 'Tâches'],
  ['materiel', 'Matériel'],
  ['outillage', 'Outillage'],
  ['consommable', 'Conso.'],
  ['charger', 'Charger'],
  ['recap', 'Récap'],
];

const dateLongue = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Date à fixer');

const COULEUR_STATUT = {
  en_preparation: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300',
  en_cours: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  termine: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};
export const BadgeStatut = ({ statut }) => <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${COULEUR_STATUT[statut] ?? ''}`}>{STATUTS[statut] ?? statut}</span>;

/** Onglet Interventions : la liste, ou l'intervention ouverte. */
export function InterventionsView({ ouverteId, setOuverteId }) {
  const { data } = useData();
  const dep = data.deplacements.find((d) => d.id === ouverteId);
  if (dep) return <InterventionDetail dep={dep} onBack={() => setOuverteId(null)} />;
  return <ListeInterventions onOpen={setOuverteId} />;
}

function ListeInterventions({ onOpen }) {
  const { data } = useData();
  const [creation, setCreation] = useState(false);
  const [voirCloses, setVoirCloses] = useState(false);
  const tousLiens = useMemo(() => liens(data), [data]);
  const parDate = (a, b) => (a.date_debut || '9999').localeCompare(b.date_debut || '9999');
  const ouvertes = data.deplacements.filter((d) => d.statut !== 'termine').sort(parDate);
  const closes = data.deplacements.filter((d) => d.statut === 'termine').sort((a, b) => -parDate(a, b));

  const carte = (d) => {
    const taches = tachesIntervention(d.id, data, tousLiens);
    const faites = taches.filter((t) => statutTache(t) === 'terminee').length;
    const biens = [...new Set(taches.map((t) => data.appartements.find((a) => a.id === t.appartement_id)?.nom).filter(Boolean))];
    return (
      <li key={d.id}>
        <button type="button" onClick={() => onOpen(d.id)} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm active:bg-slate-100 dark:bg-slate-900 dark:active:bg-slate-800">
          <span className="min-w-0 flex-1">
            <span className="flex items-start justify-between gap-2">
              <span className="text-lg font-semibold break-words">{d.nom}</span>
              <BadgeStatut statut={d.statut} />
            </span>
            <span className="block text-sm text-slate-500 first-letter:uppercase">{dateLongue(d.date_debut)}</span>
            <span className="block text-sm text-slate-500">
              {taches.length} tâche{taches.length > 1 ? 's' : ''}
              {taches.length > 0 && ` · ${faites} terminée${faites > 1 ? 's' : ''}`}
              {biens.length > 0 && ` · 🏠 ${biens.join(', ')}`}
            </span>
          </span>
          <Icon name="chevron" className="size-5 shrink-0 text-slate-400" />
        </button>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <Button variant="primary" icon="plus" className="w-full !min-h-14 text-lg" onClick={() => setCreation(true)}>
        Nouvelle intervention
      </Button>
      {ouvertes.length === 0 && <Empty>Aucune intervention en cours. Crée-en une et choisis ses tâches.</Empty>}
      <ul className="space-y-2">{ouvertes.map(carte)}</ul>
      {closes.length > 0 && (
        <section className="space-y-2">
          <Button variant="ghost" className="w-full" onClick={() => setVoirCloses(!voirCloses)}>
            {voirCloses ? 'Masquer' : 'Voir'} les interventions terminées ({closes.length})
          </Button>
          {voirCloses && <ul className="space-y-2">{closes.map(carte)}</ul>}
        </section>
      )}
      {creation && <NouvelleIntervention onClose={() => setCreation(false)} onCreated={(id) => { setCreation(false); onOpen(id); }} />}
    </div>
  );
}

function NouvelleIntervention({ onClose, onCreated }) {
  const { data } = useData();
  const [nom, setNom] = useState('');
  const [date, setDate] = useState('');
  return (
    <ChoixTaches
      intervention={null}
      titre="Nouvelle intervention"
      bouton="Créer l'intervention"
      onClose={onClose}
      enTete={
        <div className="space-y-2 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
          <TextField value={nom} onChange={setNom} placeholder="Nom (ex. : Pau, novembre)" aria-label="Nom de l'intervention" />
          <label className="flex items-center gap-2">
            <span className="shrink-0 text-sm font-medium text-slate-600 dark:text-slate-400">Date d'intervention</span>
            <input type="date" className="min-w-0 flex-1" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
      }
      onValider={async (ids) => {
        const libelle = nom.trim() || (date ? `Intervention du ${new Date(`${date}T00:00`).toLocaleDateString('fr-FR')}` : 'Nouvelle intervention');
        const id = await A.createIntervention(libelle, date);
        if (ids.length) await A.addTachesToIntervention(id, ids, { ...data, deplacements: [...data.deplacements, { id, statut: 'en_preparation' }] });
        onCreated(id);
      }}
    />
  );
}

/** Une intervention : en-tête, sous-onglets, impression de la liste ou du rapport. */
function InterventionDetail({ dep, onBack }) {
  const parent = useData();
  const { data } = parent;
  const [onglet, setOnglet] = useLocalState('onglet-intervention', 'taches');
  const [reglages, setReglages] = useState(false);
  const [impression, setImpression] = useState('liste');
  const trip = useTrip(data, dep.id);
  const ctx = useMemo(() => ({ ...parent, dep, depId: dep.id, trip }), [parent, dep, trip]);

  useEffect(() => {
    const retour = () => setImpression('liste');
    window.addEventListener('afterprint', retour);
    return () => window.removeEventListener('afterprint', retour);
  }, []);
  const imprimerRapport = () => {
    setImpression('rapport');
    setTimeout(() => window.print(), 100);
  };

  const reste = (type) => {
    const p = trip.progress[type];
    return p.total - p.done;
  };
  const badge = { materiel: reste('materiel'), outillage: reste('outillage'), consommable: reste('consommable') };

  return (
    <DataContext.Provider value={ctx}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" icon="back" className="!px-2" aria-label="Retour aux interventions" onClick={onBack} />
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setReglages(true)}>
            <span className="block truncate text-xl font-bold">{dep.nom}</span>
            <span className="block text-sm text-slate-500 first-letter:uppercase">{dateLongue(dep.date_debut)}</span>
          </button>
          <BadgeStatut statut={dep.statut} />
          <Button variant="ghost" icon="edit" className="!px-2" aria-label="Modifier l'intervention" onClick={() => setReglages(true)} />
        </div>

        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1">
          {SOUS_ONGLETS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setOnglet(id)}
              aria-current={onglet === id ? 'page' : undefined}
              className={`relative min-h-11 shrink-0 rounded-full px-4 font-medium ${onglet === id ? 'bg-sky-600 text-white' : 'bg-white text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-300'}`}
            >
              {label}
              {badge[id] > 0 && <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">{badge[id]}</span>}
            </button>
          ))}
        </div>

        {dep.statut === 'termine' && onglet !== 'recap' && <p className="rounded-xl bg-slate-200 p-2 text-center text-sm dark:bg-slate-800">Cette intervention est terminée.</p>}
        {onglet === 'taches' && <TachesView />}
        {onglet === 'materiel' && <ArticlesView type="materiel" key="m" />}
        {onglet === 'outillage' && <ArticlesView type="outillage" key="o" />}
        {onglet === 'consommable' && <ArticlesView type="consommable" key="c" />}
        {onglet === 'charger' && <ChecklistView />}
        {onglet === 'recap' && <RecapView onImprimer={imprimerRapport} />}
      </div>
      {reglages && <ReglagesIntervention dep={dep} onClose={() => setReglages(false)} onDeleted={onBack} />}
      {createPortal(impression === 'rapport' ? <RapportImprimable /> : <PrintableList />, document.body)}
    </DataContext.Provider>
  );
}

function ReglagesIntervention({ dep, onClose, onDeleted }) {
  const { data } = useData();
  const [nom, setNom] = useState(dep.nom);
  const [date, setDate] = useState(dep.date_debut ?? '');
  const save = async () => {
    await A.updateIntervention(dep.id, { nom: nom.trim() || dep.nom, date_debut: date || null });
    onClose();
  };
  const del = async () => {
    const n = tachesIntervention(dep.id, data).length;
    if (!confirm(`Supprimer l'intervention « ${dep.nom} » ? Ses ${n} tâche(s) restent dans la liste des tâches.`)) return;
    await A.deleteIntervention(dep, data);
    onDeleted();
  };
  return (
    <Sheet
      title="Modifier l'intervention"
      onClose={onClose}
      footer={
        <Button variant="primary" icon="check" className="w-full text-lg" onClick={save}>
          Enregistrer
        </Button>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400">Nom</span>
          <TextField value={nom} onChange={setNom} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400">Date d'intervention</span>
          <input type="date" className="w-full" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          {dep.statut === 'en_preparation' && <Button onClick={() => A.setStatut(dep, 'en_cours')}>▶️ Démarrer</Button>}
          {dep.statut === 'en_cours' && <Button onClick={() => A.setStatut(dep, 'en_preparation')}>En préparation</Button>}
          {dep.statut === 'termine' && <Button onClick={() => A.setStatut(dep, 'en_cours')}>Rouvrir</Button>}
        </div>
        <Button variant="ghost" icon="trash" className="w-full !text-red-600" onClick={del}>
          Supprimer l'intervention
        </Button>
      </div>
    </Sheet>
  );
}

/** Récap : compte rendu (avec photos), commentaires de toutes les tâches, clôture. */
function RecapView({ onImprimer }) {
  const { data, dep, depId } = useData();
  const r = recap(depId, data);
  const [cloture, setCloture] = useState(false);
  const app = (t) => data.appartements.find((a) => a.id === t.appartement_id)?.nom;
  const ouverte = dep.statut !== 'termine';
  const lien = (t) => (data.intervention_taches || []).find((l) => l.intervention_id === depId && l.tache_id === t.id);

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="text-lg font-bold">📝 Compte rendu</h2>
        <NouveauCommentaire interventionId={depId} placeholder="Ce qui a été fait, problèmes, à prévoir…" />
        <ListeCommentaires commentaires={[...r.compteRendu].reverse()} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">💬 Commentaires des tâches</h2>
        {r.parTache.every((g) => !g.commentaires.length) && <p className="text-sm text-slate-500">Aucun commentaire sur les tâches de cette intervention.</p>}
        {r.parTache
          .filter((g) => g.commentaires.length)
          .map((g) => (
            <div key={g.tache.id} className="space-y-2">
              <h3 className="font-semibold">
                {g.tache.titre}
                {app(g.tache) && <span className="font-normal text-slate-500"> · {app(g.tache)}</span>}
                <span className="ml-2 text-xs font-normal text-slate-500">{STATUTS_TACHE[lien(g.tache)?.resultat || statutTache(g.tache)]}</span>
              </h3>
              <ul className="space-y-2">
                {g.commentaires.map((c) => (
                  <CommentaireItem key={c.id} c={c} />
                ))}
              </ul>
            </div>
          ))}
      </section>

      <div className="grid grid-cols-1 gap-2">
        <Button icon="print" onClick={onImprimer}>
          Rapport d'intervention (PDF / imprimer)
        </Button>
        {ouverte ? (
          <Button variant="success" icon="check" className="!min-h-14 text-lg" onClick={() => setCloture(true)}>
            Clôturer l'intervention
          </Button>
        ) : (
          <p className="rounded-xl bg-emerald-50 p-3 text-center text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">Intervention terminée ✓</p>
        )}
      </div>
      {cloture && <Cloture onClose={() => setCloture(false)} />}
    </div>
  );
}

/** Clôture : liste à confirmer, « Reportée » par défaut pour ce qui n'est pas terminé. */
function Cloture({ onClose }) {
  const { data, depId, dep } = useData();
  const [choix, setChoix] = useState(() => propositionCloture(depId, data).map((p) => ({ tache: p.tache, statut: p.statut })));
  const valider = async () => {
    await A.closeIntervention(depId, choix.map((c) => ({ tache_id: c.tache.id, statut: c.statut })), data);
    onClose();
  };
  const nb = (s) => choix.filter((c) => c.statut === s).length;
  return (
    <Sheet
      title={`Clôturer « ${dep.nom} »`}
      onClose={onClose}
      footer={
        <Button variant="success" icon="check" className="w-full text-lg" onClick={valider}>
          Valider la clôture
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Vérifie le résultat de chaque tâche. Les tâches reportées restent dans la liste et pourront entrer dans une prochaine intervention.
        </p>
        <p className="text-sm font-semibold">
          {nb('terminee')} terminée(s) · {nb('reportee')} reportée(s) · {nb('a_traiter')} à traiter
        </p>
        {choix.length === 0 && <Empty>Aucune tâche dans cette intervention.</Empty>}
        <ul className="space-y-2">
          {choix.map((c, i) => (
            <li key={c.tache.id} className="space-y-2 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
              <p className="font-semibold break-words">{c.tache.titre}</p>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-800">
                {STATUT_ORDER.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={c.statut === s}
                    onClick={() => setChoix((l) => l.map((x, j) => (j === i ? { ...x, statut: s } : x)))}
                    className={`min-h-11 rounded-lg text-sm font-semibold ${c.statut === s ? (s === 'terminee' ? 'bg-emerald-600 text-white' : s === 'reportee' ? 'bg-amber-500 text-white' : 'bg-sky-600 text-white') : 'text-slate-600 dark:text-slate-300'}`}
                  >
                    {STATUTS_TACHE[s]}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

/** Rapport d'intervention imprimable (PDF via « Imprimer »). */
function RapportImprimable() {
  const { data, dep, depId } = useData();
  const r = recap(depId, data);
  const app = (t) => data.appartements.find((a) => a.id === t.appartement_id)?.nom;
  const resultat = (t) => (data.intervention_taches || []).find((l) => l.intervention_id === depId && l.tache_id === t.id)?.resultat || statutTache(t);
  const bloc = (c) => (
    <div key={c.id} className="mb-2 break-inside-avoid">
      <p className="text-xs text-gray-600">{dateHeure(c.created_at)}{c.auteur ? ` · ${c.auteur}` : ''}</p>
      {c.texte && <p className="whitespace-pre-wrap">{c.texte}</p>}
      {c.photos.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2">
          {c.photos.map((p) => (
            <Photo key={p.id} photo={p} className="h-40 w-52" />
          ))}
        </div>
      )}
    </div>
  );
  return (
    <div className="hidden p-4 text-black print:block">
      <h1 className="text-2xl font-bold">Rapport d'intervention – {dep.nom}</h1>
      <p className="mb-4 text-sm first-letter:uppercase">
        {dateLongue(dep.date_debut)} · {STATUTS[dep.statut]} · imprimé le {new Date().toLocaleDateString('fr-FR')}
      </p>
      <h2 className="mb-1 border-b border-black text-lg font-bold">Tâches</h2>
      <ul className="mb-4">
        {r.parTache.map(({ tache }) => (
          <li key={tache.id} className="py-0.5">
            {resultat(tache) === 'terminee' ? '☑' : '☐'} {tache.titre}
            {app(tache) ? ` (${app(tache)})` : ''} – <b>{STATUTS_TACHE[resultat(tache)]}</b>
          </li>
        ))}
      </ul>
      {r.compteRendu.length > 0 && (
        <>
          <h2 className="mb-1 border-b border-black text-lg font-bold">Compte rendu</h2>
          <div className="mb-4">{r.compteRendu.map(bloc)}</div>
        </>
      )}
      {r.parTache.some((g) => g.commentaires.length) && (
        <>
          <h2 className="mb-1 border-b border-black text-lg font-bold">Commentaires par tâche</h2>
          {r.parTache
            .filter((g) => g.commentaires.length)
            .map((g) => (
              <section key={g.tache.id} className="mb-3">
                <h3 className="font-bold">{g.tache.titre}</h3>
                {g.commentaires.map(bloc)}
              </section>
            ))}
        </>
      )}
    </div>
  );
}
