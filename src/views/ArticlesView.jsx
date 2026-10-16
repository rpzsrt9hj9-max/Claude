import { useState } from 'react';
import { useData, useLocalState } from '../data.js';
import { groupBy, formatQty } from '../../shared/calc.js';
import { TYPES } from '../../shared/schema.js';
import { BigCheck, Empty, Icon, LieuSelect, ProgressBar, Segmented, Stepper } from '../components/ui.jsx';
import { BulkBar } from '../components/BulkBar.jsx';
import { setPrise, togglePris, updateArticle } from '../actions.js';
import { ArticleEditor } from './ArticleEditor.jsx';

const LABELS = { materiel: 'articles pris', outillage: 'outils pris', consommable: 'consommables pris' };

/** Onglet Matériel, Outillage ou Consommables : ce qu'il faut emporter, où le trouver, case « Pris ». */
export function ArticlesView({ type }) {
  const { data, trip } = useData();
  const [mode, setMode] = useLocalState('articles-mode', 'lieu');
  const [cacherPris, setCacherPris] = useLocalState('cacher-pris', false);
  const [editing, setEditing] = useState(null);
  const [selection, setSelection] = useState(null); // Set d'ids en mode sélection, sinon null
  const items = trip.items.filter((i) => i.article.type === type);
  const shown = cacherPris ? items.filter((i) => !i.status.complet) : items;
  const progress = trip.progress[type];

  const toggleSel = (id) =>
    setSelection((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const rowProps = (i) => ({
    item: i,
    onEdit: () => setEditing(i.article),
    selected: selection ? selection.has(i.article.id) : undefined,
    onSelect: selection ? () => toggleSel(i.article.id) : undefined,
  });

  const groups = mode === 'liste' ? [{ ref: null, items: shown, flat: true }] : groupBy(shown, mode === 'lieu' ? data.lieux : data.categories, mode === 'lieu' ? 'lieu_id' : 'categorie_id');

  return (
    <div className="space-y-4">
      <ProgressBar done={progress.done} total={progress.total} label={LABELS[type]} />
      <div className="flex flex-wrap items-center gap-2">
        <Segmented options={[['lieu', '📍 Lieu'], ['categorie', '🗂️ Catégorie'], ['liste', 'Liste']]} value={mode} onChange={setMode} />
        <button type="button" onClick={() => setCacherPris(!cacherPris)} className={`min-h-11 rounded-full px-4 text-sm ${cacherPris ? 'bg-slate-700 text-white' : 'bg-white text-slate-500 shadow-sm dark:bg-slate-900'}`}>
          {cacherPris ? 'Pris masqués' : 'Masquer pris'}
        </button>
        <button
          type="button"
          onClick={() => setSelection(selection ? null : new Set())}
          className={`min-h-11 rounded-full px-4 text-sm ${selection ? 'bg-sky-600 text-white' : 'bg-white text-slate-500 shadow-sm dark:bg-slate-900'}`}
        >
          {selection ? 'Terminer' : 'Sélectionner'}
        </button>
      </div>

      {items.length === 0 && <Empty>Aucun article de type « {TYPES[type]} » pour ce déplacement. Ajoute des articles dans les tâches.</Empty>}

      {groups.map((g) => (
        <section key={g.ref?.id ?? 'none'}>
          {!g.flat && (
            <h2 className="mb-2 flex items-center gap-2 font-bold text-slate-600 dark:text-slate-300">
              {mode === 'lieu' ? <Icon name="pin" className="size-5 text-sky-600" /> : <span>🗂️</span>}
              {g.ref ? (mode === 'lieu' ? `À prendre : ${g.ref.nom}` : g.ref.nom) : mode === 'lieu' ? 'Lieu non renseigné' : 'Sans catégorie'}
              <span className="text-sm font-normal text-slate-500">
                ({g.items.filter((i) => i.status.complet).length}/{g.items.length})
              </span>
              {selection && (
                <button type="button" className="ml-auto text-sm font-medium text-sky-700 dark:text-sky-400" onClick={() => setSelection((s) => new Set([...s, ...g.items.map((i) => i.article.id)]))}>
                  Tout choisir
                </button>
              )}
            </h2>
          )}
          <ul className="space-y-2">
            {g.items.map((i) => (
              <ItemRow key={i.article.id} {...rowProps(i)} />
            ))}
          </ul>
        </section>
      ))}

      {selection && <div className="h-44" aria-hidden="true" />}
      {selection && <BulkBar selection={selection} onDone={() => setSelection(null)} onAll={() => setSelection(new Set(shown.map((i) => i.article.id)))} />}
      {editing && <ArticleEditor article={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function ItemRow({ item, onEdit, compact, selected, onSelect }) {
  const { data, depId } = useData();
  const { article, total, status, usages } = item;
  const multi = total !== 1;
  const selecting = onSelect !== undefined;
  const tone = selecting
    ? selected
      ? 'bg-sky-100 ring-2 ring-sky-500 dark:bg-sky-500/20'
      : 'bg-white dark:bg-slate-900'
    : status.etat === 'complet'
      ? 'bg-emerald-50 dark:bg-emerald-500/10'
      : status.etat === 'partiel'
        ? 'bg-amber-50 dark:bg-amber-500/10'
        : 'bg-white dark:bg-slate-900';
  const lieu = data.lieux.find((l) => l.id === article.lieu_id)?.nom;
  const cat = data.categories.find((c) => c.id === article.categorie_id)?.nom;

  if (selecting) {
    return (
      <li className={`rounded-2xl shadow-sm ${tone}`}>
        <button type="button" onClick={onSelect} className="flex min-h-14 w-full items-center gap-3 p-2 text-left" aria-pressed={selected}>
          <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg border-2 ${selected ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
            {selected && <Icon name="check" strokeWidth={3} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{article.nom}</span>
            <span className="text-sm text-slate-500">
              📍 {lieu ?? '—'} · 🗂️ {cat ?? '—'}
            </span>
          </span>
        </button>
      </li>
    );
  }

  return (
    <li className={`rounded-2xl p-2 shadow-sm ${tone}`}>
      <div className="flex items-start gap-3">
        <BigCheck etat={status.etat} label={status.complet ? `Décocher ${article.nom}` : `${article.nom} pris`} onClick={() => togglePris(depId, item)} />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onEdit} className="block text-left">
            <span className={`text-lg font-semibold ${status.complet ? 'text-emerald-800 dark:text-emerald-300' : ''}`}>{article.nom}</span>{' '}
            <span className="text-lg font-bold text-sky-700 dark:text-sky-400">× {formatQty(total, article.unite)}</span>
          </button>
          {status.etat === 'partiel' && (
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              À compléter : {formatQty(status.taken, null)} pris sur {formatQty(total, null)}
            </p>
          )}
          {!compact && (
            <p className="text-sm text-slate-500">
              {usages.map((u) => `${u.tache.titre} : ${formatQty(u.quantite, null)}`).join(' ; ')}
            </p>
          )}
        </div>
      </div>
      {!compact && (
        <div className="mt-2 flex items-center gap-2">
          <LieuSelect lieux={data.lieux} value={article.lieu_id} onChange={(v) => updateArticle(article.id, { lieu_id: v })} className="min-w-0 flex-1 text-sm" />
          {multi && <Stepper label="Quantité prise" value={status.taken} onChange={(v) => setPrise(depId, item, v)} />}
        </div>
      )}
    </li>
  );
}
