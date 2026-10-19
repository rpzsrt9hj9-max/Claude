import { useMemo, useState } from 'react';
import { useData } from '../data.js';
import { findSameName, findSimilar, matchesSearch } from '../../shared/match.js';
import { defaultCumul, TYPE_ICON } from '../../shared/schema.js';
import { batteriesCompatibles, estBatterie, estChargeur, tension } from '../../shared/accessoires.js';
import { quantiteStock } from '../../shared/achats.js';
import { Button, CategorieSelect, Icon, LieuSelect, Segmented, Sheet, Stepper, TextField, TYPE_OPTIONS } from '../components/ui.jsx';
import { ArticleCreator } from '../components/ArticleCreator.jsx';
import { deleteArticle, duplicateArticle, rangerArticles, removeAccessoire, retirerContenuKit, setAccessoire, setContenuKit, setStock, updateArticle } from '../actions.js';
import { MODES_CAISSE } from '../../shared/caisses.js';

/** Fiche d'un article du catalogue. */
export function ArticleEditor({ article, onClose, onOpen }) {
  const { data } = useData();
  const stockInitial = quantiteStock(article.id, data.stocks);
  const [f, setF] = useState({
    nom: article.nom,
    type: article.type,
    lieu_id: article.lieu_id ?? null,
    categorie_id: article.categorie_id ?? null,
    unite: article.unite ?? '',
    notes: article.notes ?? '',
    cumul_quantites: !!article.cumul_quantites,
    a_acheter: !!article.a_acheter,
    kit: !!article.kit,
    caisse_mode: article.caisse_mode || 'auto',
  });
  const [stock, setStockSaisi] = useState(stockInitial == null ? '' : String(stockInitial));
  const [copie, setCopie] = useState(null);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const clash = f.nom.trim() && findSameName(f.nom, data.articles.filter((a) => a.id !== article.id));
  const usages = data.tache_articles.filter((l) => l.article_id === article.id).length;

  const save = async () => {
    // Changement de lieu : la quantité en stock suit (et « acheté » disparaît une fois rangé).
    if ((f.lieu_id ?? null) !== (article.lieu_id ?? null)) await rangerArticles([article.id], f.lieu_id, data);
    const { lieu_id: _l, ...reste } = f;
    await updateArticle(article.id, { ...reste, caisse_mode: f.caisse_mode === 'auto' ? null : f.caisse_mode, nom: f.nom.trim(), unite: f.unite.trim() || null, notes: f.notes.trim() || null, ...(f.a_acheter ? { achete_le: null } : {}) });
    const q = stock.trim() === '' ? null : Number(stock.replace(',', '.'));
    if ((q ?? null) !== (stockInitial ?? null) && (q == null || Number.isFinite(q))) await setStock({ ...article, lieu_id: f.lieu_id }, q, data);
    onClose();
  };
  const del = async () => {
    if (!confirm(`Supprimer « ${article.nom} » du catalogue${usages ? ` et des ${usages} tâche(s) qui l'utilisent` : ''} ?`)) return;
    await deleteArticle(article, data);
    onClose();
  };
  const dupliquer = async () => {
    const id = await duplicateArticle({ ...article, ...f }, data);
    setCopie(id);
    if (onOpen) onOpen(id);
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
        <div className="-mx-4 overflow-x-auto px-4">
          <Segmented options={TYPE_OPTIONS} value={f.type} onChange={(type) => setF((x) => ({ ...x, type, cumul_quantites: defaultCumul(type) }))} />
        </div>
        <label className="flex min-h-11 items-center gap-3 rounded-xl bg-amber-50 p-3 dark:bg-amber-500/10">
          <input type="checkbox" className="size-6 !min-h-0" checked={f.a_acheter} onChange={(e) => set('a_acheter')(e.target.checked)} />
          <span>
            <span className="block font-medium">🛒 À acheter</span>
            <span className="text-sm text-slate-500">Apparaît dans les achats et la pastille du catalogue</span>
          </span>
        </label>
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
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className={label}>Quantité en stock</span>
            <input className="w-full" inputMode="decimal" placeholder="—" value={stock} onChange={(e) => setStockSaisi(e.target.value)} />
          </label>
          <label className="block">
            <span className={label}>Unité (pièce, m, L…)</span>
            <input className="w-full" value={f.unite} onChange={(e) => set('unite')(e.target.value)} />
          </label>
        </div>
        {!estBatterie({ nom: f.nom }) && (
          <label className="flex min-h-11 items-center gap-3 rounded-xl bg-white p-3 dark:bg-slate-900">
            <input type="checkbox" className="size-6 !min-h-0" checked={f.cumul_quantites} onChange={(e) => set('cumul_quantites')(e.target.checked)} />
            <span>
              <span className="block font-medium">Additionner les quantités des tâches</span>
              <span className="text-sm text-slate-500">{f.cumul_quantites ? 'Ex. : 1 vis + 1 vis = 2 vis' : 'Maximum des tâches (un seul pour plusieurs tâches)'}</span>
            </span>
          </label>
        )}
        {estBatterie({ nom: f.nom }) && <p className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">🔋 Batterie : une par outil qui la propose, dans chaque déplacement.</p>}
        {estChargeur({ nom: f.nom }) && <p className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">🔌 Chargeur : jamais proposé automatiquement, à ajouter à la main dans une tâche si besoin.</p>}

        <label className="flex min-h-11 items-center gap-3 rounded-xl bg-white p-3 dark:bg-slate-900">
          <input type="checkbox" className="size-6 !min-h-0" checked={f.kit} onChange={(e) => set('kit')(e.target.checked)} />
          <span>
            <span className="block font-medium">📦 C'est un basique (caisse à vérifier)</span>
            <span className="text-sm text-slate-500">Une seule ligne dans la tâche ; son contenu se coche au chargement</span>
          </span>
        </label>
        {f.kit && <ContenuKit kit={article} />}

        <label className="block">
          <span className={label}>Caisse dans un déplacement à plusieurs biens</span>
          <select className="w-full" value={f.caisse_mode} onChange={(e) => set('caisse_mode')(e.target.value)}>
            {MODES_CAISSE.map(([v, l]) => (
              <option key={v} value={v}>
                {v === 'auto' ? `Automatique (${f.type === 'materiel' && !f.kit ? 'réparti par bien' : 'en commun'})` : l}
              </option>
            ))}
          </select>
        </label>

        <ItemsAProposer article={article} nomActuel={f.nom} typeActuel={f.type} />

        <label className="block">
          <span className={label}>Notes</span>
          <TextField multiline value={f.notes} onChange={set('notes')} />
        </label>
        <p className="text-sm text-slate-500">Utilisé dans {usages} tâche(s), tous déplacements et tâches types confondus.</p>
        <Button icon="plus" className="w-full" onClick={dupliquer}>
          Dupliquer l'article
        </Button>
        {copie && !onOpen && <p className="rounded-xl bg-emerald-100 p-2 text-sm text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200">Copie créée : « {f.nom} (copie) », avec ses items à proposer.</p>}
        <Button variant="ghost" icon="trash" className="w-full !text-red-600" onClick={del}>
          Supprimer l'article
        </Button>
      </div>
    </Sheet>
  );
}

/**
 * Items proposés automatiquement quand on ajoute cet article à une tâche (tout type : peinture -> rouleau, bâche ;
 * outil -> batterie). La liste reste ouverte pour en ajouter plusieurs d'affilée.
 */
function ItemsAProposer({ article, nomActuel, typeActuel }) {
  const { data } = useData();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const links = data.article_accessoires.filter((x) => x.article_id === article.id);
  const byId = useMemo(() => new Map(data.articles.map((a) => [a.id, a])), [data.articles]);
  const have = new Set([article.id, ...links.map((l) => l.accessoire_id)]);
  const results = q.trim()
    ? [...new Set([...data.articles.filter((a) => matchesSearch(a.nom, q)), ...findSimilar(q, data.articles, 4).map((m) => m.article)])].filter((a) => a.id !== article.id).slice(0, 8)
    : [];
  const add = async (id) => {
    if (!have.has(id)) await setAccessoire(article.id, id, 1);
    setCreating(false);
  };

  // Batteries compatibles (même tension, même marque pré-cochée) pour un outil
  const compatibles = typeActuel === 'outillage' ? batteriesCompatibles({ id: article.id, nom: nomActuel }, data.articles).filter((c) => !have.has(c.article.id)) : [];
  const [coches, setCoches] = useState(null);
  const cochees = coches ?? new Set(compatibles.filter((c) => c.marque).map((c) => c.article.id));

  return (
    <section className="space-y-2 rounded-2xl bg-violet-50 p-3 dark:bg-violet-500/10">
      <h3 className="font-semibold">Items à proposer</h3>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Proposés (pré-cochés) quand tu ajoutes « {nomActuel} » à une tâche : batterie, forets, rouleau, bâche… Les chargeurs ne sont jamais proposés automatiquement.
      </p>
      {compatibles.length > 0 && (
        <div className="space-y-1 rounded-xl border-2 border-violet-400 bg-white p-2 dark:bg-slate-900">
          <p className="text-sm font-semibold">🔋 Batteries compatibles ({tension(nomActuel)} V)</p>
          {compatibles.map((c) => (
            <label key={c.article.id} className="flex min-h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5 !min-h-0"
                checked={cochees.has(c.article.id)}
                onChange={() => {
                  const n = new Set(cochees);
                  n.has(c.article.id) ? n.delete(c.article.id) : n.add(c.article.id);
                  setCoches(n);
                }}
              />
              <span className="flex-1">{c.article.nom}</span>
              {c.marque && <span className="text-xs text-violet-700 dark:text-violet-300">même marque</span>}
            </label>
          ))}
          <Button
            variant="primary"
            className="w-full !min-h-10 text-sm"
            disabled={!cochees.size}
            onClick={async () => {
              for (const id of cochees) await setAccessoire(article.id, id, 1);
              setCoches(new Set());
            }}
          >
            Ajouter ({cochees.size})
          </Button>
        </div>
      )}
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
      <TextField value={q} onChange={(v) => { setQ(v); setCreating(false); }} placeholder="🔍 Ajouter un item (tous types)" autoComplete="off" />
      {q.trim() && !creating && (
        <ul className="space-y-1">
          {results.map((a) => {
            const deja = have.has(a.id);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  disabled={deja}
                  onClick={() => add(a.id)}
                  className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left ${deja ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-white dark:bg-slate-900'}`}
                >
                  <Icon name={deja ? 'check' : 'plus'} className="size-5 text-violet-600" /> {TYPE_ICON[a.type]} {a.nom}
                </button>
              </li>
            );
          })}
          {!findSameName(q, data.articles) && (
            <li>
              <button type="button" onClick={() => setCreating(true)} className="flex min-h-11 w-full items-center gap-2 rounded-xl border-2 border-dashed border-violet-500 px-3 text-left font-medium text-violet-700 dark:text-violet-300">
                <Icon name="plus" /> Créer « {q.trim()} »
              </button>
            </li>
          )}
          <li>
            <button type="button" className="min-h-10 text-sm font-medium text-slate-500" onClick={() => setQ('')}>
              Fermer la liste
            </button>
          </li>
        </ul>
      )}
      {creating && (
        <ArticleCreator nom={q} articles={data.articles} lieux={data.lieux} categories={data.categories} defaultType="accessoire" onUseExisting={add} onCreated={add} onCancel={() => setCreating(false)} />
      )}
    </section>
  );
}

/** Contenu d'un basique (kit) : la liste à vérifier quand on prend la caisse. Elle évolue avec le temps. */
function ContenuKit({ kit }) {
  const { data } = useData();
  const [q, setQ] = useState('');
  const contenu = (data.kit_contenus || [])
    .filter((k) => k.kit_id === kit.id)
    .map((k) => ({ lien: k, article: data.articles.find((a) => a.id === k.article_id) }))
    .filter((x) => x.article)
    .sort((a, b) => a.article.nom.localeCompare(b.article.nom, 'fr'));
  const dedans = new Set(contenu.map((x) => x.article.id));
  const resultats = q.trim() ? data.articles.filter((a) => a.id !== kit.id && matchesSearch(a.nom, q)).slice(0, 8) : [];
  return (
    <section className="space-y-2 rounded-2xl bg-sky-50 p-3 dark:bg-sky-500/10">
      <h3 className="font-semibold">📦 Contenu du basique ({contenu.length})</h3>
      <ul className="divide-y divide-slate-200 rounded-xl bg-white dark:divide-slate-800 dark:bg-slate-900">
        {contenu.map(({ lien, article }) => (
          <li key={lien.id} className="flex items-center gap-1.5 py-0.5 pl-2.5">
            <span className="min-w-0 flex-1 truncate text-sm">
              {TYPE_ICON[article.type]} {article.nom}
            </span>
            <Stepper compact value={Number(lien.quantite) || 1} min={0.001} onChange={(v) => setContenuKit(kit.id, article.id, v)} />
            <Button variant="ghost" icon="x" className="!min-h-9 !min-w-9 !px-1.5 text-slate-400" aria-label={`Retirer ${article.nom} du basique`} onClick={() => retirerContenuKit(kit.id, article.id)} />
          </li>
        ))}
        {!contenu.length && <li className="p-2 text-sm text-slate-500">Vide pour l'instant : ajoute ce qu'il y a dans la caisse.</li>}
      </ul>
      <input type="search" className="w-full !min-h-10" placeholder="🔍 Ajouter au basique…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ajouter au basique" />
      {resultats.length > 0 && (
        <ul className="space-y-1">
          {resultats.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                disabled={dedans.has(a.id)}
                onClick={() => setContenuKit(kit.id, a.id, 1)}
                className={`flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm ${dedans.has(a.id) ? 'bg-emerald-50 text-slate-500 dark:bg-emerald-950' : 'bg-white active:bg-sky-100 dark:bg-slate-900'}`}
              >
                {dedans.has(a.id) ? <Icon name="check" className="size-4 text-emerald-600" /> : <Icon name="plus" className="size-4 text-sky-600" />}
                {TYPE_ICON[a.type]} {a.nom}
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="min-h-9 w-full text-center text-sm text-slate-500" onClick={() => setQ('')}>
              Fermer la liste
            </button>
          </li>
        </ul>
      )}
      {q.trim() && !resultats.length && <p className="text-sm text-slate-500">Aucun article de ce nom : crée-le d'abord dans le catalogue.</p>}
    </section>
  );
}
