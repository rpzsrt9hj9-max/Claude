import { useEffect, useMemo, useState } from 'react';
import { DataContext, useAllData, useLocalState, useSyncState } from './data.js';
import { login, sync } from './db.js';
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

  return (
    <DataContext.Provider value={ctx}>
      <div className="mx-auto min-h-dvh max-w-2xl print:hidden">
        <header className="safe-top sticky top-0 z-40 border-b border-slate-200 bg-slate-50/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
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
        <input type="email" className="w-full" placeholder="E-mail" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" className="w-full" placeholder="Mot de passe" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" variant="primary" className="w-full text-lg" disabled={busy}>
          {busy ? 'Connexion…' : 'Se connecter'}
        </Button>
      </form>
    </div>
  );
}
