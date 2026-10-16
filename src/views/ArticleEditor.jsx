import { useMemo, useState } from 'react';
import { useData } from '../data.js';
import { findSameName, findSimilar, matchesSearch } from '../../shared/match.js';
import { defaultCumul, TYPE_ICON } from '../../shared/schema.js';
import { Button, CategorieSelect, Icon, LieuSelect, Segmented, Sheet, Stepper, TextField, TYPE_OPTIONS } from '../components/ui.jsx';
import { ArticleCreator } from '../components/ArticleCreator.jsx';
import { deleteArticle, removeAccessoire, setAccessoire, updateArticle } from '../actions.js';

/** Fiche d'un article du catalogue. */
export function ArticleEditor({ article, onClose }) {
  const { data } = useData();
  const [f, setF] = useState({
    nom: article.nom,
    type: article.type,
    lieu_id: article.lieu_id ?? null,
    categorie_id: article.categorie_id ?? null,
    unite: article.unite ?? '',
    notes: article.notes ?? '',
    cumul_quantites: !!article.cumul_quantites,
  });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const clash = f.nom.trim() && findSameName(f.nom, data.articles.filter((a) => a.id !== article.id));
  const usages = data.tache_articles.filter((l) => l.article_id === article.id).length;

  const save = async () => {
    await updateArticle(article.id, { ...f, nom: f.nom.trim(), unite: f.unite.trim() || null, notes: f.notes.trim() || null });
    onClose();
  };
  const del = async () => {
    if (!confirm(`Supprimer « ${article.nom} » du catalogue${usages ? ` et des ${usages} tâche(s) qui l'utilisent` : ''} ?`)) return;
    await deleteArticle(article, data);
    onClose();
  };

  const label = 'mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400';
  return (
    <Sheet
      title={article.nom}
      onClose={onClose}
      footer={
        <Button variant="primary" className="w-full text-lg" icon="check" disabled={!f.nom.trim() || !!clash} onClick={save}>
          Enregistrer
        </Button>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className={label}>Nom</span>
          <TextField value={f.nom} onChange={set('nom')} />
          {clash && <span className="text-sm text-red-600">« {clash.nom} » existe déjà : utilise plutôt la fusion des doublons.</span>}
        </label>
        <Segmented options={TYPE_OPTIONS} value={f.type} onChange={(type) => setF((x) => ({ ...x, type, cumul_quantites: defaultCumul(type) }))} />
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className={label}>Lieu de stockage</span>
            <LieuSelect lieux={data.lieux} value={f.lieu_id} onChange={set('lieu_id')} className="w-full" />
          </label>
          <label className="block">
            <span className={label}>Catégorie</span>
            <CategorieSelect categories={data.categories} value={f.categorie_id} onChange={set('categorie_id')} className="w-full" />
          </label>
        </div>
        <label className="block">
          <span className={label}>Unité (pièce, m, L, cartouche…)</span>
          <input className="w-full" value={f.unite} onChange={(e) => set('unite')(e.target.value)} />
        </label>
        <label className="flex min-h-11 items-center gap-3 rounded-xl bg-white p-3 dark:bg-slate-900">
          <input type="checkbox" className="size-6 !min-h-0" checked={f.cumul_quantites} onChange={(e) => set('cumul_quantites')(e.target.checked)} />
          <span>
            <span className="block font-medium">Additionner les quantités des tâches</span>
            <span className="text-sm text-slate-500">{f.cumul_quantites ? 'Ex. : 1 vis + 1 vis = 2 vis' : 'Maximum des tâches (un seul outil pour plusieurs tâches)'}</span>
          </span>
        </label>

        <Accessoires article={article} />

        <label className="block">
          <span className={label}>Notes</span>
          <TextField multiline value={f.notes} onChange={set('notes')} />
        </label>
        <p className="text-sm text-slate-500">Utilisé dans {usages} tâche(s), tous déplacements et tâches types confondus.</p>
        <Button variant="ghost" icon="trash" className="w-full !text-red-600" onClick={del}>
          Supprimer l'article
        </Button>
      </div>
    </Sheet>
  );
}

/** Accessoires proposés automatiquement quand on ajoute cet article à une tâche. */
function Accessoires({ article }) {
  const { data } = useData();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const links = data.article_accessoires.filter((x) => x.article_id === article.id);
  const byId = useMemo(() => new Map(data.articles.map((a) => [a.id, a])), [data.articles]);
  const have = new Set([article.id, ...links.map((l) => l.accessoire_id)]);
  const results = q.trim()
    ? [...new Set([...data.articles.filter((a) => matchesSearch(a.nom, q)), ...findSimilar(q, data.articles, 4).map((m) => m.article)])].filter((a) => !have.has(a.id)).slice(0, 6)
    : [];
  const add = async (id) => {
    await setAccessoire(article.id, id, 1);
    setQ('');
    setCreating(false);
  };

  return (
    <section className="space-y-2 rounded-2xl bg-violet-50 p-3 dark:bg-violet-500/10">
      <h3 className="font-semibold">Accessoires à proposer</h3>
      <p className="text-sm text-slate-600 dark:text-slate-400">Proposés (pré-cochés) quand tu ajoutes « {article.nom} » à une tâche. Ex. : disques, batterie, forêts.</p>
      {links.length > 0 && (
        <ul className="divide-y divide-violet-200 rounded-xl bg-white dark:divide-slate-800 dark:bg-slate-900">
          {links.map((l) => {
            const a = byId.get(l.accessoire_id);
            if (!a) return null;
            return (
              <li key={l.id} className="flex items-center gap-2 p-2">
                <span className="min-w-0 flex-1 font-medium">
                  {TYPE_ICON[a.type]} {a.nom}
                </span>
                <Stepper value={Number(l.quantite) || 1} min={0.001} onChange={(v) => setAccessoire(article.id, a.id, v)} />
                <Button variant="ghost" icon="x" className="!px-2" aria-label={`Retirer ${a.nom}`} onClick={() => removeAccessoire(l)} />
              </li>
            );
          })}
        </ul>
      )}
      <TextField value={q} onChange={(v) => { setQ(v); setCreating(false); }} placeholder="🔍 Ajouter un accessoire" autoComplete="off" />
      {q.trim() && !creating && (
        <ul className="space-y-1">
          {results.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => add(a.id)} className="flex min-h-11 w-full items-center gap-2 rounded-xl bg-white px-3 text-left dark:bg-slate-900">
                <Icon name="plus" className="size-5 text-violet-600" /> {TYPE_ICON[a.type]} {a.nom}
              </button>
            </li>
          ))}
          {!findSameName(q, data.articles) && (
            <li>
              <button type="button" onClick={() => setCreating(true)} className="flex min-h-11 w-full items-center gap-2 rounded-xl border-2 border-dashed border-violet-500 px-3 text-left font-medium text-violet-700 dark:text-violet-300">
                <Icon name="plus" /> Créer « {q.trim()} »
              </button>
            </li>
          )}
        </ul>
      )}
      {creating && (
        <ArticleCreator nom={q} articles={data.articles} lieux={data.lieux} categories={data.categories} defaultType="consommable" onUseExisting={add} onCreated={add} onCancel={() => setCreating(false)} />
      )}
    </section>
  );
}
