import { useMemo, useState } from 'react';
import { useData } from '../data.js';
import { STATUTS, TYPES, TYPE_ICON } from '../../shared/schema.js';
import { findSameName, matchesSearch, similarity, STRONG } from '../../shared/match.js';
import { Button, Empty, Icon, Segmented, TextField, TYPE_OPTIONS } from '../components/ui.jsx';
import { BulkBar } from '../components/BulkBar.jsx';
import { TacheEditor } from './TacheEditor.jsx';
import { ArticleCreator } from '../components/ArticleCreator.jsx';
import { ArticleEditor } from './ArticleEditor.jsx';
import * as A from '../actions.js';
import { logout } from '../db.js';
import { csvCatalogue, csvTout, download, jsonBackup, loadingListText, shareText } from '../export.js';

const PAGES = [
  ['deplacements', 'Déplacements', 'calendar'],
  ['modeles', 'Tâches types', 'tasks'],
  ['catalogue', "Catalogue d'articles", 'box'],
  ['lieux', 'Lieux de stockage', 'pin'],
  ['categories', "Catégories d'articles", 'edit'],
  ['appartements', 'Appartements / sites', 'home'],
  ['fusion', 'Fusionner des doublons', 'merge'],
  ['export', 'Exporter / sauvegarder', 'download'],
];

export function PlusView({ theme, setTheme }) {
  const [page, setPage] = useState(null);
  const { user } = useData();
  if (page) {
    const title = PAGES.find((p) => p[0] === page)[1];
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setPage(null)} className="flex min-h-11 items-center gap-1 font-medium text-sky-700 dark:text-sky-400">
          <Icon name="back" /> Retour
        </button>
        <h1 className="text-2xl font-bold">{title}</h1>
        {page === 'deplacements' && <Deplacements />}
        {page === 'catalogue' && <Catalogue />}
        {page === 'lieux' && <NamedList table="lieux" usedBy="articles" field="lieu_id" />}
        {page === 'categories' && <NamedList table="categories" usedBy="articles" field="categorie_id" />}
        {page === 'modeles' && <Modeles />}
        {page === 'appartements' && <NamedList table="appartements" usedBy="taches" field="appartement_id" />}
        {page === 'fusion' && <Fusion />}
        {page === 'export' && <Export />}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <ul className="overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-slate-900">
        {PAGES.map(([id, label, icon]) => (
          <li key={id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
            <button type="button" onClick={() => setPage(id)} className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-lg active:bg-slate-100 dark:active:bg-slate-800">
              <Icon name={icon} className="size-6 text-sky-600" />
              <span className="flex-1">{label}</span>
              <Icon name="chevron" className="size-5 text-slate-400" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
        <span className="font-medium">Thème</span>
        <Segmented options={[['light', '☀️ Clair'], ['dark', '🌙 Sombre']]} value={theme} onChange={setTheme} />
      </div>
      <div className="rounded-2xl bg-white p-3 text-sm shadow-sm dark:bg-slate-900">
        <p className="mb-2 text-slate-500">Connecté : {user?.email}</p>
        <Button icon="logout" className="w-full" onClick={() => confirm('Se déconnecter ? Les données locales seront effacées de cet appareil.') && logout()}>
          Se déconnecter
        </Button>
      </div>
    </div>
  );
}

function Deplacements() {
  const { data, depId, setDepId } = useData();
  const [nom, setNom] = useState('');
  const [date, setDate] = useState('');
  const create = async () => {
    if (!nom.trim()) return;
    const id = await A.createDeplacement(nom.trim(), date);
    setNom('');
    setDate('');
    setDepId(id);
  };
  const dup = async (d) => {
    const n = prompt('Nom du nouveau déplacement :', `${d.nom} (copie)`);
    if (!n?.trim()) return;
    const id = await A.duplicate(d.id, data, { nom: n.trim(), date_debut: null });
    setDepId(id);
  };
  const del = async (d) => {
    const nb = data.taches.filter((t) => t.deplacement_id === d.id).length;
    if (!confirm(`Supprimer « ${d.nom} » et ses ${nb} tâche(s) ? Le catalogue d'articles est conservé.`)) return;
    const ids = new Set(data.taches.filter((t) => t.deplacement_id === d.id).map((t) => t.id));
    for (const t of data.taches.filter((x) => ids.has(x.id))) await A.deleteTache(t, data.tache_articles.filter((l) => l.tache_id === t.id));
    await A.remove('deplacements', d.id);
    if (depId === d.id) setDepId(data.deplacements.find((x) => x.id !== d.id)?.id ?? null);
  };
  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {data.deplacements.map((d) => {
          const current = d.id === depId;
          return (
            <li key={d.id} className={`rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900 ${current ? 'ring-2 ring-sky-500' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-semibold">{d.nom}</p>
                  <p className="text-sm text-slate-500">
                    {d.date_debut ? new Date(d.date_debut).toLocaleDateString('fr-FR') + ' · ' : ''}
                    {STATUTS[d.statut]} · {data.taches.filter((t) => t.deplacement_id === d.id).length} tâches
                  </p>
                </div>
                {current ? <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-bold text-sky-800 dark:bg-sky-500/20 dark:text-sky-300">Actuel</span> : <Button variant="primary" onClick={() => setDepId(d.id)}>Ouvrir</Button>}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button onClick={() => dup(d)}>Dupliquer</Button>
                {d.statut === 'en_preparation' && <Button onClick={() => A.setStatut(d, 'en_cours')}>Démarrer</Button>}
                {d.statut !== 'termine' ? (
                  <Button onClick={() => A.setStatut(d, 'termine')}>Clôturer</Button>
                ) : (
                  <Button onClick={() => A.setStatut(d, 'en_preparation')}>Rouvrir</Button>
                )}
                <Button variant="ghost" icon="trash" aria-label="Supprimer" className="!text-red-600" onClick={() => del(d)} />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="space-y-2 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
        <p className="font-semibold">Nouveau déplacement (vide)</p>
        <TextField value={nom} onChange={setNom} placeholder="Ex. : Pau, novembre 2026" />
        <input type="date" className="w-full" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date de début" />
        <Button variant="primary" icon="plus" className="w-full" onClick={create} disabled={!nom.trim()}>
          Créer
        </Button>
        <p className="text-sm text-slate-500">Astuce : « Dupliquer » reprend toutes les tâches avec les cases « Pris » remises à zéro.</p>
      </div>
    </div>
  );
}

function Catalogue() {
  const { data } = useData();
  const [q, setQ] = useState('');
  const [type, setType] = useState('tous');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selection, setSelection] = useState(null);
  const lieux = new Map(data.lieux.map((l) => [l.id, l.nom]));
  const cats = new Map(data.categories.map((c) => [c.id, c.nom]));
  const list = data.articles.filter((a) => (type === 'tous' || a.type === type) && matchesSearch(`${a.nom} ${cats.get(a.categorie_id) ?? ''} ${lieux.get(a.lieu_id) ?? ''}`, q));
  const toggleSel = (id) => setSelection((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const exact = q.trim() && findSameName(q, data.articles);
  return (
    <div className="space-y-3">
      <TextField value={q} onChange={(v) => { setQ(v); setCreating(false); }} placeholder="🔍 Rechercher ou ajouter un article" />
      <div className="-mx-4 overflow-x-auto px-4">
        <Segmented options={[['tous', 'Tous'], ...TYPE_OPTIONS]} value={type} onChange={setType} />
      </div>
      <Button className="w-full" variant={selection ? 'primary' : 'secondary'} onClick={() => setSelection(selection ? null : new Set())}>
        {selection ? 'Terminer la sélection' : '☑️ Sélectionner plusieurs articles (lieu, catégorie)'}
      </Button>
      {q.trim() && !exact && !creating && (
        <Button variant="primary" icon="plus" className="w-full" onClick={() => setCreating(true)}>
          Créer « {q.trim()} »
        </Button>
      )}
      {creating && (
        <ArticleCreator
          nom={q}
          articles={data.articles}
          lieux={data.lieux}
          categories={data.categories}
          defaultType={type === 'tous' ? 'materiel' : type}
          onUseExisting={(id) => { setCreating(false); setQ(''); setEditing(data.articles.find((a) => a.id === id)); }}
          onCreated={() => { setCreating(false); setQ(''); }}
          onCancel={() => setCreating(false)}
        />
      )}
      <ul className="divide-y divide-slate-100 rounded-2xl bg-white shadow-sm dark:divide-slate-800 dark:bg-slate-900">
        {list.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => (selection ? toggleSel(a.id) : setEditing(a))}
              className={`flex min-h-12 w-full items-center gap-2 px-3 py-1 text-left ${selection?.has(a.id) ? 'bg-sky-100 dark:bg-sky-500/20' : ''}`}
            >
              {selection && (
                <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg border-2 ${selection.has(a.id) ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                  {selection.has(a.id) && <Icon name="check" strokeWidth={3} />}
                </span>
              )}
              <span>{TYPE_ICON[a.type]}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{a.nom}</span>
                <span className="text-xs text-slate-500">
                  📍 {lieux.get(a.lieu_id) ?? '—'} · 🗂️ {cats.get(a.categorie_id) ?? '—'}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {list.length === 0 && <Empty>Aucun article.</Empty>}
      {selection && <div className="h-44" aria-hidden="true" />}
      {selection && <BulkBar selection={selection} onDone={() => setSelection(null)} onAll={() => setSelection(new Set(list.map((a) => a.id)))} />}
      {editing && <ArticleEditor article={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Lieux ou appartements : ajouter, renommer, supprimer (avec réaffectation si utilisé). */
function NamedList({ table, usedBy, field }) {
  const { data } = useData();
  const [nom, setNom] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [reassign, setReassign] = useState('');
  const items = data[table];
  const count = (id) => data[usedBy].filter((x) => x[field] === id).length;
  const what = usedBy === 'articles' ? 'article(s)' : 'tâche(s)';

  const add = async () => {
    if (!nom.trim() || findSameName(nom, items)) return;
    await A.createNamed(table, nom);
    setNom('');
  };
  const doRename = async () => {
    if (renaming.nom.trim() && !findSameName(renaming.nom, items.filter((i) => i.id !== renaming.id))) await A.renameNamed(table, renaming.id, renaming.nom);
    setRenaming(null);
  };
  const doDelete = async (item) => {
    const n = count(item.id);
    if (n === 0) {
      if (confirm(`Supprimer « ${item.nom} » ?`)) await A.deleteNamed(table, item.id, data);
      return;
    }
    setDeleting(item);
    setReassign('');
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <TextField className="flex-1" value={nom} onChange={setNom} placeholder="Nouveau nom" />
        <Button variant="primary" icon="plus" aria-label="Ajouter" onClick={add} disabled={!nom.trim() || !!findSameName(nom, items)} />
      </div>
      {nom.trim() && findSameName(nom, items) && <p className="text-sm text-amber-700">« {findSameName(nom, items).nom} » existe déjà.</p>}
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id} className="rounded-2xl bg-white p-2 shadow-sm dark:bg-slate-900">
            {renaming?.id === it.id ? (
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); doRename(); }}>
                <input className="min-w-0 flex-1" autoFocus value={renaming.nom} onChange={(e) => setRenaming({ ...renaming, nom: e.target.value })} />
                <Button type="submit" variant="primary" icon="check" aria-label="Valider" />
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <span className="flex-1 pl-2">
                  <span className="font-medium">{it.nom}</span> <span className="text-sm text-slate-500">· {count(it.id)} {what}</span>
                </span>
                <Button variant="ghost" icon="edit" aria-label="Renommer" onClick={() => setRenaming({ id: it.id, nom: it.nom })} />
                <Button variant="ghost" icon="trash" aria-label="Supprimer" className="!text-red-600" onClick={() => doDelete(it)} />
              </div>
            )}
            {deleting?.id === it.id && (
              <div className="mt-2 space-y-2 rounded-xl bg-amber-50 p-3 dark:bg-amber-500/10">
                <p className="text-sm">
                  « {it.nom} » est utilisé par {count(it.id)} {what}. Les réaffecter à :
                </p>
                <select className="w-full" value={reassign} onChange={(e) => setReassign(e.target.value)}>
                  <option value="">(aucun)</option>
                  {items.filter((x) => x.id !== it.id).map((x) => (
                    <option key={x.id} value={x.id}>{x.nom}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <Button variant="danger" className="flex-1" onClick={async () => { await A.deleteNamed(table, it.id, data, reassign || null); setDeleting(null); }}>
                    Réaffecter et supprimer
                  </Button>
                  <Button variant="ghost" onClick={() => setDeleting(null)}>Annuler</Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Modeles() {
  const { data } = useData();
  const [editing, setEditing] = useState(null); // id | 'new'
  const tache = editing && editing !== 'new' ? data.taches.find((t) => t.id === editing) : null;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Une tâche type regroupe des articles que tu réutilises souvent. Dans Tâches, le bouton + te la propose. Tu peux aussi enregistrer n'importe quelle tâche comme tâche type depuis sa fiche.
      </p>
      <ul className="space-y-2">
        {data.modeles.map((m) => {
          const links = data.tache_articles.filter((l) => l.tache_id === m.id);
          const noms = links.map((l) => data.articles.find((a) => a.id === l.article_id)?.nom).filter(Boolean);
          return (
            <li key={m.id}>
              <button type="button" onClick={() => setEditing(m.id)} className="w-full rounded-2xl bg-white p-3 text-left shadow-sm dark:bg-slate-900">
                <span className="block text-lg font-semibold">📋 {m.titre}</span>
                <span className="text-sm text-slate-500">{noms.join(', ') || 'Aucun article'}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {data.modeles.length === 0 && <Empty>Aucune tâche type pour l'instant.</Empty>}
      <Button variant="primary" icon="plus" className="w-full" onClick={() => setEditing('new')}>
        Nouvelle tâche type
      </Button>
      {(editing === 'new' || tache) && <TacheEditor key={editing} tache={tache} modele onClose={() => setEditing(null)} />}
    </div>
  );
}

function Fusion() {
  const { data } = useData();
  const [keep, setKeep] = useState('');
  const [drop, setDrop] = useState('');
  const [msg, setMsg] = useState('');
  const pairs = useMemo(() => {
    const out = [];
    const arts = data.articles;
    for (let i = 0; i < arts.length; i++)
      for (let j = i + 1; j < arts.length; j++) {
        const s = similarity(arts[i].nom, arts[j].nom);
        if (s >= STRONG) out.push([arts[i], arts[j], s]);
      }
    return out.sort((a, b) => b[2] - a[2]).slice(0, 10);
  }, [data.articles]);
  const usage = (id) => data.tache_articles.filter((l) => l.article_id === id).length;
  const nom = (id) => data.articles.find((a) => a.id === id)?.nom;

  const doMerge = async () => {
    if (!keep || !drop || keep === drop) return;
    if (!confirm(`Conserver « ${nom(keep)} » et y reporter tout ce qui concerne « ${nom(drop)} » (qui sera supprimé) ?`)) return;
    await A.merge(keep, drop, data);
    setMsg(`« ${nom(drop)} » a été fusionné dans « ${nom(keep)} ».`);
    setKeep('');
    setDrop('');
  };

  const select = (value, onChange, label) => (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400">{label}</span>
      <select className="w-full" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choisir…</option>
        {data.articles.map((a) => (
          <option key={a.id} value={a.id}>
            {TYPE_ICON[a.type]} {a.nom} ({TYPES[a.type]}, {usage(a.id)} tâche·s)
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-4">
      {msg && <p className="rounded-xl bg-emerald-100 p-3 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200">{msg}</p>}
      {pairs.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Doublons probables</h2>
          {pairs.map(([a, b]) => (
            <div key={a.id + b.id} className="flex items-center gap-2 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
              <span className="flex-1">{a.nom} ≈ {b.nom}</span>
              <Button onClick={() => { setKeep(a.id); setDrop(b.id); setMsg(''); }}>Choisir</Button>
            </div>
          ))}
        </section>
      )}
      <section className="space-y-3 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
        {select(keep, setKeep, 'Article à conserver')}
        {select(drop, setDrop, 'Article en double (sera supprimé)')}
        {keep && drop && keep !== drop && (
          <Button variant="ghost" onClick={() => { setKeep(drop); setDrop(keep); }}>⇅ Inverser</Button>
        )}
        <Button variant="primary" icon="merge" className="w-full" disabled={!keep || !drop || keep === drop} onClick={doMerge}>
          Fusionner
        </Button>
      </section>
    </div>
  );
}

function Export() {
  const { data, trip, dep } = useData();
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-3">
      <section className="space-y-2 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
        <h2 className="font-semibold">Liste de chargement – {dep?.nom}</h2>
        <Button icon="share" className="w-full" onClick={() => shareText(loadingListText(dep, trip, data.lieux))}>
          Partager le reste à charger (WhatsApp…)
        </Button>
        <Button icon="share" className="w-full" onClick={() => shareText(loadingListText(dep, trip, data.lieux, { onlyMissing: false }))}>
          Partager la liste complète
        </Button>
        <Button icon="download" className="w-full" onClick={() => window.print()}>
          PDF / Imprimer
        </Button>
      </section>
      <section className="space-y-2 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
        <h2 className="font-semibold">Toutes les données</h2>
        <Button icon="download" className="w-full" onClick={() => download(`deplacements-taches-${stamp}.csv`, csvTout(data))}>
          CSV : tâches et articles
        </Button>
        <Button icon="download" className="w-full" onClick={() => download(`catalogue-${stamp}.csv`, csvCatalogue(data))}>
          CSV : catalogue d'articles
        </Button>
        <Button icon="download" className="w-full" onClick={() => download(`sauvegarde-${stamp}.json`, jsonBackup(data), 'application/json')}>
          Sauvegarde complète (JSON)
        </Button>
        <p className="text-sm text-slate-500">Les données sont aussi conservées dans ta base Supabase et sur chaque appareil connecté.</p>
      </section>
    </div>
  );
}
