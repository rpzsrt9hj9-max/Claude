import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { DataContext, useData, useLocalState } from '../data.js';
import { STATUTS, cleSortie } from '../../shared/schema.js';
import { computeTrip } from '../../shared/calc.js';
import {
  STATUTS_TACHE, STATUT_ORDER, dansRapport, propositionCloture, recap, statutTache, tachesIntervention, liens,
} from '../../shared/interventions.js';
import {
  listeVoyages, interventionsDuVoyage, tachesVoyage, statutVoyage, nomIntervention, bienIntervention, voyageDe,
} from '../../shared/voyages.js';
import { Button, Empty, Icon, Sheet, TextField } from '../components/ui.jsx';
import { CommentaireItem, ListeCommentaires, NouveauCommentaire, Photo, dateHeure } from '../components/Commentaires.jsx';
import { TachesView } from './TachesView.jsx';
import { ArticlesView } from './ArticlesView.jsx';
import { ChecklistView, PrintableList } from './ChecklistView.jsx';
import { ChoixTaches } from './ChoixTaches.jsx';
import * as A from '../actions.js';

export const dateLongue = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Date à fixer');

const COULEUR_STATUT = {
  en_preparation: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300',
  en_cours: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  termine: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};
const LIBELLE_VOYAGE = { en_preparation: 'En préparation', en_cours: 'En cours', termine: 'Terminé' };
export const BadgeStatut = ({ statut, voyage }) => (
  <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${COULEUR_STATUT[statut] ?? ''}`}>{(voyage ? LIBELLE_VOYAGE : STATUTS)[statut] ?? statut}</span>
);

function Onglets({ onglets, valeur, onChange, badges = {} }) {
  return (
    <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1">
      {onglets.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-current={valeur === id ? 'page' : undefined}
          className={`min-h-11 shrink-0 rounded-full px-4 font-medium ${valeur === id ? 'bg-sky-600 text-white' : 'bg-white text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-300'}`}
        >
          {label}
          {badges[id] > 0 && <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">{badges[id]}</span>}
        </button>
      ))}
    </div>
  );
}

/** Onglet Déplacements : la liste, un déplacement, ou une de ses interventions. */
export function DeplacementsView({ voyageId, setVoyageId, interventionId, setInterventionId }) {
  const { data } = useData();
  const voyage = listeVoyages(data).find((v) => v.id === voyageId);
  if (!voyage) return <ListeVoyages onOpen={(id) => { setInterventionId(null); setVoyageId(id); }} />;
  const intervention = interventionsDuVoyage(voyage.id, data).find((i) => i.id === interventionId);
  if (intervention) return <InterventionDetail voyage={voyage} dep={intervention} onBack={() => setInterventionId(null)} />;
  return <VoyageDetail voyage={voyage} onBack={() => setVoyageId(null)} onOpen={setInterventionId} />;
}

/** Onglet Interventions : toutes les interventions (un bien chacune), tous déplacements confondus. */
export function InterventionsView({ interventionId, setInterventionId }) {
  const { data } = useData();
  const [voirClos, setVoirClos] = useState(false);
  const voyages = listeVoyages(data);
  const voyageDeI = (i) => voyages.find((v) => v.id === voyageDe(i, data));
  const ouverte = data.deplacements.find((d) => d.id === interventionId);
  if (ouverte && voyageDeI(ouverte)) return <InterventionDetail voyage={voyageDeI(ouverte)} dep={ouverte} onBack={() => setInterventionId(null)} />;

  const parDate = (a, b) => (a.date_debut || '9999').localeCompare(b.date_debut || '9999') || nomIntervention(a, data).localeCompare(nomIntervention(b, data), 'fr');
  const ouvertes = data.deplacements.filter((d) => d.statut !== 'termine').sort(parDate);
  const closes = data.deplacements.filter((d) => d.statut === 'termine').sort((a, b) => -parDate(a, b));
  const carte = (i) => {
    const ts = tachesIntervention(i.id, data);
    const faites = ts.filter((t) => statutTache(t) === 'terminee').length;
    return (
      <li key={i.id}>
        <button type="button" onClick={() => setInterventionId(i.id)} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm active:bg-slate-100 dark:bg-slate-900 dark:active:bg-slate-800">
          <Icon name="home" className="size-7 shrink-0 text-sky-600" />
          <span className="min-w-0 flex-1">
            <span className="flex items-start justify-between gap-2">
              <span className="text-lg font-semibold break-words">{nomIntervention(i, data)}</span>
              <BadgeStatut statut={i.statut} />
            </span>
            <span className="block text-sm text-slate-500 first-letter:uppercase">{dateLongue(i.date_debut)}</span>
            <span className="block text-sm text-slate-500">
              🚐 {voyageDeI(i)?.nom ?? '—'} · {ts.length} tâche{ts.length > 1 ? 's' : ''} · {faites} terminée{faites > 1 ? 's' : ''}
            </span>
          </span>
          <Icon name="chevron" className="size-5 shrink-0 text-slate-400" />
        </button>
      </li>
    );
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Une intervention = un bien. Pour en créer, crée un déplacement (onglet Déplacements) et choisis ses tâches.</p>
      {ouvertes.length === 0 && <Empty>Aucune intervention en cours.</Empty>}
      <ul className="space-y-2">{ouvertes.map(carte)}</ul>
      {closes.length > 0 && (
        <section className="space-y-2">
          <Button variant="ghost" className="w-full" onClick={() => setVoirClos(!voirClos)}>
            {voirClos ? 'Masquer' : 'Voir'} les interventions terminées ({closes.length})
          </Button>
          {voirClos && <ul className="space-y-2">{closes.map(carte)}</ul>}
        </section>
      )}
    </div>
  );
}

function ListeVoyages({ onOpen }) {
  const { data } = useData();
  const [creation, setCreation] = useState(false);
  const [voirClos, setVoirClos] = useState(false);
  const tousLiens = useMemo(() => liens(data), [data]);
  const voyages = listeVoyages(data).map((v) => ({ ...v, statut: statutVoyage(v.id, data) }));
  const parDate = (a, b) => (a.date_debut || '9999').localeCompare(b.date_debut || '9999');
  const ouverts = voyages.filter((v) => v.statut !== 'termine').sort(parDate);
  const clos = voyages.filter((v) => v.statut === 'termine').sort((a, b) => -parDate(a, b));

  const carte = (v) => {
    const its = interventionsDuVoyage(v.id, data);
    return (
      <li key={v.id}>
        <button type="button" onClick={() => onOpen(v.id)} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm active:bg-slate-100 dark:bg-slate-900 dark:active:bg-slate-800">
          <span className="min-w-0 flex-1">
            <span className="flex items-start justify-between gap-2">
              <span className="text-lg font-semibold break-words">{v.nom}</span>
              <BadgeStatut statut={v.statut} voyage />
            </span>
            <span className="block text-sm text-slate-500 first-letter:uppercase">{dateLongue(v.date_debut)}</span>
            <span className="mt-1 flex flex-wrap gap-1">
              {its.map((i) => {
                const ts = tachesIntervention(i.id, data, tousLiens);
                return (
                  <span key={i.id} className={`rounded-full px-2 py-0.5 text-xs ${i.statut === 'termine' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                    🏠 {nomIntervention(i, data)} · {ts.length}
                    {i.statut === 'termine' ? ' ✓' : ''}
                  </span>
                );
              })}
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
        Nouveau déplacement
      </Button>
      {ouverts.length === 0 && <Empty>Aucun déplacement prévu. Crée-en un et choisis ses tâches : une intervention est créée pour chaque bien.</Empty>}
      <ul className="space-y-2">{ouverts.map(carte)}</ul>
      {clos.length > 0 && (
        <section className="space-y-2">
          <Button variant="ghost" className="w-full" onClick={() => setVoirClos(!voirClos)}>
            {voirClos ? 'Masquer' : 'Voir'} les déplacements terminés ({clos.length})
          </Button>
          {voirClos && <ul className="space-y-2">{clos.map(carte)}</ul>}
        </section>
      )}
      {creation && <NouveauVoyage onClose={() => setCreation(false)} onCreated={(id) => { setCreation(false); onOpen(id); }} />}
    </div>
  );
}

function NouveauVoyage({ onClose, onCreated }) {
  const { data } = useData();
  const [nom, setNom] = useState('');
  const [date, setDate] = useState('');
  return (
    <ChoixTaches
      intervention={null}
      titre="Nouveau déplacement"
      bouton="Créer le déplacement"
      onClose={onClose}
      enTete={
        <div className="space-y-2 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
          <TextField value={nom} onChange={setNom} placeholder="Nom (ex. : Pau, novembre)" aria-label="Nom du déplacement" />
          <label className="flex items-center gap-2">
            <span className="shrink-0 text-sm font-medium text-slate-600 dark:text-slate-400">Date</span>
            <input type="date" className="min-w-0 flex-1" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <p className="text-xs text-slate-500">Une intervention (avec son rapport) est créée pour chaque bien des tâches choisies.</p>
        </div>
      }
      onValider={async (ids) => {
        const libelle = nom.trim() || (date ? `Déplacement du ${new Date(`${date}T00:00`).toLocaleDateString('fr-FR')}` : 'Nouveau déplacement');
        const id = await A.createVoyage({ nom: libelle, date_debut: date }, ids, data);
        onCreated(id);
      }}
    />
  );
}

/** Un déplacement : ses interventions (une par bien) et la grande liste de chargement. */
function VoyageDetail({ voyage, onBack, onOpen }) {
  const parent = useData();
  const { data } = parent;
  const [onglet, setOnglet] = useLocalState('onglet-voyage', 'interventions');
  const [reglages, setReglages] = useState(false);
  const [ajout, setAjout] = useState(false);
  const statut = statutVoyage(voyage.id, data);
  const its = interventionsDuVoyage(voyage.id, data);
  const trip = useMemo(() => computeTrip(voyage.id, data, tachesVoyage(voyage.id, data)), [voyage.id, data]);
  const dep = useMemo(() => ({ ...voyage, statut }), [voyage, statut]);
  const ctx = useMemo(() => ({ ...parent, dep, depId: voyage.id, trip }), [parent, dep, voyage.id, trip]);
  const reste = (type) => trip.progress[type].total - trip.progress[type].done;
  const badges = { materiel: reste('materiel'), outillage: reste('outillage'), consommable: reste('consommable'), charger: trip.items.filter((i) => !i.status.complet).length };

  return (
    <DataContext.Provider value={ctx}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" icon="back" className="!px-2" aria-label="Retour aux déplacements" onClick={onBack} />
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setReglages(true)}>
            <span className="block truncate text-xl font-bold">{voyage.nom}</span>
            <span className="block text-sm text-slate-500 first-letter:uppercase">{dateLongue(voyage.date_debut)}</span>
          </button>
          <BadgeStatut statut={statut} voyage />
          <Button variant="ghost" icon="edit" className="!px-2" aria-label="Modifier le déplacement" onClick={() => setReglages(true)} />
        </div>

        <Onglets
          onglets={[['interventions', 'Interventions'], ['materiel', 'Matériel'], ['outillage', 'Outillage'], ['consommable', 'Conso.'], ['charger', 'Charger']]}
          valeur={onglet}
          onChange={setOnglet}
          badges={badges}
        />

        {onglet === 'interventions' && (
          <div className="space-y-3">
            {statut !== 'termine' && (
              <Button variant="primary" icon="plus" className="w-full !min-h-14 text-lg" onClick={() => setAjout(true)}>
                Ajouter des tâches
              </Button>
            )}
            {its.length === 0 && <Empty>Aucune intervention : ajoute des tâches, une intervention sera créée pour chaque bien.</Empty>}
            <ul className="space-y-2">
              {its.map((i) => {
                const ts = tachesIntervention(i.id, data);
                const faites = ts.filter((t) => statutTache(t) === 'terminee').length;
                const sortie = computeTrip(cleSortie(i.id), data, ts);
                const sortis = sortie.items.filter((x) => x.status.complet).length;
                return (
                  <li key={i.id}>
                    <button type="button" onClick={() => onOpen(i.id)} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm active:bg-slate-100 dark:bg-slate-900 dark:active:bg-slate-800">
                      <Icon name="home" className="size-7 shrink-0 text-sky-600" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-lg font-semibold break-words">{nomIntervention(i, data)}</span>
                          <BadgeStatut statut={i.statut} />
                        </span>
                        <span className="block text-sm text-slate-500">
                          {ts.length} tâche{ts.length > 1 ? 's' : ''} · {faites} terminée{faites > 1 ? 's' : ''}
                          {sortie.items.length > 0 && ` · ${sortis}/${sortie.items.length} sortis`}
                        </span>
                      </span>
                      <Icon name="chevron" className="size-5 shrink-0 text-slate-400" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {onglet === 'materiel' && <ArticlesView type="materiel" key="m" />}
        {onglet === 'outillage' && <ArticlesView type="outillage" key="o" />}
        {onglet === 'consommable' && <ArticlesView type="consommable" key="c" />}
        {onglet === 'charger' && <ChecklistView />}
      </div>
      {ajout && (
        <ChoixTaches
          intervention={its.map((i) => i.id)}
          onClose={() => setAjout(false)}
          onValider={async (ids) => {
            await A.addTachesToVoyage(voyage, ids, data);
            setAjout(false);
          }}
        />
      )}
      {reglages && <ReglagesVoyage voyage={voyage} statut={statut} onClose={() => setReglages(false)} onDeleted={onBack} />}
      {createPortal(<PrintableList />, document.body)}
    </DataContext.Provider>
  );
}

function ReglagesVoyage({ voyage, statut, onClose, onDeleted }) {
  const { data } = useData();
  const [nom, setNom] = useState(voyage.nom);
  const [date, setDate] = useState(voyage.date_debut ?? '');
  const save = async () => {
    await A.updateVoyage(voyage, { nom: nom.trim() || voyage.nom, date_debut: date }, data);
    onClose();
  };
  const del = async () => {
    const n = tachesVoyage(voyage.id, data).length;
    if (!confirm(`Supprimer le déplacement « ${voyage.nom} » et ses interventions ? Ses ${n} tâche(s) restent dans la liste des tâches.`)) return;
    await A.deleteVoyage(voyage, data);
    onDeleted();
  };
  return (
    <Sheet title="Modifier le déplacement" onClose={onClose} footer={<Button variant="primary" icon="check" className="w-full text-lg" onClick={save}>Enregistrer</Button>}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400">Nom</span>
          <TextField value={nom} onChange={setNom} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400">Date (reportée sur les interventions)</span>
          <input type="date" className="w-full" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {statut === 'en_preparation' && (
          <Button className="w-full" onClick={async () => { await A.setStatutVoyage(voyage, 'en_cours', data); onClose(); }}>
            ▶️ Démarrer le déplacement
          </Button>
        )}
        <Button variant="ghost" icon="trash" className="w-full !text-red-600" onClick={del}>
          Supprimer le déplacement
        </Button>
      </div>
    </Sheet>
  );
}

/** Une intervention (un bien) : tâches, éléments à sortir de la voiture, récap et rapport. */
export function InterventionDetail({ voyage, dep, onBack }) {
  const parent = useData();
  const { data } = parent;
  const [onglet, setOnglet] = useLocalState('onglet-intervention', 'taches');
  const [reglages, setReglages] = useState(false);
  const [impression, setImpression] = useState(false);
  const taches = useMemo(() => tachesIntervention(dep.id, data), [dep.id, data]);
  // « Prête » = tout ce qu'il faut est chargé dans la voiture (cases « Pris » du déplacement).
  const trip = useMemo(() => computeTrip(voyage.id, data, taches), [voyage.id, data, taches]);
  const sortie = useMemo(() => computeTrip(cleSortie(dep.id), data, taches), [dep.id, data, taches]);
  const ctx = useMemo(() => ({ ...parent, dep, depId: voyage.id, interventionId: dep.id, voyage, trip }), [parent, dep, voyage, trip]);
  const ongletActif = ['taches', 'sortir', 'recap'].includes(onglet) ? onglet : 'taches';

  useEffect(() => {
    const fin = () => setImpression(false);
    window.addEventListener('afterprint', fin);
    return () => window.removeEventListener('afterprint', fin);
  }, []);
  const imprimerRapport = () => {
    setImpression(true);
    setTimeout(() => window.print(), 100);
  };

  return (
    <DataContext.Provider value={ctx}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" icon="back" className="!px-2" aria-label={`Retour à ${voyage.nom}`} onClick={onBack} />
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setReglages(true)}>
            <span className="block truncate text-xs text-slate-500">{voyage.nom}</span>
            <span className="block truncate text-xl font-bold">🏠 {nomIntervention(dep, data)}</span>
            <span className="block text-sm text-slate-500 first-letter:uppercase">{dateLongue(dep.date_debut)}</span>
          </button>
          <BadgeStatut statut={dep.statut} />
        </div>
        <Onglets
          onglets={[['taches', 'Tâches'], ['sortir', 'À sortir'], ['recap', 'Récap']]}
          valeur={ongletActif}
          onChange={setOnglet}
          badges={{ sortir: sortie.items.filter((i) => !i.status.complet).length }}
        />
        {dep.statut === 'termine' && ongletActif !== 'recap' && <p className="rounded-xl bg-slate-200 p-2 text-center text-sm dark:bg-slate-800">Cette intervention est terminée.</p>}
        {ongletActif === 'taches' && <TachesView />}
        {ongletActif === 'sortir' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">Ce qu'il faut sortir de la voiture pour les tâches de ce bien.</p>
            <ChecklistView cle={cleSortie(dep.id)} trip={sortie} sortie />
          </div>
        )}
        {ongletActif === 'recap' && <RecapView onImprimer={imprimerRapport} />}
      </div>
      {reglages && <ReglagesIntervention dep={dep} onClose={() => setReglages(false)} onDeleted={onBack} />}
      {impression && createPortal(<RapportImprimable />, document.body)}
    </DataContext.Provider>
  );
}

function ReglagesIntervention({ dep, onClose, onDeleted }) {
  const { data } = useData();
  const [date, setDate] = useState(dep.date_debut ?? '');
  const save = async () => {
    await A.updateIntervention(dep.id, { date_debut: date || null });
    onClose();
  };
  const del = async () => {
    const n = tachesIntervention(dep.id, data).length;
    if (!confirm(`Supprimer cette intervention ? Ses ${n} tâche(s) restent dans la liste des tâches.`)) return;
    await A.deleteIntervention(dep, data);
    onDeleted();
  };
  return (
    <Sheet title="Modifier l'intervention" onClose={onClose} footer={<Button variant="primary" icon="check" className="w-full text-lg" onClick={save}>Enregistrer</Button>}>
      <div className="space-y-4">
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

/** Récap : compte rendu (avec photos), commentaires des tâches, choix de ce qui va dans le rapport, clôture. */
function RecapView({ onImprimer }) {
  const { data, dep } = useData();
  const r = recap(dep.id, data);
  const [cloture, setCloture] = useState(false);
  const ouverte = dep.statut !== 'termine';
  const lien = (t) => (data.intervention_taches || []).find((l) => l.intervention_id === dep.id && l.tache_id === t.id);

  return (
    <div className="space-y-5">
      <p className="rounded-xl bg-slate-100 p-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        La case <b>📄 Rapport</b> de chaque commentaire et photo choisit ce qui apparaît dans le rapport.
      </p>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">📝 Compte rendu</h2>
        <NouveauCommentaire interventionId={dep.id} placeholder="Ce qui a été fait, problèmes, à prévoir…" />
        <ListeCommentaires commentaires={[...r.compteRendu].reverse()} choixRapport />
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
                <span className="ml-2 text-xs font-normal text-slate-500">{STATUTS_TACHE[lien(g.tache)?.resultat || statutTache(g.tache)]}</span>
              </h3>
              <ul className="space-y-2">
                {g.commentaires.map((c) => (
                  <CommentaireItem key={c.id} c={c} choixRapport />
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

/** Clôture : liste à confirmer, regroupée par bien, « Reportée » par défaut pour ce qui n'est pas terminé. */
function Cloture({ onClose }) {
  const { data, dep } = useData();
  const [choix, setChoix] = useState(() => propositionCloture(dep.id, data).map((p) => ({ tache: p.tache, statut: p.statut })));
  const valider = async () => {
    await A.closeIntervention(dep.id, choix.map((c) => ({ tache_id: c.tache.id, statut: c.statut })), data);
    onClose();
  };
  const nb = (s) => choix.filter((c) => c.statut === s).length;
  const nomBien = (id) => data.appartements.find((a) => a.id === id)?.nom ?? 'Sans bien';
  const groupes = [...new Set(choix.map((c) => c.tache.appartement_id || ''))]
    .sort((a, b) => (a ? (b ? nomBien(a).localeCompare(nomBien(b), 'fr') : -1) : 1))
    .map((bien) => ({ bien, lignes: choix.map((c, i) => ({ ...c, i })).filter((c) => (c.tache.appartement_id || '') === bien) }));

  return (
    <Sheet title={`Clôturer : ${nomIntervention(dep, data)}`} onClose={onClose} footer={<Button variant="success" icon="check" className="w-full text-lg" onClick={valider}>Valider la clôture</Button>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Vérifie le résultat de chaque tâche. Les tâches reportées restent dans la liste et pourront entrer dans un prochain déplacement.
        </p>
        <p className="text-sm font-semibold">
          {nb('terminee')} terminée(s) · {nb('reportee')} reportée(s) · {nb('a_traiter')} à traiter
        </p>
        {choix.length === 0 && <Empty>Aucune tâche dans cette intervention.</Empty>}
        {groupes.map((g) => (
          <section key={g.bien} className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-bold tracking-wide text-slate-500 uppercase">
              <Icon name="home" className="size-4" /> {nomBien(g.bien)} <span className="font-normal">({g.lignes.length})</span>
            </h3>
            <ul className="space-y-2">
              {g.lignes.map((c) => (
                <li key={c.tache.id} className="space-y-2 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="font-semibold break-words">{c.tache.titre}</p>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-800">
                    {STATUT_ORDER.map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={c.statut === s}
                        onClick={() => setChoix((l) => l.map((x, j) => (j === c.i ? { ...x, statut: s } : x)))}
                        className={`min-h-11 rounded-lg text-sm font-semibold ${c.statut === s ? (s === 'terminee' ? 'bg-emerald-600 text-white' : s === 'reportee' ? 'bg-amber-500 text-white' : 'bg-sky-600 text-white') : 'text-slate-600 dark:text-slate-300'}`}
                      >
                        {STATUTS_TACHE[s]}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  );
}

/** Rapport d'intervention imprimable (PDF via « Imprimer ») : seulement ce qui est coché « Rapport ». */
function RapportImprimable() {
  const { data, dep, voyage } = useData();
  const r = recap(dep.id, data);
  const resultat = (t) => (data.intervention_taches || []).find((l) => l.intervention_id === dep.id && l.tache_id === t.id)?.resultat || statutTache(t);
  const garder = (liste) => liste.filter(dansRapport).map((c) => ({ ...c, photos: c.photos.filter(dansRapport) })).filter((c) => c.texte || c.photos.length);
  const compteRendu = garder(r.compteRendu);
  const parTache = r.parTache.map((g) => ({ ...g, commentaires: garder(g.commentaires) }));
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
  const bien = data.appartements.find((a) => a.id === bienIntervention(dep, data))?.nom;
  return (
    <div className="hidden p-4 text-black print:block">
      <h1 className="text-2xl font-bold">Rapport d'intervention{bien ? ` – ${bien}` : ''}</h1>
      <p className="mb-4 text-sm first-letter:uppercase">
        {dateLongue(dep.date_debut)} · {voyage.nom} · {STATUTS[dep.statut]} · imprimé le {new Date().toLocaleDateString('fr-FR')}
      </p>
      <h2 className="mb-1 border-b border-black text-lg font-bold">Tâches</h2>
      <ul className="mb-4">
        {r.parTache.map(({ tache }) => (
          <li key={tache.id} className="py-0.5">
            {resultat(tache) === 'terminee' ? '☑' : '☐'} {tache.titre} – <b>{STATUTS_TACHE[resultat(tache)]}</b>
          </li>
        ))}
      </ul>
      {compteRendu.length > 0 && (
        <>
          <h2 className="mb-1 border-b border-black text-lg font-bold">Compte rendu</h2>
          <div className="mb-4">{compteRendu.map(bloc)}</div>
        </>
      )}
      {parTache.some((g) => g.commentaires.length) && (
        <>
          <h2 className="mb-1 border-b border-black text-lg font-bold">Commentaires par tâche</h2>
          {parTache
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
