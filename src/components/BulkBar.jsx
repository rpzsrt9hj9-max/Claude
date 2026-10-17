import { useState } from 'react';
import { useData } from '../data.js';
import { suggestCategorie } from '../../shared/categories.js';
import { defaultCumul } from '../../shared/schema.js';
import { aAcheter, acheter, bulkUpdateArticles, rangerArticles } from '../actions.js';
import { Button, CategorieSelect, LieuSelect, TYPE_OPTIONS } from './ui.jsx';

/** Barre de modification groupée : ranger, classer, changer le type, marquer à acheter ou acheté. */
export function BulkBar({ selection, onDone, onAll }) {
  const { data } = useData();
  const [msg, setMsg] = useState('');
  const n = selection.size;

  const fait = (label) => {
    setMsg(`${n} article(s) ${label}.`);
    setTimeout(onDone, 900);
  };
  const apply = async (patch, label) => {
    if (!n) return;
    await bulkUpdateArticles(selection, patch);
    fait(label);
  };

  const autoClassify = async () => {
    const writes = [];
    for (const id of selection) {
      const a = data.articles.find((x) => x.id === id);
      const c = a && suggestCategorie(a.nom, { categories: data.categories, articles: data.articles.filter((x) => x.id !== id) });
      if (c && c.id !== a.categorie_id) writes.push([id, c.id]);
    }
    for (const [id, categorie_id] of writes) await bulkUpdateArticles([id], { categorie_id });
    setMsg(writes.length ? `${writes.length} article(s) classé(s) automatiquement.` : 'Aucune catégorie évidente trouvée.');
  };

  return (
    <div className="safe-bottom fixed inset-x-0 bottom-12 z-40 border-t-2 border-sky-500 bg-white p-2 shadow-2xl dark:bg-slate-900">
      <div className="mx-auto max-w-2xl space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold">{n} sélectionné(s)</span>
          <span className="flex gap-1">
            <Button variant="ghost" className="!min-h-9 text-sm" onClick={onAll}>
              Tout
            </Button>
            <Button variant="ghost" className="!min-h-9 text-sm" onClick={onDone}>
              Annuler
            </Button>
          </span>
        </div>
        {msg ? (
          <p className="rounded-xl bg-emerald-100 p-2 text-center font-medium text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200">{msg}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Button
                className="!min-h-10 text-sm"
                disabled={!n}
                onClick={async () => {
                  await aAcheter(selection, true);
                  fait('à acheter');
                }}
              >
                🛒 À acheter
              </Button>
              <Button
                variant="success"
                className="!min-h-10 text-sm"
                disabled={!n}
                onClick={async () => {
                  await acheter(selection, data);
                  fait('achetés, dans le véhicule');
                }}
              >
                ✓ Acheté
              </Button>
            </div>
            <LieuSelect
              lieux={data.lieux}
              value=""
              emptyLabel="📍 Ranger à…"
              className="w-full"
              onChange={async (v) => {
                if (!v || !n) return;
                await rangerArticles(selection, v, data);
                fait(`rangé(s) à : ${data.lieux.find((l) => l.id === v)?.nom ?? 'nouveau lieu'}`);
              }}
            />
            <div className="flex gap-2">
              <CategorieSelect
                categories={data.categories}
                value=""
                emptyLabel="🗂️ Classer dans…"
                className="min-w-0 flex-1"
                onChange={(v) => v && apply({ categorie_id: v }, `classé(s) dans : ${data.categories.find((c) => c.id === v)?.nom ?? 'nouvelle catégorie'}`)}
              />
              <select
                className="min-w-0 flex-1"
                value=""
                aria-label="Changer le type"
                onChange={(e) => e.target.value && apply({ type: e.target.value, cumul_quantites: defaultCumul(e.target.value) }, 'changé(s) de type')}
              >
                <option value="">Type…</option>
                {TYPE_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <Button onClick={autoClassify} disabled={!n} className="text-sm">
                ✨ Auto
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
