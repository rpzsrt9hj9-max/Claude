import { useEffect, useMemo, useState } from 'react';
import { DataContext, useAllData, useLocalState, useSyncState, useTrip } from './data.js';
import { login, sync } from './db.js';
import { Button, Icon } from './components/ui.jsx';
import { TachesView } from './views/TachesView.jsx';
import { ArticlesView } from './views/ArticlesView.jsx';
import { ChecklistView, PrintableList } from './views/ChecklistView.jsx';
import { PlusView } from './views/PlusView.jsx';
import { SearchView } from './views/SearchView.jsx';

const TABS = [
  ['taches', 'Tâches', 'tasks'],
  ['materiel', 'Matériel', 'box'],
  ['outillage', 'Outillage', 'tool'],
  ['consommable', 'Conso.', 'disc'],
  ['charger', 'Charger', 'truck'],
  ['plus', 'Plus', 'more'],
];

export default function App() {
  const s = useSyncState();
  const data = useAllData();
  if (s.authed === false) return <Login />;
  if (!data || s.authed === null) return <Splash />;
  return <Main data={data} sync={s} />;
}

function Main({ data, sync: syncInfo }) {
  const [tab, setTab] = useLocalState('tab', 'taches');
  const [storedDep, setDepId] = useLocalState('deplacement', null);
  const [theme, setTheme] = useLocalState('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  const [search, setSearch] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Déplacement courant : celui choisi, sinon le premier non terminé
  const dep = data.deplacements.find((d) => d.id === storedDep) ?? data.deplacements.find((d) => d.statut !== 'termine') ?? data.deplacements[0];
  const depId = dep?.id ?? null;
  const trip = useTrip(data, depId);
  const ctx = useMemo(() => ({ data, dep, depId, setDepId, trip, user: syncInfo.user }), [data, dep, depId, setDepId, trip, syncInfo.user]);

  if (!dep && data.deplacements.length === 0 && syncInfo.status === 'syncing') return <Splash />;

  return (
    <DataContext.Provider value={ctx}>
      <div className="mx-auto min-h-dvh max-w-2xl print:hidden">
        <header className="safe-top sticky top-0 z-40 border-b border-slate-200 bg-slate-50/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
          <div className="flex items-center gap-2 px-3 py-2">
            <select
              className="min-w-0 flex-1 !border-0 !bg-transparent !px-1 text-lg font-bold !ring-0"
              value={depId ?? ''}
              onChange={(e) => setDepId(e.target.value)}
              aria-label="Déplacement"
            >
              {data.deplacements.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.statut === 'termine' ? '✓ ' : ''}
                  {d.nom}
                </option>
              ))}
            </select>
            <SyncBadge s={syncInfo} />
            <Button variant="ghost" icon="search" aria-label="Rechercher" className="!px-2" onClick={() => setSearch(true)} />
          </div>
        </header>

        <main className="px-4 pt-4 pb-28">
          {!dep ? (
            <div className="py-10 text-center">
              <p className="mb-4 text-slate-500">Aucun déplacement. Crée le premier :</p>
              <PlusView theme={theme} setTheme={setTheme} />
            </div>
          ) : (
            <>
              {dep.statut === 'termine' && tab !== 'plus' && (
                <p className="mb-3 rounded-xl bg-slate-200 p-2 text-center text-sm dark:bg-slate-800">Ce déplacement est clôturé.</p>
              )}
              {tab === 'taches' && <TachesView />}
              {tab === 'materiel' && <ArticlesView type="materiel" key="m" />}
              {tab === 'outillage' && <ArticlesView type="outillage" key="o" />}
              {tab === 'consommable' && <ArticlesView type="consommable" key="c" />}
              {tab === 'charger' && <ChecklistView />}
              {tab === 'plus' && <PlusView theme={theme} setTheme={setTheme} />}
            </>
          )}
        </main>

        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div className="mx-auto flex max-w-2xl">
            {TABS.map(([id, label, icon]) => {
              const p = trip?.progress[id];
              const badge = p && p.total ? p.total - p.done : 0;
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active ? 'text-sky-600 dark:text-sky-400' : 'text-slate-500'}`}
                >
                  <Icon name={icon} className="size-6" strokeWidth={active ? 2.5 : 2} />
                  {label}
                  {badge > 0 && <span className="absolute top-1.5 left-1/2 ml-2 rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">{badge}</span>}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
      <PrintableList />
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
          <h1 className="text-2xl font-bold">Déplacements</h1>
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
