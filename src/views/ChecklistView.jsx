import { useState } from 'react';
import { useData } from '../data.js';
import { groupByType, formatQty } from '../../shared/calc.js';
import { TYPES, TYPE_ICON } from '../../shared/schema.js';
import { ArticleEditor } from './ArticleEditor.jsx';
import { ItemRow, bloqueParAchat, retirerDeLaListe } from './ArticlesView.jsx';
import { Button, Empty, Icon, ProgressBar } from '../components/ui.jsx';
import { markAllPris } from '../actions.js';
import { useReglages } from '../reglages.js';
import { loadingListText, shareText } from '../export.js';

const titreType = (type) => `${TYPE_ICON[type]} ${TYPES[type]}`;

/**
 * Checklist : tout ce qui n'est pas encore coché, groupé par type puis par lieu, sur un seul écran.
 * Par défaut, chargement du déplacement (contexte) ; avec `cle` et `trip`, liste « À sortir » d'une intervention.
 * charges (À sortir) : articles chargés dans la voiture ; on ne peut sortir que ceux-là (bleu), les autres sont grisés.
 */
export function ChecklistView({ cle, trip: tripProp, sortie = false, charges }) {
  const ctx = useData();
  const { data, dep } = ctx;
  const reglages = useReglages();
  const trip = tripProp ?? ctx.trip;
  const depId = cle ?? ctx.depId;
  const [editing, setEditing] = useState(null);
  const missing = trip.items.filter((i) => !i.status.complet);
  const done = trip.items.length - missing.length;
  // Les articles encore à acheter ne sont pas cochés d'office par « Tout est chargé ».
  const dansVoiture = (i) => !charges || charges.has(i.article.id);
  const cochables = sortie ? missing.filter(dansVoiture) : missing.filter((i) => !bloqueParAchat(i.article, reglages));

  const allLoaded = async () => {
    if (!confirm(`Marquer les ${cochables.length} article(s) restants comme ${sortie ? 'sortis' : 'pris'} ?`)) return;
    await markAllPris(depId, cochables);
  };

  return (
    <div className={reglages.dense ? 'space-y-2' : 'space-y-3'}>
      <ProgressBar done={done} total={trip.items.length} label={sortie ? 'sortis de la voiture' : 'chargés'} />
      {!sortie && (
        <div className="grid grid-cols-2 gap-2">
          <Button icon="share" className="!min-h-10 text-sm" onClick={() => shareText(loadingListText(dep, trip, data.lieux))}>
            Partager
          </Button>
          <Button icon="download" className="!min-h-10 text-sm" onClick={() => window.print()}>
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
          <section key={gt.type} className="space-y-2">
            <h2 className="font-bold">
              {titreType(gt.type)} <span className="text-sm font-normal text-slate-500">({gt.items.length})</span>
            </h2>
            {gt.lieux.map((g) => (
              <div key={g.lieu?.id ?? 'none'}>
                <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
                  <Icon name="pin" className="size-4 text-sky-600" />
                  {g.lieu ? g.lieu.nom : 'Lieu non renseigné'}
                </h3>
                <ul className="space-y-1">
                  {g.items.map((i) => (
                    <ItemRow
                      key={i.article.id}
                      item={i}
                      cle={depId}
                      verbe={sortie ? 'sorti' : 'pris'}
                      onEdit={() => setEditing(i.article)}
                      onRetirer={sortie ? undefined : () => retirerDeLaListe(i, depId, data)}
                      fondSortie={sortie ? (dansVoiture(i) ? 'dedans' : 'absent') : undefined}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}

      {cochables.length > 0 && (
        <Button variant="success" icon="check" className="w-full !min-h-12" onClick={allLoaded}>
          {sortie ? (cochables.length < missing.length ? `Tout ce qui est dans la voiture est sorti (${cochables.length})` : 'Tout est sorti') : 'Tout est chargé'}
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
          <h2 className="mb-1 border-b border-black text-lg font-bold">{titreType(gt.type)}</h2>
          {gt.lieux.map((g) => (
            <div key={g.lieu?.id ?? 'none'} className="mb-2 break-inside-avoid">
              <h3 className="font-bold">📍 {g.lieu ? g.lieu.nom : 'Lieu non renseigné'}</h3>
              <ul>
                {g.items.map((i) => (
                  <li key={i.article.id} className="py-0.5">
                    {i.status.complet ? '☑' : '☐'} {i.article.a_acheter ? '🛒 ' : ''}
                    {i.article.nom} × {formatQty(i.total, i.article.unite)}
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
