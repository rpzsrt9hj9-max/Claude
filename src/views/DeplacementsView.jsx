import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { DataContext, useData, useLocalState } from '../data.js';
import { STATUTS, cleSortie } from '../../shared/schema.js';
import { computeTrip } from '../../shared/calc.js';
import {
  STATUTS_TACHE, STATUTS_CLOTURE, dansRapport, propositionCloture, recap, statutTache, tachesIntervention, liens,
} from '../../shared/interventions.js';
import {
  listeVoyages, interventionsDuVoyage, tachesVoyage, statutVoyage, nomIntervention, bienIntervention, voyageDe,
} from '../../shared/voyages.js';
import { Button, Empty, Icon, Sheet, TextField } from '../components/ui.jsx';
import { Glissable } from '../components/Glissable.jsx';
import { BoutonChrono, SuggestionChrono, TempsView } from '../components/Chrono.jsx';
import { useContexteEcran } from '../chrono.js';
import { ACTIVITES, ORDRE_ACTIVITES, duree, formatDuree } from '../../shared/temps.js';
import { estimerDeplacement, tempsTache } from '../../shared/estimations.js';
import { formatEstimation } from '../components/Chrono.jsx';
import { CLASSEMENTS_INTERVENTIONS, classerInterventions } from '../../shared/classement.js';
import { lignesDescription, planification, reports, tacheFigee } from '../../shared/interventions.js';
import { refIntervention, refTache, refVoyage } from '../../shared/references.js';
import { useReglages } from '../reglages.js';
import { AAcheterView } from './AAcheterView.jsx';
import { LigneTache, dateCourte } from './BacklogView.jsx';
import { TacheEditor } from './TacheEditor.jsx';
import { CommentairesParIntervention, ListeCommentaires, NouveauCommentaire, Photo, dateHeure } from '../components/Commentaires.jsx';
import { TachesView } from './TachesView.jsx';
import { ArticlesView } from './ArticlesView.jsx';
import { ChecklistView, PrintableList } from './ChecklistView.jsx';
import { ChoixTaches } from './ChoixTaches.jsx';
import * as A from '../actions.js';

/** À l'ouverture d'une fiche par le crayon, le curseur se place à la fin du nom (un toucher de moins). */
const curseurAuBout = (e) => {
  const n = e.target.value.length;
  e.target.setSelectionRange?.(n, n);
};

export const dateLongue = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Date à fixer');

const COULEUR_STATUT = { termine: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300' };
const TEXTE_STATUT = { termine: 'text-emerald-700 dark:text-emerald-400' };
const LIBELLE_VOYAGE = { termine: 'Terminé' };
/** Deux états seulement : à faire (pas de pastille) ou terminé (pastille verte). */
export const BadgeStatut = ({ statut, voyage }) =>
  statut === 'termine' ? <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${COULEUR_STATUT.termine}`}>{(voyage ? LIBELLE_VOYAGE : STATUTS).termine}</span> : null;

function Onglets({ onglets, valeur, onChange, badges = {}, alertes = {} }) {
  const { dense } = useReglages();
  return (
    <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1">
      {onglets.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-current={valeur === id ? 'page' : undefined}
          className={`${dense ? 'min-h-9 px-3 text-sm' : 'min-h-11 px-4'} shrink-0 rounded-full font-medium ${valeur === id ? 'bg-sky-600 text-white' : 'bg-white text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-300'}`}
        >
          {label}
          {badges[id] > 0 && <span className={`ml-1 rounded-full px-1.5 text-[11px] font-bold text-white ${alertes[id] ? 'bg-red-600' : 'bg-amber-500'}`}>{badges[id]}</span>}
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

/** Carte compacte d'une intervention : « Bien · nom », référence, date, crayon pour renommer. */
function CarteIntervention({ i, voyage, onOpen, onEdit, detail }) {
  const { data } = useData();
  const { dense } = useReglages();
  return (
    <Glissable className="rounded-xl shadow-sm" fond="bg-white dark:bg-slate-900" supprimer={() => A.supprimerIntervention(i, data, nomIntervention(i, data))}>
    <div className="flex items-center">
      <button type="button" onClick={onOpen} className={`flex min-w-0 flex-1 items-center gap-2.5 text-left active:bg-slate-100 dark:active:bg-slate-800 ${dense ? 'min-h-12 py-1 pl-3' : 'min-h-14 py-2 pl-3'}`}>
        <Icon name="home" className="size-5 shrink-0 text-sky-600" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className={`truncate font-semibold ${dense ? '' : 'text-lg'}`}>{nomIntervention(i, data)}</span>
            {i.ref ? <span className="shrink-0 text-[11px] text-slate-400">{refIntervention(i)}</span> : null}
          </span>
          <span className="block truncate text-xs text-slate-500">
            {i.statut === 'termine' && <span className={TEXTE_STATUT.termine}>Terminée · </span>}
            {i.date_debut ? dateCourte(i.date_debut) : 'Date à fixer'}
            {voyage && !voyage.virtuel ? ` · 🚐 ${voyage.nom}` : ''}
            {detail ? ` · ${detail}` : ''}
          </span>
        </span>
      </button>
      <Button variant="ghost" icon="edit" className="!px-2.5 text-slate-400" aria-label={`Renommer ${nomIntervention(i, data)}`} onClick={onEdit} />
    </div>
    </Glissable>
  );
}

const resumeTaches = (i, data, tousLiens) => {
  const ts = tachesIntervention(i.id, data, tousLiens);
  const faites = ts.filter((t) => statutTache(t) === 'terminee').length;
  return `${faites}/${ts.length} tâche${ts.length > 1 ? 's' : ''}`;
};

/** Onglet Interventions : toutes les interventions (un bien chacune), classées par bien ou par déplacement. */
export function InterventionsView({ interventionId, setInterventionId }) {
  const { data } = useData();
  const { dense } = useReglages();
  const [voirClos, setVoirClos] = useState(false);
  const [classement, setClassement] = useLocalState('classement-interventions', 'bien');
  const [edition, setEdition] = useState(null);
  const tousLiens = useMemo(() => liens(data), [data]);
  const voyages = listeVoyages(data);
  const voyageDeI = (i) => voyages.find((v) => v.id === voyageDe(i, data));
  const ouverte = data.deplacements.find((d) => d.id === interventionId);
  if (ouverte && voyageDeI(ouverte)) return <InterventionDetail voyage={voyageDeI(ouverte)} dep={ouverte} onBack={() => setInterventionId(null)} />;

  const ctx = {
    bien: (i) => data.appartements.find((a) => a.id === bienIntervention(i, data)) ?? null,
    voyage: (i) => {
      const v = voyageDeI(i);
      return v && !v.virtuel ? v : null;
    },
  };
  const ouvertes = data.deplacements.filter((d) => d.statut !== 'termine');
  const closes = data.deplacements.filter((d) => d.statut === 'termine');
  const liste = (its, sens = 1) =>
    classerInterventions(its, classement, ctx).map((g) => (
      <section key={g.id || 'aucun'}>
        <h2 className="mb-1 text-sm font-bold tracking-wide text-slate-500 uppercase">
          {classement === 'deplacement' ? '🚐' : '🏠'} {g.titre} <span className="font-normal">({g.items.length})</span>
        </h2>
        <ul className={dense ? 'space-y-1' : 'space-y-2'}>
          {(sens < 0 ? [...g.items].reverse() : g.items).map((i) => (
            <CarteIntervention
              key={i.id}
              i={i}
              voyage={classement === 'bien' ? voyageDeI(i) : null}
              detail={resumeTaches(i, data, tousLiens)}
              onOpen={() => setInterventionId(i.id)}
              onEdit={() => setEdition(i)}
            />
          ))}
        </ul>
      </section>
    ));
  return (
    <div className={dense ? 'space-y-2' : 'space-y-3'}>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-slate-500">Une intervention = un bien. On les crée depuis un déplacement.</p>
        <select className="!min-h-10 w-40 shrink-0 text-sm" value={classement} onChange={(e) => setClassement(e.target.value)} aria-label="Classer les interventions">
          {CLASSEMENTS_INTERVENTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              ↕ {l}
            </option>
          ))}
        </select>
      </div>
      {ouvertes.length === 0 && <Empty>Aucune intervention en cours.</Empty>}
      {liste(ouvertes)}
      {closes.length > 0 && (
        <section className="space-y-2">
          <Button variant="ghost" className="w-full" onClick={() => setVoirClos(!voirClos)}>
            {voirClos ? 'Masquer' : 'Voir'} les interventions terminées ({closes.length})
          </Button>
          {voirClos && liste(closes, -1)}
        </section>
      )}
      {edition && <ReglagesIntervention dep={edition} onClose={() => setEdition(null)} onDeleted={() => setEdition(null)} />}
    </div>
  );
}

function ListeVoyages({ onOpen }) {
  const { data } = useData();
  const [creation, setCreation] = useState(false);
  const [voirClos, setVoirClos] = useState(false);
  const tousLiens = useMemo(() => liens(data), [data]);
  const voyages = listeVoyages(data).map((v) => ({ ...v, statut: statutVoyage(v.id, data) }));
  const { dense } = useReglages();
  const parDate = (a, b) => (a.date_debut || '9999').localeCompare(b.date_debut || '9999');
  const ouverts = voyages.filter((v) => v.statut !== 'termine').sort(parDate);
  const clos = voyages.filter((v) => v.statut === 'termine').sort((a, b) => -parDate(a, b));

  const carte = (v) => {
    const its = interventionsDuVoyage(v.id, data);
    return (
      <Glissable key={v.id} className="rounded-xl shadow-sm" fond="bg-white dark:bg-slate-900" supprimer={() => A.supprimerVoyage(v, data)}>
        <button type="button" onClick={() => onOpen(v.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left active:bg-slate-100 dark:active:bg-slate-800">
          <span className="min-w-0 flex-1">
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0 font-semibold break-words">
                {v.nom} {v.ref ? <span className="text-[11px] font-normal text-slate-400">{refVoyage(v)}</span> : null}
              </span>
              <BadgeStatut statut={v.statut} voyage />
            </span>
            <span className="block text-xs text-slate-500 first-letter:uppercase">{dateLongue(v.date_debut)}</span>
            <span className="mt-1 flex flex-wrap gap-1">
              {its.map((i) => {
                const ts = tachesIntervention(i.id, data, tousLiens);
                return (
                  <span key={i.id} className={`rounded-full px-2 py-0.5 text-xs ${i.statut === 'termine' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                    {nomIntervention(i, data)} · {ts.length}
                    {i.statut === 'termine' ? ' ✓' : ''}
                  </span>
                );
              })}
            </span>
          </span>
          <Icon name="chevron" className="size-5 shrink-0 text-slate-400" />
        </button>
      </Glissable>
    );
  };

  return (
    <div className={dense ? 'space-y-2' : 'space-y-3'}>
      <Button variant="primary" icon="plus" className="w-full" onClick={() => setCreation(true)}>
        Nouveau déplacement
      </Button>
      {ouverts.length === 0 && <Empty>Aucun déplacement prévu. Crée-en un et choisis ses tâches : une intervention est créée pour chaque bien.</Empty>}
      <ul className={dense ? 'space-y-1' : 'space-y-2'}>{ouverts.map(carte)}</ul>
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
  const [edition, setEdition] = useState(null);
  const { dense } = useReglages();
  const statut = statutVoyage(voyage.id, data);
  const its = interventionsDuVoyage(voyage.id, data);
  const trip = useMemo(() => computeTrip(voyage.id, data, tachesVoyage(voyage.id, data), (data.voyage_articles || []).filter((v) => v.voyage_id === voyage.id)), [voyage.id, data]);
  const dep = useMemo(() => ({ ...voyage, statut }), [voyage, statut]);
  const ctx = useMemo(() => ({ ...parent, dep, depId: voyage.id, trip }), [parent, dep, voyage.id, trip]);
  const restants = trip.items.filter((i) => !i.status.complet).length;
  const badges = { prendre: restants, charger: restants, acheter: trip.items.filter((i) => i.article.a_acheter).length };
  const ongletActif = ['interventions', 'prendre', 'charger', 'acheter', 'temps'].includes(onglet) ? onglet : 'interventions';
  useContexteEcran(1, { voyage_id: voyage.id, ecran: ongletActif });
  const ctxChrono = { voyage_id: voyage.id };
  const tachesDuVoyage = trip.taches.map((t) => t.tache);

  return (
    <DataContext.Provider value={ctx}>
      <div className={dense ? 'space-y-2' : 'space-y-3'}>
        <div className="flex items-center gap-2">
          <Button variant="ghost" icon="back" className="!px-2" aria-label="Retour aux déplacements" onClick={onBack} />
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setReglages(true)}>
            <span className="block truncate text-xl font-bold">{voyage.nom}</span>
            <span className="block text-xs text-slate-500 first-letter:uppercase">
              {dateLongue(voyage.date_debut)}
              {voyage.ref ? <span className="whitespace-nowrap"> · {refVoyage(voyage)}</span> : null}
            </span>
          </button>
          <BadgeStatut statut={statut} voyage />
          <BoutonChrono ctx={ctxChrono} taches={tachesDuVoyage} />
          <Button variant="ghost" icon="edit" className="!px-2" aria-label="Modifier le déplacement" onClick={() => setReglages(true)} />
        </div>

        <Onglets
          onglets={[['interventions', 'Interventions'], ['prendre', 'À prendre'], ['charger', 'Charger'], ['acheter', '🛒 À acheter'], ['temps', '⏱ Temps']]}
          valeur={ongletActif}
          onChange={setOnglet}
          badges={badges}
          alertes={{ acheter: true }}
        />

        {ongletActif === 'interventions' && (
          <div className="space-y-2">
            {statut !== 'termine' && (
              <Button variant="primary" icon="plus" className="w-full" onClick={() => setAjout(true)}>
                Ajouter des tâches
              </Button>
            )}
            {its.length === 0 && <Empty>Aucune intervention : ajoute des tâches, une intervention sera créée pour chaque bien.</Empty>}
            {its.length > 0 && <EstimationDeplacement taches={tachesDuVoyage} biens={its.map((i) => i.appartement_id).filter(Boolean)} />}
            <ul className={dense ? 'space-y-1' : 'space-y-2'}>
              {its.map((i) => {
                const ts = tachesIntervention(i.id, data);
                const faites = ts.filter((t) => statutTache(t) === 'terminee').length;
                const sortie = computeTrip(cleSortie(i.id), data, ts);
                const sortis = sortie.items.filter((x) => x.status.complet).length;
                return (
                  <CarteIntervention
                    key={i.id}
                    i={i}
                    detail={`${faites}/${ts.length} tâche${ts.length > 1 ? 's' : ''}${sortie.items.length ? ` · ${sortis}/${sortie.items.length} sortis` : ''}`}
                    onOpen={() => onOpen(i.id)}
                    onEdit={() => setEdition(i)}
                  />
                );
              })}
            </ul>
          </div>
        )}
        {(ongletActif === 'prendre' || ongletActif === 'charger') && <SuggestionChrono activite="preparation" ctx={ctxChrono} />}
        {ongletActif === 'acheter' && <SuggestionChrono activite="achats" ctx={ctxChrono} />}
        {ongletActif === 'prendre' && <ArticlesView />}
        {ongletActif === 'charger' && <ChecklistView />}
        {ongletActif === 'acheter' && <AAcheterView />}
        {ongletActif === 'temps' && <TempsView voyage={voyage} interventions={its.map((i) => ({ ...i, nomAffiche: nomIntervention(i, data) }))} taches={tachesDuVoyage} />}
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
      {edition && <ReglagesIntervention dep={edition} onClose={() => setEdition(null)} onDeleted={() => setEdition(null)} />}
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
          <TextField value={nom} onChange={setNom} autoFocus onFocus={curseurAuBout} aria-label="Nom du déplacement" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400">Date (reportée sur les interventions)</span>
          <input type="date" className="w-full" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
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
  const ctx = useMemo(() => ({ ...parent, dep, depId: voyage.id, interventionId: dep.id, voyage, trip, ctxChrono: { voyage_id: voyage.id, intervention_id: dep.id, appartement_id: bienIntervention(dep, parent.data) } }), [parent, dep, voyage, trip]);
  const ongletActif = ['taches', 'sortir', 'acheter', 'constats', 'recap'].includes(onglet) ? onglet : 'taches';
  const { dense } = useReglages();
  const ctxChrono = { voyage_id: voyage.id, intervention_id: dep.id, appartement_id: bienIntervention(dep, data) };
  useContexteEcran(2, { ...ctxChrono, ecran: ongletActif === 'sortir' ? 'sortir' : ongletActif });

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
      <div className={dense ? 'space-y-2' : 'space-y-3'}>
        <div className="flex items-center gap-1">
          <Button variant="ghost" icon="back" className="!px-2" aria-label={`Retour à ${voyage.nom}`} onClick={onBack} />
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setReglages(true)} aria-label="Renommer ou changer la date">
            {!voyage.virtuel && <span className="block truncate text-xs text-slate-500">🚐 {voyage.nom}</span>}
            <span className="block truncate text-lg font-bold">🏠 {nomIntervention(dep, data)}</span>
            <span className="block text-xs text-slate-500 first-letter:uppercase">
              {dateLongue(dep.date_debut)}
              {dep.ref ? <span className="whitespace-nowrap"> · {refIntervention(dep)}</span> : null}
            </span>
          </button>
          <BadgeStatut statut={dep.statut} />
          <BoutonChrono ctx={ctxChrono} taches={taches} />
          <Button variant="ghost" icon="edit" className="!px-2 text-slate-400" aria-label="Renommer l'intervention" onClick={() => setReglages(true)} />
        </div>
        <Onglets
          onglets={[['taches', 'Tâches'], ['sortir', 'À sortir'], ['acheter', '🛒 À acheter'], ['constats', '📝 État des lieux'], ['recap', 'Récap']]}
          valeur={ongletActif}
          onChange={setOnglet}
          badges={{ sortir: sortie.items.filter((i) => !i.status.complet).length, acheter: trip.items.filter((i) => i.article.a_acheter).length }}
          alertes={{ acheter: true }}
        />
        {dep.statut === 'termine' && ongletActif !== 'recap' && <p className="rounded-xl bg-slate-200 p-2 text-center text-sm dark:bg-slate-800">Cette intervention est terminée.</p>}
        {ongletActif === 'taches' && <TachesView />}
        {ongletActif === 'sortir' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">Ce qu'il faut sortir de la voiture pour ce bien. <span className="rounded bg-sky-100 px-1 dark:bg-sky-950">Bleu</span> : dans la voiture ; <span className="rounded bg-slate-200 px-1 dark:bg-slate-800">gris</span> : pas chargé.</p>
            <ChecklistView cle={cleSortie(dep.id)} trip={sortie} sortie charges={new Set(trip.items.filter((i) => i.status.taken > 0 || i.status.etat !== 'vide').map((i) => i.article.id))} />
          </div>
        )}
        {ongletActif === 'acheter' && <AAcheterView />}
        {ongletActif === 'constats' && <EtatDesLieux />}
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
  const [nom, setNom] = useState(dep.nom_perso ?? '');
  const bien = data.appartements.find((a) => a.id === bienIntervention(dep, data));
  const save = async () => {
    await A.updateIntervention(dep.id, { date_debut: date || null, nom_perso: nom.trim() || null });
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
          <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400">Nom {bien ? `(affiché « ${bien.nom} · … »)` : ''}</span>
          <TextField value={nom} onChange={setNom} placeholder="ex. : rotation locataire" aria-label="Nom de l'intervention" autoFocus onFocus={curseurAuBout} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400">Date d'intervention</span>
          <input type="date" className="w-full" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {dep.statut === 'termine' && (
          <Button className="w-full" onClick={() => A.setStatut(dep, 'en_preparation')}>
            Rouvrir l'intervention
          </Button>
        )}
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
  const [tempsAuRapport, setTempsAuRapport] = useLocalState('rapport-temps', true);
  const reglages = useReglages();
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
        {r.parTache.every((g) => !g.commentaires.length && !g.historique.length) && <p className="text-sm text-slate-500">Aucun commentaire sur les tâches de cette intervention.</p>}
        {r.parTache
          .filter((g) => g.commentaires.length || g.historique.length)
          .map((g) => (
            <div key={g.tache.id} className="space-y-2">
              <h3 className="font-semibold">
                {g.tache.titre}
                <span className="ml-2 text-xs font-normal text-slate-500">{STATUTS_TACHE[lien(g.tache)?.resultat || statutTache(g.tache)]}</span>
                {reports(g.tache.id, data).filter((i) => i.id !== dep.id).length > 0 && (
                  <span className="ml-2 text-xs font-semibold text-amber-600">↪ reportée {reports(g.tache.id, data).filter((i) => i.id !== dep.id).length}× avant</span>
                )}
              </h3>
              {/* Les commentaires de cette intervention, puis l'historique des précédentes, groupés. */}
              <CommentairesParIntervention commentaires={[...g.commentaires, ...g.historique]} />
            </div>
          ))}
      </section>

      <div className="grid grid-cols-1 gap-2">
        <label className="flex min-h-11 items-center gap-3 rounded-xl bg-white px-3 shadow-sm dark:bg-slate-900">
          <input type="checkbox" className="size-6 !min-h-0" checked={tempsAuRapport} onChange={(e) => setTempsAuRapport(e.target.checked)} />
          <span>
            Afficher les temps dans le rapport
            {reglages.tauxHoraire > 0 && <span className="block text-xs text-slate-500">et le coût ({reglages.tauxHoraire} €/h)</span>}
          </span>
        </label>
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
          {nb('terminee')} terminée(s) · {nb('reportee')} reportée(s) · {nb('annulee')} annulée(s) · {nb('a_traiter')} à traiter
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
                  <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-800">
                    {STATUTS_CLOTURE.map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={c.statut === s}
                        onClick={() => setChoix((l) => l.map((x, j) => (j === c.i ? { ...x, statut: s } : x)))}
                        className={`min-h-11 rounded-lg text-xs font-semibold ${c.statut === s ? (s === 'terminee' ? 'bg-emerald-600 text-white' : s === 'reportee' ? 'bg-amber-500 text-white' : s === 'annulee' ? 'bg-slate-600 text-white' : 'bg-sky-600 text-white') : 'text-slate-600 dark:text-slate-300'}`}
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
  const [tempsAuRapport] = useLocalState('rapport-temps', true);
  const { tauxHoraire } = useReglages();
  // Temps : sur place (tâches de cette intervention) ; trajet et préparation du déplacement à part (non divisés).
  const tTache = (t) => tempsTache(t.id, data, dep.id);
  const surPlace = r.parTache.reduce((s, { tache }) => s + tTache(tache), 0);
  const communs = {};
  for (const p of (data.temps || []).filter((x) => !x.deleted && x.fin != null && x.activite !== 'tache' && x.activite !== 'planification' && (x.intervention_id === dep.id || (!x.intervention_id && x.voyage_id === voyage.id)))) communs[p.activite] = (communs[p.activite] || 0) + duree(p);
  const nbBiens = interventionsDuVoyage(voyage.id, data).length;
  const cout = (ms) => (tauxHoraire > 0 ? ` · ${Math.round((ms / 3_600_000) * tauxHoraire)} €` : '');
  const resultat = (t) => (data.intervention_taches || []).find((l) => l.intervention_id === dep.id && l.tache_id === t.id)?.resultat || statutTache(t);
  const garder = (liste) => liste.filter(dansRapport).map((c) => ({ ...c, photos: c.photos.filter(dansRapport) })).filter((c) => c.texte || c.photos.length);
  const compteRendu = garder(r.compteRendu);
  const constats = garder(r.constats);
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
  return (
    <div className="hidden p-4 text-black print:block">
      <h1 className="text-2xl font-bold">Rapport d'intervention – {nomIntervention(dep, data)}</h1>
      <p className="mb-4 text-sm first-letter:uppercase">
        {dateLongue(dep.date_debut)}
        {dep.ref ? ` · ${refIntervention(dep)}` : ''}
        {voyage.virtuel ? '' : ` · ${voyage.nom}${voyage.ref ? ` (${refVoyage(voyage)})` : ''}`} · {STATUTS[dep.statut]} · imprimé le {new Date().toLocaleDateString('fr-FR')}
      </p>
      <h2 className="mb-1 border-b border-black text-lg font-bold">Tâches</h2>
      <ul className="mb-4">
        {r.parTache.map(({ tache: actuelle }) => {
          // Intervention clôturée : la tâche telle qu'elle était à la clôture (rapport figé).
          const tache = tacheFigee(actuelle, dep.id, data);
          const lignes = lignesDescription(tache.description).filter((l) => l.texte.trim());
          const avant = reports(tache.id, data).filter((i) => i.id !== dep.id && String(i.date_debut ?? '') <= String(dep.date_debut ?? '9999'));
          return (
            <li key={tache.id} className="break-inside-avoid py-1">
              <p>
                {resultat(tache) === 'terminee' ? '☑' : resultat(tache) === 'annulee' ? '⊘' : '☐'} <b>{tache.titre}</b>
                {tache.ref ? <span className="text-xs text-gray-600"> {refTache(tache)}</span> : null} – {resultat(tache) === 'annulee' ? 'Annulée (pas nécessaire)' : STATUTS_TACHE[resultat(tache)]}
                {tempsAuRapport && tTache(tache) > 0 && <span className="text-sm"> · ⏱ {formatDuree(tTache(tache))}</span>}
              </p>
              {avant.length > 0 && <p className="ml-6 text-xs text-gray-600">↪ Déjà reportée {avant.length}× ({avant.map((i) => libellePlanification(i, data)).join(', ')})</p>}
              {lignes.length > 0 && (
                <div className="ml-6 text-sm">
                  {lignes.map((l) => (
                    <p key={l.index} className="whitespace-pre-wrap">
                      {l.type === 'case' ? `${l.fait ? '☑' : '☐'} ${l.texte}` : l.texte}
                    </p>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {tempsAuRapport && (surPlace > 0 || Object.keys(communs).length > 0) && (
        <div className="mb-4 break-inside-avoid">
          <h2 className="mb-1 border-b border-black text-lg font-bold">Temps passé</h2>
          <p>
            Sur place (tâches) : <b>{formatDuree(surPlace)}</b>
            {cout(surPlace)}
          </p>
          {ORDRE_ACTIVITES.filter((a) => communs[a]).map((a) => (
            <p key={a} className="text-sm">
              {ACTIVITES[a].nom} : {formatDuree(communs[a])}
              {nbBiens > 1 && a !== 'achats' ? ` (déplacement commun à ${nbBiens} biens)` : ''}
            </p>
          ))}
        </div>
      )}
      {(constats.length > 0 || r.aPrevoir.length > 0) && (
        <div className="mb-4">
          <h2 className="mb-1 border-b border-black text-lg font-bold">État des lieux</h2>
          {constats.map(bloc)}
          {r.aPrevoir.length > 0 && (
            <>
              <h3 className="mt-2 font-bold">À prévoir</h3>
              <ul>
                {r.aPrevoir.map((t) => (
                  <li key={t.id} className="py-0.5">
                    {statutTache(t) === 'terminee' ? '☑' : '☐'} {t.titre}
                    {t.ref ? <span className="text-xs text-gray-600"> {refTache(t)}</span> : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
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

/** Estimation d'un déplacement d'après les fois précédentes : sur place (tâches) + trajet (non divisé). */
function EstimationDeplacement({ taches, biens }) {
  const { data } = useData();
  const e = estimerDeplacement(taches, biens, data);
  const aFaire = taches.filter((t) => t.statut !== 'terminee').length;
  if (!e.surPlace && !e.trajet) return null;
  return (
    <p className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm dark:bg-slate-900">
      ⏱ Estimation : sur place <b>≈ {formatDuree(e.surPlace)}</b>
      {e.trajet ? (
        <>
          {' '}
          · trajet <b>≈ {formatDuree(e.trajet)}</b> · total <b>≈ {formatDuree(e.total)}</b>
        </>
      ) : null}
      {e.sansEstimation.length > 0 && (
        <span className="block text-xs text-slate-500">
          {e.sansEstimation.length} tâche{e.sansEstimation.length > 1 ? 's' : ''} sur {aFaire} sans historique (pas comptée{e.sansEstimation.length > 1 ? 's' : ''})
        </span>
      )}
    </p>
  );
}

/** État des lieux : ce que l'on a vu sur place (constats, photos) et les tâches à prévoir pour la suite. */
function EtatDesLieux() {
  const { data, dep } = useData();
  const r = recap(dep.id, data);
  const bien = bienIntervention(dep, data);
  const [titre, setTitre] = useState('');
  const [ouverte, setOuverte] = useState(null);
  const ajouter = async () => {
    if (!titre.trim()) return;
    await A.prevoirTache(titre, dep.id, bien);
    setTitre('');
  };
  const ouverteTache = ouverte && data.taches.find((t) => t.id === ouverte);
  return (
    <div className="space-y-5">
      <p className="rounded-xl bg-slate-100 p-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        Ce que tu as vu sur place, et ce qu’il faudra faire ensuite. Les tâches à prévoir vont dans la liste des tâches (non planifiées) pour un prochain déplacement.
      </p>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">🔎 Constats</h2>
        <NouveauCommentaire interventionId={dep.id} genre="constat" placeholder="J’ai vu… (état, usure, problème, photo)" />
        <ListeCommentaires commentaires={[...r.constats].reverse()} choixRapport />
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">📋 À prévoir ({r.aPrevoir.length})</h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ajouter();
          }}
        >
          <TextField className="min-w-0 flex-1" value={titre} onChange={setTitre} placeholder="Tâche à prévoir (ex. : refaire le joint de douche)" aria-label="Tâche à prévoir" />
          <Button type="submit" variant="primary" icon="plus" aria-label="Ajouter la tâche à prévoir" className="!px-3" disabled={!titre.trim()} />
        </form>
        <ul className="space-y-1">
          {r.aPrevoir.map((t) => (
            <LigneTache key={t.id} tache={t} app={data.appartements.find((a) => a.id === t.appartement_id)} intervention={planification(t.id, data)} onOpen={() => setOuverte(t.id)} dense />
          ))}
        </ul>
      </section>
      {ouverteTache && <TacheEditor key={ouverte} tache={ouverteTache} onClose={() => setOuverte(null)} onOpen={setOuverte} />}
    </div>
  );
}
