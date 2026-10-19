import { useData, useLocalState } from '../data.js';
import { formatQty } from '../../shared/calc.js';
import { TYPE_ICON } from '../../shared/schema.js';
import { BigCheck, Button, Empty } from '../components/ui.jsx';
import { aAcheter, acheter, plusAAcheter } from '../actions.js';
import { Glissable } from '../components/Glissable.jsx';

/**
 * Onglet « À acheter » d'un déplacement ou d'une intervention : les articles nécessaires marqués « à acheter ».
 * Cocher « acheté » les range dans le véhicule ; ils restent visibles barrés (masquables) jusqu'à être rangés ailleurs.
 */
export function AAcheterView({ trip: tripProp }) {
  const ctx = useData();
  const { data } = ctx;
  const trip = tripProp ?? ctx.trip;
  const [masquer, setMasquer] = useLocalState('masquer-achetes', false);
  const aAcheterItems = trip.items.filter((i) => i.article.a_acheter);
  const achetes = trip.items.filter((i) => !i.article.a_acheter && i.article.achete_le);
  const lignes = [...aAcheterItems, ...(masquer ? [] : achetes)];

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {aAcheterItems.length ? `${aAcheterItems.length} article(s) à acheter.` : 'Rien à acheter.'} Coché « acheté », l'article est rangé dans le Véhicule.
      </p>
      {achetes.length > 0 && (
        <button type="button" onClick={() => setMasquer(!masquer)} className={`min-h-9 rounded-full px-4 text-sm ${masquer ? 'bg-slate-700 text-white' : 'bg-white text-slate-500 shadow-sm dark:bg-slate-900'}`}>
          {masquer ? `Achetés masqués (${achetes.length})` : 'Masquer achetés'}
        </button>
      )}
      {lignes.length === 0 && <Empty>🛒 Aucun achat prévu pour ces tâches. Coche « À acheter » sur la fiche d'un article.</Empty>}
      <ul className="space-y-1">
        {lignes.map((i) => {
          const fait = !i.article.a_acheter;
          return (
            <Glissable key={i.article.id} className="rounded-xl shadow-sm" fond={fait ? 'bg-emerald-50 dark:bg-emerald-950' : 'bg-white dark:bg-slate-900'} retirer={fait ? undefined : () => plusAAcheter(i.article)} libelleRetirer="Plus à acheter">
            <div className="flex min-h-12 items-center gap-2 pr-2 pl-2.5">
              <BigCheck
                compact
                etat={fait ? 'complet' : 'vide'}
                label={fait ? `${i.article.nom} : remettre à acheter` : `${i.article.nom} acheté`}
                onClick={() => (fait ? aAcheter([i.article.id], true) : acheter([i.article.id], data))}
              />
              <span className={`min-w-0 flex-1 truncate font-semibold ${fait ? 'text-slate-500 line-through' : ''}`}>
                {TYPE_ICON[i.article.type]} {i.article.nom}
              </span>
              <span className="shrink-0 font-bold text-sky-700 dark:text-sky-400">× {formatQty(i.total, i.article.unite)}</span>
            </div>
            </Glissable>
          );
        })}
      </ul>
      {aAcheterItems.length > 1 && (
        <Button variant="success" icon="check" className="w-full" onClick={() => confirm(`Marquer les ${aAcheterItems.length} articles comme achetés ?`) && acheter(aAcheterItems.map((i) => i.article.id), data)}>
          Tout est acheté
        </Button>
      )}
    </div>
  );
}
