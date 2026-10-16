import { useMemo, useState } from 'react';
import { useData } from '../data.js';
import { matchesSearch, findSameName, findSimilar } from '../../shared/match.js';
import { accessoiresFor } from '../../shared/ops.js';
import { TYPES, TYPE_ICON, TYPE_ORDER } from '../../shared/schema.js';
import { Button, Icon, Sheet, Stepper, TextField } from '../components/ui.jsx';
import { ArticleCreator } from '../components/ArticleCreator.jsx';
import { saveTache, deleteTache, duplicateTache, saveAsModele } from '../actions.js';

/**
 * Création / édition d'une tâche (ou d'une tâche type si modele = true) avec ses articles.
 */
export function TacheEditor({ tache, modele = !!tache?.modele, defaultAppartementId, onClose, onOpen }) {
  const { data, depId } = useData();
  const existingLinks = useMemo(() => (tache ? data.tache_articles.filter((l) => l.tache_id === tache.id) : []), [data, tache]);
  const [titre, setTitre] = useState(tache?.titre ?? '');
  const [description, setDescription] = useState(tache?.description ?? '');
  const [appartementId, setAppartementId] = useState(tache?.appartement_id ?? defaultAppartementId ?? '');
  const [links, setLinks] = useState(() => existingLinks.map((l) => ({ article_id: l.article_id, quantite: Number(l.quantite) || 1 })));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const draft = () => ({
    id: tache?.id,
    deplacement_id: modele ? null : (tache?.deplacement_id ?? depId),
    modele,
    titre,
    description,
    appartement_id: modele ? null : appartementId,
    links,
  });

  const save = async () => {
    if (!titre.trim()) return;
    setSaving(true);
    const ordre = Math.max(0, ...data.taches.filter((t) => t.deplacement_id === depId).map((t) => t.ordre || 0)) + 1;
    await saveTache(draft(), existingLinks, ordre);
    onClose();
  };

  const del = async () => {
    if (!confirm(`Supprimer ${modele ? 'la tâche type' : 'la tâche'} « ${tache.titre} » ?`)) return;
    await deleteTache(tache, existingLinks);
    onClose();
  };

  const duplicate = async () => {
    // On enregistre d'abord les modifications en cours, puis on ouvre la copie.
    await saveTache(draft(), existingLinks, tache.ordre ?? 0);
    const id = await duplicateTache({ ...tache, ...draft(), ordre: tache.ordre }, links);
    onOpen?.(id);
  };

  const asModele = async () => {
    const t = titre.trim();
    if (!t) return;
    if (findSameName(t, data.modeles.map((m) => ({ nom: m.titre }))) && !confirm(`Une tâche type « ${t} » existe déjà. En créer une autre ?`)) return;
    await saveAsModele({ titre: t, description }, links);
    setMessage(`Tâche type « ${t} » enregistrée. Tu la retrouves avec le bouton + des tâches.`);
  };

  return (
    <Sheet
      title={modele ? (tache ? 'Modifier la tâche type' : 'Nouvelle tâche type') : tache ? 'Modifier la tâche' : 'Nouvelle tâche'}
      onClose={onClose}
      footer={
        <Button variant="primary" className="w-full text-lg" icon="check" onClick={save} disabled={!titre.trim() || saving}>
          Enregistrer
        </Button>
      }
    >
      <div className="space-y-4">
        {modele && <p className="rounded-xl bg-violet-100 p-2 text-sm text-violet-900 dark:bg-violet-500/20 dark:text-violet-200">Tâche type : un modèle réutilisable, qui n'apparaît dans aucun déplacement.</p>}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400">Titre</span>
          <TextField value={titre} onChange={setTitre} placeholder="Ex. : Fixer le cadre" autoFocus={!tache} />
        </label>
        {!modele && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400">Appartement</span>
            <select className="w-full" value={appartementId ?? ''} onChange={(e) => setAppartementId(e.target.value)}>
              <option value="">—</option>
              {data.appartements.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nom}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400">Description</span>
          <TextField multiline value={description} onChange={setDescription} placeholder="Facultatif" />
        </label>

        <ArticlePicker links={links} setLinks={setLinks} />

        {message && <p className="rounded-xl bg-emerald-100 p-3 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200">{message}</p>}

        <div className="grid grid-cols-2 gap-2">
          {tache && !modele && (
            <Button icon="plus" onClick={duplicate}>
              Dupliquer
            </Button>
          )}
          {!modele && (
            <Button icon="download" onClick={asModele} disabled={!titre.trim()} className={tache ? '' : 'col-span-2'}>
              Enregistrer comme tâche type
            </Button>
          )}
        </div>
        {tache && (
          <Button variant="ghost" icon="trash" className="w-full !text-red-600" onClick={del}>
            {modele ? 'Supprimer la tâche type' : 'Supprimer la tâche'}
          </Button>
        )}
      </div>
    </Sheet>
  );
}

function ArticlePicker({ links, setLinks }) {
  const { data } = useData();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [proposal, setProposal] = useState(null); // { parent, items: [{ article, quantite, checked }] }
  const articleById = useMemo(() => new Map(data.articles.map((a) => [a.id, a])), [data.articles]);
  const linked = new Set(links.map((l) => l.article_id));

  const results = useMemo(() => {
    if (!q.trim()) return [];
    const direct = data.articles.filter((a) => matchesSearch(a.nom, q));
    const fuzzy = findSimilar(q, data.articles, 5).map((m) => m.article);
    return [...new Set([...direct, ...fuzzy])].filter((a) => !linked.has(a.id)).slice(0, 8);
  }, [q, data.articles, links]); // eslint-disable-line react-hooks/exhaustive-deps
  const exact = q.trim() && findSameName(q, data.articles);

  const add = (id) => {
    const already = new Set([...linked, id]);
    setLinks((ls) => (ls.some((l) => l.article_id === id) ? ls : [...ls, { article_id: id, quantite: 1 }]));
    setQ('');
    setCreating(false);
    // Accessoires à proposer (pré-cochés)
    const acc = accessoiresFor(id, data, already);
    setProposal(acc.length ? { parent: articleById.get(id), items: acc.map((a) => ({ ...a, checked: true })) } : null);
  };
  const addAccessoires = () => {
    const chosen = proposal.items.filter((i) => i.checked);
    setLinks((ls) => {
      const have = new Set(ls.map((l) => l.article_id));
      return [...ls, ...chosen.filter((i) => !have.has(i.article.id)).map((i) => ({ article_id: i.article.id, quantite: i.quantite }))];
    });
    setProposal(null);
  };
  const setQty = (id, quantite) => setLinks((ls) => ls.map((l) => (l.article_id === id ? { ...l, quantite } : l)));
  const removeLink = (id) => setLinks((ls) => ls.filter((l) => l.article_id !== id));

  const byType = useMemo(() => {
    const g = Object.fromEntries(TYPE_ORDER.map((t) => [t, []]));
    for (const l of links) {
      const a = articleById.get(l.article_id);
      if (a) (g[a.type] ?? g.materiel).push({ link: l, article: a });
    }
    for (const t of TYPE_ORDER) g[t].sort((x, y) => x.article.nom.localeCompare(y.article.nom, 'fr'));
    return g;
  }, [links, articleById]);

  return (
    <section className="space-y-3">
      {TYPE_ORDER.map((type) =>
        byType[type].length ? (
          <div key={type}>
            <h3 className="mb-1 font-semibold">
              {TYPE_ICON[type]} {TYPES[type]} <span className="text-sm font-normal text-slate-500">({byType[type].length})</span>
            </h3>
            <ul className="divide-y divide-slate-200 rounded-2xl bg-white dark:divide-slate-800 dark:bg-slate-900">
              {byType[type].map(({ link: l, article: a }) => (
                <li key={l.article_id} className="flex items-center gap-2 p-2">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium break-words">{a.nom}</span>
                    {a.unite && <span className="text-xs text-slate-500">en {a.unite}</span>}
                  </span>
                  <Stepper value={l.quantite} min={0.001} onChange={(v) => setQty(a.id, v)} />
                  <Button variant="ghost" icon="x" className="!px-2" aria-label={`Retirer ${a.nom}`} onClick={() => removeLink(a.id)} />
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
      {links.length === 0 && <p className="text-sm text-slate-500">Aucun article pour l'instant.</p>}

      {proposal && (
        <div className="space-y-2 rounded-2xl border-2 border-violet-500 bg-violet-50 p-3 dark:bg-violet-500/10">
          <p className="font-semibold">Prendre aussi avec « {proposal.parent.nom} » ?</p>
          {proposal.items.map((it, i) => (
            <label key={it.article.id} className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                className="size-6 !min-h-0"
                checked={it.checked}
                onChange={(e) => setProposal((p) => ({ ...p, items: p.items.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x)) }))}
              />
              <span className="flex-1">
                {TYPE_ICON[it.article.type]} {it.article.nom}
              </span>
              <span className="text-sm text-slate-500">× {it.quantite}</span>
            </label>
          ))}
          <div className="flex gap-2">
            <Button variant="primary" className="flex-1" icon="plus" onClick={addAccessoires} disabled={!proposal.items.some((i) => i.checked)}>
              Ajouter ({proposal.items.filter((i) => i.checked).length})
            </Button>
            <Button variant="ghost" onClick={() => setProposal(null)}>
              Non merci
            </Button>
          </div>
        </div>
      )}

      <TextField
        value={q}
        onChange={(v) => {
          setQ(v);
          setCreating(false);
        }}
        placeholder="🔍 Ajouter un article (rechercher ou créer)"
        aria-label="Rechercher un article"
        autoComplete="off"
      />

      {q.trim() && !creating && (
        <ul className="space-y-1">
          {results.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => add(a.id)} className="flex min-h-12 w-full items-center gap-2 rounded-xl bg-white px-3 text-left active:bg-sky-100 dark:bg-slate-900 dark:active:bg-sky-900">
                <Icon name="plus" className="size-5 text-sky-600" />
                <span className="flex-1 font-medium">{a.nom}</span>
                <span className="text-xs text-slate-500">
                  {TYPE_ICON[a.type]} {data.lieux.find((l) => l.id === a.lieu_id)?.nom ?? ''}
                </span>
              </button>
            </li>
          ))}
          {!exact && (
            <li>
              <button type="button" onClick={() => setCreating(true)} className="flex min-h-12 w-full items-center gap-2 rounded-xl border-2 border-dashed border-sky-500 px-3 text-left font-medium text-sky-700 dark:text-sky-400">
                <Icon name="plus" /> Créer « {q.trim()} »
              </button>
            </li>
          )}
        </ul>
      )}

      {creating && (
        <ArticleCreator
          nom={q}
          articles={data.articles}
          lieux={data.lieux}
          categories={data.categories}
          onUseExisting={add}
          onCreated={add}
          onCancel={() => setCreating(false)}
        />
      )}
    </section>
  );
}
