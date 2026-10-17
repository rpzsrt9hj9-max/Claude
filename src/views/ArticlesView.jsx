import { useState } from 'react';
import { useData, useLocalState } from '../data.js';
import { groupBy, formatQty } from '../../shared/calc.js';
import { TYPES, TYPE_ICON, TYPE_ORDER } from '../../shared/schema.js';
import { BigCheck, Button, Empty, Icon, LieuSelect, ProgressBar, Puces, Segmented, Stepper } from '../components/ui.jsx';
import { BulkBar } from '../components/BulkBar.jsx';
import { rangerArticles, setPrise, togglePris } from '../actions.js';
import { useReglages } from '../reglages.js';
import { ArticleEditor } from './ArticleEditor.jsx';

/** Un article « à acheter » ne peut pas être coché « pris » tant qu'il n'est pas acheté (option développeur). */
export const bloqueParAchat = (article, reglages) => reglages.bloquerPrisSiAAcheter && !!article.a_acheter;

/** Onglet « À prendre » : matériel, outillage, consommables et accessoires, où les trouver, case « Pris ». */
export function ArticlesView() {
  const { data, trip } = useData();
  const { dense } = useReglages();
  const [types, setTypes] = useLocalState('a-prendre-types', []);
  const [mode, setMode] = useLocalState('articles-mode', 'lieu');
  const [cacherPris, setCacherPris] = useLocalState('cacher-pris', false);
  const [editing, setEditing] = useState(null);
  const [selection, setSelection] = useState(null); // Set d'ids en mode sélection, sinon null
  const items = trip.items.filter((i) => !types.length || types.includes(i.article.type));
  const shown = cacherPris ? items.filter((i) => !i.status.complet) : items;
  const reste = (type) => trip.items.filter((i) => i.article.type === type && !i.status.complet).length;
  const presents = TYPE_ORDER.filter((t) => trip.items.some((i) => i.article.type === t));

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
  const taille = dense ? 'min-h-8 px-3 text-xs' : 'min-h-10 px-4 text-sm';

  return (
    <div className={dense ? 'space-y-2' : 'space-y-3'}>
      <ProgressBar done={items.filter((i) => i.status.complet).length} total={items.length} label="pris" />
      {presents.length > 1 && (
        <Puces
          dense={dense}
          multiple
          value={types}
          onChange={setTypes}
          options={presents.map((t) => [t, `${TYPE_ICON[t]} ${TYPES[t]}`, reste(t)])}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented options={[['lieu', '📍 Lieu'], ['categorie', '🗂️ Cat.'], ['liste', 'Liste']]} value={mode} onChange={setMode} />
        <button type="button" onClick={() => setCacherPris(!cacherPris)} className={`${taille} rounded-full ${cacherPris ? 'bg-slate-700 text-white' : 'bg-white text-slate-500 shadow-sm dark:bg-slate-900'}`}>
          {cacherPris ? 'Pris masqués' : 'Masquer pris'}
        </button>
        <button
          type="button"
          onClick={() => setSelection(selection ? null : new Set())}
          className={`${taille} rounded-full ${selection ? 'bg-sky-600 text-white' : 'bg-white text-slate-500 shadow-sm dark:bg-slate-900'}`}
        >
          {selection ? 'Terminer' : 'Sélectionner'}
        </button>
      </div>

      {trip.items.length === 0 && <Empty>Rien à prendre pour ce déplacement. Ajoute des articles dans les tâches.</Empty>}

      {groups.map((g) => (
        <section key={g.ref?.id ?? 'none'}>
          {!g.flat && (
            <h2 className="mb-1.5 flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
              {mode === 'lieu' ? <Icon name="pin" className="size-4 text-sky-600" /> : <span>🗂️</span>}
              {g.ref ? g.ref.nom : mode === 'lieu' ? 'Lieu non renseigné' : 'Sans catégorie'}
              <span className="font-normal text-slate-500">
                ({g.items.filter((i) => i.status.complet).length}/{g.items.length})
              </span>
              {selection && (
                <button type="button" className="ml-auto font-medium text-sky-700 dark:text-sky-400" onClick={() => setSelection((s) => new Set([...s, ...g.items.map((i) => i.article.id)]))}>
                  Tout choisir
                </button>
              )}
            </h2>
          )}
          <ul className="space-y-1">
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

/** Ligne d'article sur une seule ligne (~48 px) ; un toucher déplie les détails (tâches, lieu, quantité prise). */
export function ItemRow({ item, onEdit, selected, onSelect, cle, verbe = 'pris' }) {
  const { data, depId: depCtx } = useData();
  const reglages = useReglages();
  const depId = cle ?? depCtx;
  const [ouvert, setOuvert] = useState(false);
  const { article, total, status, usages } = item;
  const multi = total !== 1;
  const selecting = onSelect !== undefined;
  const bloque = verbe === 'pris' && !status.complet && bloqueParAchat(article, reglages);
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
      <li className={`rounded-xl shadow-sm ${tone}`}>
        <button type="button" onClick={onSelect} className="flex min-h-12 w-full items-center gap-3 px-2.5 py-1 text-left" aria-pressed={selected}>
          <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg border-2 ${selected ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
            {selected && <Icon name="check" className="size-5" strokeWidth={3} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{article.nom}</span>
            <span className="block truncate text-xs text-slate-500">
              📍 {lieu ?? '—'} · 🗂️ {cat ?? '—'}
            </span>
          </span>
        </button>
      </li>
    );
  }

  return (
    <li className={`rounded-xl shadow-sm ${tone}`}>
      <div className="flex min-h-12 items-center gap-2 pr-1 pl-2.5">
        <BigCheck
          compact
          etat={status.etat}
          disabled={bloque}
          label={bloque ? `${article.nom} : à acheter d'abord` : status.complet ? `Décocher ${article.nom}` : `${article.nom} ${verbe}`}
          onClick={() => togglePris(depId, item)}
        />
        <button type="button" onClick={() => setOuvert(!ouvert)} aria-expanded={ouvert} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left">
          <span className={`min-w-0 flex-1 truncate font-semibold ${status.complet ? 'text-emerald-800 dark:text-emerald-300' : ''}`}>
            {article.a_acheter && <span title="À acheter">🛒 </span>}
            {article.nom}
          </span>
          {status.etat === 'partiel' && <span className="shrink-0 text-xs font-semibold text-amber-700 dark:text-amber-300">{formatQty(status.taken, null)}/</span>}
          <span className="shrink-0 font-bold text-sky-700 dark:text-sky-400">× {formatQty(total, article.unite)}</span>
          <Icon name="chevron" className={`size-4 shrink-0 text-slate-400 transition-transform ${ouvert ? 'rotate-90' : ''}`} />
        </button>
      </div>
      {ouvert && (
        <div className="space-y-2 border-t border-slate-200/70 px-2.5 pt-2 pb-2.5 dark:border-slate-700/50">
          {bloque && <p className="text-sm font-semibold text-red-700 dark:text-red-300">🛒 À acheter d'abord : coche-le « acheté » dans l'onglet À acheter.</p>}
          <p className="text-sm text-slate-500">{usages.map((u) => `${u.tache.titre} : ${formatQty(u.quantite, null)}`).join(' ; ')}</p>
          <div className="flex items-center gap-2">
            <LieuSelect lieux={data.lieux} value={article.lieu_id} onChange={(v) => rangerArticles([article.id], v, data)} className="min-w-0 flex-1 text-sm" />
            {multi && !bloque && <Stepper label={`Quantité ${verbe}`} value={status.taken} onChange={(v) => setPrise(depId, item, v)} />}
          </div>
          <Button variant="ghost" icon="edit" className="!min-h-9 w-full text-sm" onClick={onEdit}>
            Fiche de l'article
          </Button>
        </div>
      )}
    </li>
  );
}
