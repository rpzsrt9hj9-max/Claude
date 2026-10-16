import { useData } from '../data.js';
import { TYPES, TYPE_ICON } from '../../shared/schema.js';
import { groupByLieu, formatQty } from '../../shared/calc.js';
import { BigCheck, Button, Empty, Icon, ProgressBar } from '../components/ui.jsx';
import { markAllPris, togglePris } from '../actions.js';
import { loadingListText, shareText } from '../export.js';

/** Checklist de chargement : tout ce qui n'est pas encore pris, groupé par lieu, sur un seul écran. */
export function ChecklistView() {
  const { data, trip, depId, dep } = useData();
  const missing = trip.items.filter((i) => !i.status.complet);
  const done = trip.items.length - missing.length;

  const allLoaded = async () => {
    if (!confirm(`Marquer les ${missing.length} article(s) restants comme pris ?`)) return;
    await markAllPris(depId, missing);
  };

  return (
    <div className="space-y-4">
      <ProgressBar done={done} total={trip.items.length} label="chargés" />
      <div className="grid grid-cols-2 gap-2">
        <Button icon="share" onClick={() => shareText(loadingListText(dep, trip, data.lieux))}>
          Partager
        </Button>
        <Button icon="download" onClick={() => window.print()}>
          PDF / Imprimer
        </Button>
      </div>

      {missing.length === 0 ? (
        <Empty>
          <span className="block text-5xl">🎉</span>
          <span className="mt-2 block text-lg font-semibold text-emerald-700 dark:text-emerald-400">Tout est chargé !</span>
        </Empty>
      ) : (
        groupByLieu(missing, data.lieux).map((g) => (
          <section key={g.lieu?.id ?? 'none'}>
            <h2 className="mb-2 flex items-center gap-2 font-bold text-slate-600 dark:text-slate-300">
              <Icon name="pin" className="size-5 text-sky-600" />
              {g.lieu ? g.lieu.nom : 'Lieu non renseigné'}
            </h2>
            <ul className="space-y-2">
              {g.items.map((i) => (
                <li key={i.article.id} className="flex items-center gap-3 rounded-2xl bg-white p-2 shadow-sm dark:bg-slate-900">
                  <BigCheck etat={i.status.etat} label={`${i.article.nom} pris`} onClick={() => togglePris(depId, i)} />
                  <span className="min-w-0 flex-1">
                    <span className="text-lg font-semibold">
                      {TYPE_ICON[i.article.type]} {i.article.nom}
                    </span>{' '}
                    <span className="text-lg font-bold text-sky-700 dark:text-sky-400">× {formatQty(i.total, i.article.unite)}</span>
                    {i.status.etat === 'partiel' && <span className="block text-sm text-amber-700 dark:text-amber-300">{formatQty(i.status.taken, null)} pris sur {formatQty(i.total, null)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {missing.length > 0 && (
        <Button variant="success" icon="check" className="w-full !min-h-14 text-lg" onClick={allLoaded}>
          Tout est chargé
        </Button>
      )}
    </div>
  );
}

/** Version imprimable (PDF via « Imprimer ») de la liste de chargement. */
export function PrintableList() {
  const ctx = useData();
  if (!ctx?.trip) return null;
  const { data, trip, dep } = ctx;
  return (
    <div className="hidden p-4 text-black print:block">
      <h1 className="mb-1 text-2xl font-bold">{dep.nom} – liste de chargement</h1>
      <p className="mb-4 text-sm">Imprimée le {new Date().toLocaleDateString('fr-FR')}</p>
      {groupByLieu(trip.items, data.lieux).map((g) => (
        <section key={g.lieu?.id ?? 'none'} className="mb-4 break-inside-avoid">
          <h2 className="mb-1 border-b border-black text-lg font-bold">📍 {g.lieu ? g.lieu.nom : 'Lieu non renseigné'}</h2>
          <ul>
            {g.items.map((i) => (
              <li key={i.article.id} className="py-0.5">
                {i.status.complet ? '☑' : '☐'} {i.article.nom} × {formatQty(i.total, i.article.unite)}
                <span className="text-xs text-gray-600"> – {TYPES[i.article.type]}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
