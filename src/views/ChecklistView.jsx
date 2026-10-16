import { useData } from '../data.js';
const TITRE_TYPE = { outillage: '🔧 Outillage', consommable: '⚙️ Consommables', materiel: '📦 Matériel' };
import { groupByType, formatQty } from '../../shared/calc.js';
import { useState } from 'react';
import { ArticleEditor } from './ArticleEditor.jsx';
import { BigCheck, Button, Empty, Icon, ProgressBar } from '../components/ui.jsx';
import { markAllPris, togglePris } from '../actions.js';
import { loadingListText, shareText } from '../export.js';

/**
 * Checklist : tout ce qui n'est pas encore coché, groupé par type puis par lieu, sur un seul écran.
 * Par défaut, chargement du déplacement (contexte) ; avec `cle` et `trip`, liste « À sortir » d'une intervention.
 */
export function ChecklistView({ cle, trip: tripProp, sortie = false }) {
  const ctx = useData();
  const { data, dep } = ctx;
  const trip = tripProp ?? ctx.trip;
  const depId = cle ?? ctx.depId;
  const [editing, setEditing] = useState(null);
  const missing = trip.items.filter((i) => !i.status.complet);
  const done = trip.items.length - missing.length;

  const allLoaded = async () => {
    if (!confirm(`Marquer les ${missing.length} article(s) restants comme ${sortie ? 'sortis' : 'pris'} ?`)) return;
    await markAllPris(depId, missing);
  };

  return (
    <div className="space-y-4">
      <ProgressBar done={done} total={trip.items.length} label={sortie ? 'sortis de la voiture' : 'chargés'} />
      {!sortie && (
      <div className="grid grid-cols-2 gap-2">
        <Button icon="share" onClick={() => shareText(loadingListText(dep, trip, data.lieux))}>
          Partager
        </Button>
        <Button icon="download" onClick={() => window.print()}>
          PDF / Imprimer
        </Button>
      </div>
      )}

      {missing.length === 0 ? (
        <Empty>
          <span className="block text-5xl">🎉</span>
          <span className="mt-2 block text-lg font-semibold text-emerald-700 dark:text-emerald-400">{trip.items.length ? (sortie ? 'Tout est sorti !' : 'Tout est chargé !') : 'Rien à prévoir.'}</span>
        </Empty>
      ) : (
        groupByType(missing, data.lieux).map((gt) => (
          <section key={gt.type} className="space-y-3">
            <h2 className="text-lg font-bold">
              {TITRE_TYPE[gt.type]} <span className="text-sm font-normal text-slate-500">({gt.items.length})</span>
            </h2>
            {gt.lieux.map((g) => (
              <div key={g.lieu?.id ?? 'none'}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
                  <Icon name="pin" className="size-4 text-sky-600" />
                  {g.lieu ? g.lieu.nom : 'Lieu non renseigné'}
                </h3>
                <ul className="space-y-2">
                  {g.items.map((i) => (
                    <li key={i.article.id} className="flex items-center gap-3 rounded-2xl bg-white p-2 shadow-sm dark:bg-slate-900">
                      <BigCheck etat={i.status.etat} label={`${i.article.nom} ${sortie ? 'sorti' : 'pris'}`} onClick={() => togglePris(depId, i)} />
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(i.article)}>
                        <span className="text-lg font-semibold">{i.article.nom}</span>{' '}
                        <span className="text-lg font-bold text-sky-700 dark:text-sky-400">× {formatQty(i.total, i.article.unite)}</span>
                        {i.status.etat === 'partiel' && <span className="block text-sm text-amber-700 dark:text-amber-300">{formatQty(i.status.taken, null)} {sortie ? 'sorti(s)' : 'pris'} sur {formatQty(i.total, null)}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}

      {missing.length > 0 && (
        <Button variant="success" icon="check" className="w-full !min-h-14 text-lg" onClick={allLoaded}>
          {sortie ? 'Tout est sorti' : 'Tout est chargé'}
        </Button>
      )}
      {editing && <ArticleEditor article={editing} onClose={() => setEditing(null)} />}
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
      {groupByType(trip.items, data.lieux).map((gt) => (
        <section key={gt.type} className="mb-4">
          <h2 className="mb-1 border-b border-black text-lg font-bold">{TITRE_TYPE[gt.type]}</h2>
          {gt.lieux.map((g) => (
            <div key={g.lieu?.id ?? 'none'} className="mb-2 break-inside-avoid">
              <h3 className="font-bold">📍 {g.lieu ? g.lieu.nom : 'Lieu non renseigné'}</h3>
              <ul>
                {g.items.map((i) => (
                  <li key={i.article.id} className="py-0.5">
                    {i.status.complet ? '☑' : '☐'} {i.article.nom} × {formatQty(i.total, i.article.unite)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
