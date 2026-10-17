import { useEffect, useMemo, useState } from 'react';
import { DataContext, useAllData, useLocalState, useSyncState } from './data.js';
import { useLiveQuery } from 'dexie-react-hooks';
import { DEMO, db, login, quitterObservation, signup, sync } from './db.js';
import { observation } from './supabase.js';
import { Bienvenue } from './views/Bienvenue.jsx';
import { Button, Icon } from './components/ui.jsx';
import { BacklogView } from './views/BacklogView.jsx';
import { DeplacementsView, InterventionsView } from './views/DeplacementsView.jsx';
import { Catalogue, PlusView } from './views/PlusView.jsx';
import { SearchView } from './views/SearchView.jsx';

const TABS = [
  ['taches', 'Tâches', 'tasks'],
  ['interventions', 'Interventions', 'tool'],
  ['deplacements', 'Déplacements', 'van'],
  ['catalogue', 'Catalogue', 'box'],
  ['plus', 'Plus', 'more'],
];
const TITRES = { taches: 'Tâches', interventions: 'Interventions', deplacements: 'Déplacements', catalogue: 'Catalogue', plus: 'Plus' };

export default function App() {
  const s = useSyncState();
  const data = useAllData();
  if (s.authed === false) return <Login />;
  if (!data || s.authed === null) return <Splash />;
  return <Main data={data} sync={s} />;
}

function Main({ data, sync: syncInfo }) {
  const [stored, setTab] = useLocalState('onglet', 'taches');
  const tab = TITRES[stored] ? stored : 'taches';
  const [interventionSeule, setInterventionSeule] = useLocalState('intervention-onglet', null);
  const [voyageId, setVoyageId] = useLocalState('voyage-ouvert', null);
  const [interventionId, setInterventionId] = useLocalState('intervention-ouverte', null);
  const [theme, setTheme] = useLocalState('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  const [search, setSearch] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const ctx = useMemo(() => ({ data, user: syncInfo.user }), [data, syncInfo.user]);

  // Premier démarrage d'un nouveau compte : après une première synchro réussie, si l'espace est vide.
  const bienvenue = useLiveQuery(async () => (await db.meta.get('onboarding'))?.value ?? 'non', []);
  const espaceServeur = useLiveQuery(async () => (await db.meta.get('espace'))?.value ?? 'inconnu', []);
  const [bienvenueFaite, setBienvenueFaite] = useState(false);
  const espaceVide = data.categories.length === 0 && data.articles.length === 0 && data.taches.length === 0;
  const afficherBienvenue = !DEMO && !observation && !bienvenueFaite && espaceServeur === 'vide' && bienvenue === 'non' && espaceVide;

  return (
    <DataContext.Provider value={ctx}>
      <div className="mx-auto min-h-dvh max-w-2xl print:hidden">
        <header className="safe-top sticky top-0 z-40 border-b border-slate-200 bg-slate-50/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
          {observation && (
            <div className="flex items-center gap-2 bg-violet-600 px-4 py-2 text-sm text-white">
              <Icon name="eye" className="size-5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                Compte de <b>{observation.nom || observation.email}</b>
              </span>
              <button type="button" onClick={quitterObservation} className="min-h-9 shrink-0 rounded-lg bg-white/20 px-3 font-semibold active:bg-white/30">
                Quitter
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 px-4 py-2">
            <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{TITRES[tab]}</h1>
            <SyncBadge s={syncInfo} />
            <Button variant="ghost" icon="search" aria-label="Rechercher" className="!px-2" onClick={() => setSearch(true)} />
          </div>
          {syncInfo.status === 'error' && syncInfo.message && <p className="bg-red-100 px-4 py-2 text-sm text-red-800 dark:bg-red-500/20 dark:text-red-200">{syncInfo.message}</p>}
        </header>

        <main className="px-4 pt-4 pb-28">
          {tab === 'taches' && <BacklogView />}
          {tab === 'interventions' && <InterventionsView interventionId={interventionSeule} setInterventionId={setInterventionSeule} />}
          {tab === 'deplacements' && <DeplacementsView voyageId={voyageId} setVoyageId={setVoyageId} interventionId={interventionId} setInterventionId={setInterventionId} />}
          {tab === 'catalogue' && <Catalogue />}
          {tab === 'plus' && <PlusView theme={theme} setTheme={setTheme} />}
        </main>

        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div className="mx-auto flex max-w-2xl">
            {TABS.map(([id, label, icon]) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    // Toucher « Déplacements » quand on y est déjà remonte d'un niveau.
                    if (id === 'interventions' && active) setInterventionSeule(null);
                    if (id === 'deplacements' && active) {
                      if (interventionId) setInterventionId(null);
                      else setVoyageId(null);
                    }
                    setTab(id);
                  }}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active ? 'text-sky-600 dark:text-sky-400' : 'text-slate-500'}`}
                >
                  <Icon name={icon} className="size-6" strokeWidth={active ? 2.5 : 2} />
                  {label}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
      {search && <SearchView onClose={() => setSearch(false)} />}
      {afficherBienvenue && <Bienvenue onTermine={() => setBienvenueFaite(true)} />}
    </DataContext.Provider>
  );
}

function SyncBadge({ s }) {
  const map = {
    ok: ['bg-emerald-500', s.pending ? `${s.pending} en attente` : 'Synchronisé'],
    syncing: ['bg-sky-500 animate-pulse', 'Synchro…'],
    offline: ['bg-amber-500', s.pending ? `Hors ligne · ${s.pending} en attente` : 'Hors ligne'],
    error: ['bg-red-500', 'Erreur de synchro'],
    idle: ['bg-slate-400', '…'],
  };
  const [color, label] = map[s.status] ?? map.idle;
  return (
    <button type="button" onClick={() => sync()} className="flex min-h-11 items-center gap-1.5 rounded-full px-2 text-xs text-slate-500" title={label} aria-label={`État : ${label}. Synchroniser`}>
      <span className={`size-2.5 rounded-full ${color}`} />
      <span className="hidden sm:inline">{label}</span>
      {s.status !== 'ok' && <span className="sm:hidden">{s.status === 'offline' ? 'Hors ligne' : ''}</span>}
    </button>
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
