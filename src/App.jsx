import { useEffect, useMemo, useState } from 'react';
import { BandeauChrono } from './components/Chrono.jsx';
import { useContexteEcran } from './chrono.js';
import { BandeauAnnulation } from './components/Glissable.jsx';
import { DataContext, useAllData, useLocalState, useSyncState } from './data.js';
import { useLiveQuery } from 'dexie-react-hooks';
import { DEMO, db, login, quitterObservation, signup } from './db.js';
import { observation } from './supabase.js';
import { Bienvenue } from './views/Bienvenue.jsx';
import { Button, Icon } from './components/ui.jsx';
import { BacklogView } from './views/BacklogView.jsx';
import { DeplacementsView, InterventionsView } from './views/DeplacementsView.jsx';
import { Catalogue, PlusView } from './views/PlusView.jsx';
import { verifierReferences } from './actions.js';
import { nbAAcheter } from '../shared/achats.js';

const TABS = [
  ['taches', 'Tâches', 'tasks'],
  ['interventions', 'Interventions', 'tool'],
  ['deplacements', 'Déplacements', 'van'],
  ['catalogue', 'Catalogue', 'box'],
  ['plus', 'Plus', 'more'],
];
const ONGLETS = new Set(TABS.map((t) => t[0]));

/** Souci de synchro à signaler (sinon rien n'est affiché) : orange = en attente / hors ligne, rouge = erreur. */
export function alerteSync(s) {
  if (s.status === 'error') return 'rouge';
  if (s.status === 'offline' || s.pending > 0) return 'orange';
  return null;
}

export default function App() {
  const s = useSyncState();
  const data = useAllData();
  if (s.authed === false) return <Login />;
  if (!data || s.authed === null) return <Splash />;
  return <Main data={data} sync={s} />;
}

function Main({ data, sync: syncInfo }) {
  const [stored, setTab] = useLocalState('onglet', 'taches');
  const tab = ONGLETS.has(stored) ? stored : 'taches';
  const [interventionSeule, setInterventionSeule] = useLocalState('intervention-onglet', null);
  const [voyageId, setVoyageId] = useLocalState('voyage-ouvert', null);
  const [interventionId, setInterventionId] = useLocalState('intervention-ouverte', null);
  const [theme, setTheme] = useLocalState('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const ctx = useMemo(() => ({ data, user: syncInfo.user, sync: syncInfo }), [data, syncInfo]);

  // Références T- / I- / D- : attribuées aux nouveaux éléments, doublons corrigés (rien à faire la plupart du temps).
  useEffect(() => {
    verifierReferences(data).catch(() => {});
  }, [data]);

  // Premier démarrage d'un nouveau compte : seulement si le serveur a confirmé que l'espace est vide.
  const bienvenue = useLiveQuery(async () => (await db.meta.get('onboarding'))?.value ?? 'non', []);
  const espaceServeur = useLiveQuery(async () => (await db.meta.get('espace'))?.value ?? 'inconnu', []);
  const [bienvenueFaite, setBienvenueFaite] = useState(false);
  const espaceVide = data.categories.length === 0 && data.articles.length === 0 && data.taches.length === 0;
  const afficherBienvenue = !DEMO && !observation && !bienvenueFaite && espaceServeur === 'vide' && bienvenue === 'non' && espaceVide;

  const achats = nbAAcheter(data.articles);
  // Hauteur occupée en bas (barre + bandeau du chrono) : les boutons flottants se placent au-dessus.
  const [chronoVisible, setChronoVisible] = useState(0);
  useEffect(() => {
    document.documentElement.style.setProperty('--bas', chronoVisible ? '5.5rem' : '3rem');
  }, [chronoVisible]);
  const alerte = alerteSync(syncInfo);

  return (
    <DataContext.Provider value={ctx}>
      <div className="mx-auto min-h-dvh max-w-2xl print:hidden">
        {observation ? (
          <div className="safe-top sticky top-0 z-40 flex items-center gap-2 bg-violet-600 px-4 py-2 text-sm text-white">
            <Icon name="eye" className="size-5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              Compte de <b>{observation.nom || observation.email}</b>
            </span>
            <button type="button" onClick={quitterObservation} className="min-h-9 shrink-0 rounded-lg bg-white/20 px-3 font-semibold active:bg-white/30">
              Quitter
            </button>
          </div>
        ) : (
          <div className="safe-top" />
        )}

        <ContexteOnglet tab={tab} />
        <main className="px-4 pt-3 pb-[calc(var(--bas)+3rem)]">
          {tab === 'taches' && <BacklogView />}
          {tab === 'interventions' && <InterventionsView interventionId={interventionSeule} setInterventionId={setInterventionSeule} />}
          {tab === 'deplacements' && <DeplacementsView voyageId={voyageId} setVoyageId={setVoyageId} interventionId={interventionId} setInterventionId={setInterventionId} />}
          {tab === 'catalogue' && <Catalogue />}
          {tab === 'plus' && <PlusView theme={theme} setTheme={setTheme} />}
        </main>
        <BandeauAnnulation />

        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div className="mx-auto max-w-2xl">
            <BandeauChrono data={data} onHauteur={setChronoVisible} />
          </div>
          <div className="mx-auto flex max-w-2xl">
            {TABS.map(([id, label, icon]) => {
              const active = tab === id;
              const pastille = id === 'catalogue' && achats > 0 ? achats : null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    // Toucher l'onglet où l'on est déjà remonte d'un niveau.
                    if (id === 'interventions' && active) setInterventionSeule(null);
                    if (id === 'deplacements' && active) {
                      if (interventionId) setInterventionId(null);
                      else setVoyageId(null);
                    }
                    setTab(id);
                  }}
                  aria-current={active ? 'page' : undefined}
                  aria-label={pastille ? `${label} : ${pastille} à acheter` : id === 'plus' && alerte ? `${label} : synchronisation à vérifier` : label}
                  className={`relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center text-[10px] leading-tight font-medium ${active ? 'text-sky-600 dark:text-sky-400' : 'text-slate-500'}`}
                >
                  <span className="relative">
                    <Icon name={icon} className="size-5" strokeWidth={active ? 2.5 : 2} />
                    {pastille && <span className="absolute -top-1.5 -right-3 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] leading-4 font-bold text-white">{pastille > 99 ? '99+' : pastille}</span>}
                    {id === 'plus' && alerte && <span className={`absolute -top-0.5 -right-1 size-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${alerte === 'rouge' ? 'bg-red-600' : 'bg-amber-500'}`} />}
                  </span>
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
      {afficherBienvenue && <Bienvenue onTermine={() => setBienvenueFaite(true)} />}
    </DataContext.Provider>
  );
}

function Splash() {
  return <div className="flex min-h-dvh items-center justify-center text-slate-500">Chargement…</div>;
}

function Login() {
  const [mode, setMode] = useState('connexion'); // connexion | inscription
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [accepte, setAccepte] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const inscription = mode === 'inscription';
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      if (inscription) {
        const r = await signup({ nom, email, password, code });
        if (r.confirmation) {
          setInfo("Un e-mail de confirmation t'a été envoyé. Ouvre-le, puis reviens te connecter ici.");
          setMode('connexion');
          setPassword('');
        }
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(navigator.onLine ? err.message : 'Pas de réseau : la première connexion nécessite Internet.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-lg dark:bg-slate-900">
        <div className="text-center">
          <div className="mb-2 text-5xl">🧰</div>
          <h1 className="text-2xl font-bold">Interventions</h1>
          <p className="text-slate-500">Tâches, matériel et outillage</p>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-200 p-1 dark:bg-slate-800" role="tablist">
          {[['connexion', 'Se connecter'], ['inscription', 'Créer un compte']].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => {
                setMode(id);
                setError('');
                setInfo('');
              }}
              className={`min-h-11 rounded-xl text-sm font-semibold ${mode === id ? 'bg-white shadow dark:bg-slate-950' : 'text-slate-600 dark:text-slate-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {inscription && <input className="w-full" placeholder="Ton prénom" autoComplete="given-name" value={nom} onChange={(e) => setNom(e.target.value)} required />}
        <input type="email" className="w-full" placeholder="E-mail" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          type="password"
          className="w-full"
          placeholder={inscription ? 'Mot de passe (6 caractères minimum)' : 'Mot de passe'}
          autoComplete={inscription ? 'new-password' : 'current-password'}
          minLength={inscription ? 6 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {inscription && (
          <>
            <input className="w-full tracking-widest uppercase" placeholder="Code famille" autoComplete="off" autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value)} required />
            <label className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" className="mt-0.5 size-6 shrink-0 !min-h-0" checked={accepte} onChange={(e) => setAccepte(e.target.checked)} required />
              <span>J'ai compris que le gestionnaire de l'appli peut consulter et modifier mes données pour m'aider.</span>
            </label>
          </>
        )}
        {info && <p className="rounded-xl bg-emerald-100 p-3 text-sm text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200">{info}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" variant="primary" className="w-full text-lg" disabled={busy || (inscription && !accepte)}>
          {busy ? (inscription ? 'Création…' : 'Connexion…') : inscription ? 'Créer mon compte' : 'Se connecter'}
        </Button>
      </form>
    </div>
  );
}

/** Contexte de l'onglet affiché (niveau 0) pour le suivi du temps. */
function ContexteOnglet({ tab }) {
  useContexteEcran(0, { contexte: tab });
  return null;
}
