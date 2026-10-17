import { useEffect, useMemo, useState } from 'react';
import { SheetView } from './SheetView.jsx';
import { Glissable } from '../components/Glissable.jsx';
import { useData, useLocalState } from '../data.js';
import { TYPES, TYPE_ICON } from '../../shared/schema.js';
import { findSameName, matchesSearch, nameKey, similarity, STRONG } from '../../shared/match.js';
import { Button, Empty, Icon, Segmented, TextField, TYPE_OPTIONS } from '../components/ui.jsx';
import { BulkBar } from '../components/BulkBar.jsx';
import { TacheEditor } from './TacheEditor.jsx';
import { ArticleCreator } from '../components/ArticleCreator.jsx';
import { ArticleEditor } from './ArticleEditor.jsx';
import * as A from '../actions.js';
import { DEMO, actualiserProfil, logout, sync } from '../db.js';
import { changerReglage, useReglages } from '../reglages.js';
import { NOUVEAUTES } from '../nouveautes.js';
import { quantiteStock } from '../../shared/achats.js';
import { CategorieSelect, LieuSelect, Puces, Sheet } from '../components/ui.jsx';
import { observation } from '../supabase.js';
import { VERSION } from '../version.js';
import { FamilleView } from './FamilleView.jsx';
import { ChoixCatalogue, useCatalogue } from './CatalogueImport.jsx';
import { compterRetoursNonLus, envoyerRetour, majPrenom } from '../famille.js';
import { csvCatalogue, csvTout, download, jsonBackup } from '../export.js';

const PAGES = [
  ['modeles', 'Tâches types', 'tasks'],
  ['lieux', 'Lieux de stockage', 'pin'],
  ['categories', "Catégories d'articles", 'edit'],
  ['appartements', 'Biens (appartements, sites)', 'home'],
  ['fusion', 'Fusionner des doublons', 'merge'],
  ['export', 'Exporter / sauvegarder', 'download'],
];

const ETAT_SYNC = {
  ok: 'à jour',
  syncing: 'synchronisation…',
  offline: 'hors ligne : les modifications partiront au retour du réseau',
  error: 'erreur',
  idle: 'en attente',
};

/** Interrupteur simple (réglages). */
function Interrupteur({ titre, detail, valeur, onChange }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 py-1">
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{titre}</span>
        {detail && <span className="block text-xs text-slate-500">{detail}</span>}
      </span>
      <input type="checkbox" role="switch" className="size-6 shrink-0 !min-h-0" checked={valeur} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function PlusView({ theme, setTheme }) {
  const [page, setPage] = useState(null);
  const { user, sync: etat } = useData();
  const reglages = useReglages();
  const admin = !!user?.admin;
  const [nonLus, setNonLus] = useState(0);
  useEffect(() => {
    if (admin && !observation) compterRetoursNonLus().then(setNonLus).catch(() => {});
  }, [admin]);
  // Entrées propres à chaque situation : l'administrateur gère la famille, les autres reprennent le catalogue partagé.
  const pages = [
    ...(admin && !observation ? [['famille', 'Famille et retours', 'users']] : []),
    ...PAGES,
    ...(!admin && !observation ? [['importer', 'Reprendre du catalogue partagé', 'download']] : []),
    ...(!observation && !DEMO ? [['sheet', 'Google Sheet du catalogue', 'share']] : []),
    ...(!observation ? [['retour', 'Envoyer un retour', 'send']] : []),
    ['nouveautes', `Nouveautés (${VERSION})`, 'calendar'],
  ];
  if (page) {
    const title = pages.find((p) => p[0] === page)?.[1] ?? '';
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setPage(null)} className="flex min-h-11 items-center gap-1 font-medium text-sky-700 dark:text-sky-400">
          <Icon name="back" /> Retour
        </button>
        <h1 className="text-2xl font-bold">{title}</h1>
        {page === 'lieux' && <NamedList table="lieux" usedBy="articles" field="lieu_id" />}
        {page === 'categories' && <NamedList table="categories" usedBy="articles" field="categorie_id" />}
        {page === 'modeles' && <Modeles />}
        {page === 'appartements' && <NamedList table="appartements" usedBy="taches" field="appartement_id" />}
        {page === 'fusion' && <Fusion />}
        {page === 'export' && <Export />}
        {page === 'famille' && <FamilleView />}
        {page === 'importer' && <ImporterCatalogue />}
        {page === 'retour' && <Retour />}
        {page === 'sheet' && <SheetView />}
        {page === 'nouveautes' && <Nouveautes />}
      </div>
    );
  }
  const probleme = etat && (etat.status === 'error' || etat.status === 'offline' || etat.pending > 0);
  return (
    <div className="space-y-4">
      <div className={`flex items-center gap-3 rounded-2xl p-3 text-sm shadow-sm ${etat?.status === 'error' ? 'bg-red-50 dark:bg-red-500/10' : probleme ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-white dark:bg-slate-900'}`}>
        <span className={`size-3 shrink-0 rounded-full ${etat?.status === 'error' ? 'bg-red-600' : probleme ? 'bg-amber-500' : 'bg-emerald-500'}`} />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">
            Synchronisation : {ETAT_SYNC[etat?.status] ?? '…'}
            {etat?.pending > 0 && ` · ${etat.pending} modification(s) en attente`}
          </span>
          {etat?.status === 'error' && etat.message && <span className="block text-red-700 dark:text-red-300">{etat.message}</span>}
          {etat?.lastSync && <span className="block text-xs text-slate-500">Dernière synchro : {new Date(etat.lastSync).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>}
        </span>
        <Button variant="ghost" icon="download" className="!px-2" aria-label="Synchroniser maintenant" onClick={() => sync()} />
      </div>

      <ul className="overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-slate-900">
        {pages.map(([id, label, icon]) => (
          <li key={id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
            <button type="button" onClick={() => setPage(id)} className="flex min-h-12 w-full items-center gap-3 px-4 text-left active:bg-slate-100 dark:active:bg-slate-800">
              <Icon name={icon} className="size-5 text-sky-600" />
              <span className="flex-1">{label}</span>
              {id === 'famille' && nonLus > 0 && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{nonLus}</span>}
              <Icon name="chevron" className="size-5 text-slate-400" />
            </button>
          </li>
        ))}
      </ul>

      <section className="space-y-2 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
        <h2 className="font-semibold">Affichage (cet appareil)</h2>
        <div className="flex items-center justify-between gap-2">
          <span>Densité</span>
          <Segmented options={[['standard', 'Standard'], ['dense', 'Dense']]} value={reglages.dense ? 'dense' : 'standard'} onChange={(v) => changerReglage('dense', v === 'dense')} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>Thème</span>
          <Segmented options={[['light', '☀️ Clair'], ['dark', '🌙 Sombre']]} value={theme} onChange={setTheme} />
        </div>
        <Interrupteur titre="Ajout rapide des tâches" detail="Champ de saisie en haut de la liste des tâches" valeur={reglages.ajoutRapide} onChange={(v) => changerReglage('ajoutRapide', v)} />
        <div className="py-2">
          <div className="flex items-center justify-between gap-3">
            <span>Supprimer / retirer</span>
            <Segmented options={[['glisser', '👈 Glisser'], ['croix', '✕ Croix']]} value={reglages.suppression} onChange={(v) => changerReglage('suppression', v)} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {reglages.suppression === 'croix'
              ? 'Croix bleue = retirer (la tâche reste dans la liste), croix rouge = supprimer.'
              : 'Glisser une ligne vers la gauche : à moitié = retirer (bleu), presque jusqu’au bout = supprimer (rouge). Un liseré à droite montre ce qui est possible.'}
          </p>
        </div>
      </section>

      <section className="space-y-1 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
        <h2 className="font-semibold">Options développeur</h2>
        <p className="text-xs text-slate-500">Pour essayer d'autres façons de faire ; réglage propre à cet appareil.</p>
        <Interrupteur
          titre="Bloquer « pris » si à acheter"
          detail="Dans Charger, un article encore à acheter ne peut être coché qu'une fois acheté"
          valeur={reglages.bloquerPrisSiAAcheter}
          onChange={(v) => changerReglage('bloquerPrisSiAAcheter', v)}
        />
        <Interrupteur titre="Filtres du catalogue toujours visibles" detail="Sinon, ils sont derrière le bouton « Filtres »" valeur={reglages.filtresVisibles} onChange={(v) => changerReglage('filtresVisibles', v)} />
      </section>

      <div className="space-y-2 rounded-2xl bg-white p-3 text-sm shadow-sm dark:bg-slate-900">
        <p className="text-slate-500">
          Connecté : <b className="text-slate-700 dark:text-slate-200">{user?.nom || user?.email}</b>
          {user?.nom && <span> ({user.email})</span>}
          {admin && <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-500/20 dark:text-violet-200">admin</span>}
        </p>
        {!observation && user?.id && user.id !== 'demo' && (
          <Button
            icon="edit"
            className="w-full"
            onClick={async () => {
              const v = prompt('Ton prénom :', user?.nom ?? '');
              if (v === null) return;
              try {
                await majPrenom(user.id, v);
                actualiserProfil();
              } catch (e) {
                alert(e.message);
              }
            }}
          >
            Modifier mon prénom
          </Button>
        )}
        {!observation && (
          <Button icon="logout" className="w-full" onClick={() => confirm('Se déconnecter ? Les données locales seront effacées de cet appareil.') && logout()}>
            Se déconnecter
          </Button>
        )}
        <p className="text-center text-xs text-slate-400">Version {VERSION}</p>
      </div>
    </div>
  );
}

/** Journal des versions. */
function Nouveautes() {
  return (
    <div className="space-y-4">
      {NOUVEAUTES.map((n) => (
        <section key={n.version} className="space-y-2 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
          <h2 className="text-lg font-bold">
            {n.version} · {n.titre}
          </h2>
          <p className="text-xs text-slate-500">{new Date(`${n.date}T00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {n.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Reprendre (plus tard) une partie du catalogue partagé par l'administrateur. */
function ImporterCatalogue() {
  const { data } = useData();
  const { chargement, catalogue, erreur } = useCatalogue();
  const [envoi, setEnvoi] = useState(false);
  const [stats, setStats] = useState(null);
  if (chargement) return <Empty>Chargement…</Empty>;
  if (erreur) return <p className="rounded-xl bg-amber-100 p-3 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">{erreur}</p>;
  if (stats) {
    return (
      <div className="space-y-3 rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-500/10">
        <p className="text-lg font-semibold text-emerald-800 dark:text-emerald-300">C'est fait ✓</p>
        <p>
          {stats.articles} article(s) ajouté(s), {stats.modeles} tâche(s) type(s) ajoutée(s)
          {stats.dejaPresents ? `, ${stats.dejaPresents} déjà présent(s)` : ''}
          {stats.modelesIgnores ? `, ${stats.modelesIgnores} tâche(s) type(s) déjà présente(s)` : ''}.
        </p>
        <Button onClick={() => setStats(null)}>Reprendre autre chose</Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Catalogue de {catalogue.proprietaire || "l'administrateur"} : coche ce que tu veux copier dans ton catalogue. Les lieux, notes, biens, tâches et photos ne sont jamais copiés.
      </p>
      <ChoixCatalogue
        catalogue={catalogue}
        envoi={envoi}
        onValider={async (choix) => {
          setEnvoi(true);
          try {
            setStats(await A.importerCatalogue(catalogue, choix, data));
          } finally {
            setEnvoi(false);
          }
        }}
      />
    </div>
  );
}

/** Retour à l'administrateur : un texte libre, avec l'écran et la version. */
function Retour() {
  const [texte, setTexte] = useState('');
  const [etat, setEtat] = useState('saisie'); // saisie | envoi | envoye
  const [erreur, setErreur] = useState('');
  const ecran = (() => {
    try {
      return JSON.parse(localStorage.getItem('onglet'));
    } catch {
      return null;
    }
  })();
  if (etat === 'envoye') {
    return (
      <div className="space-y-3 rounded-2xl bg-emerald-50 p-4 text-center dark:bg-emerald-500/10">
        <p className="text-4xl">🙏</p>
        <p className="text-lg font-semibold text-emerald-800 dark:text-emerald-300">Merci pour ton retour !</p>
        <Button
          onClick={() => {
            setTexte('');
            setEtat('saisie');
          }}
        >
          Envoyer un autre retour
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Un souci, une idée, quelque chose de pas clair ? Écris-le ici, il arrive directement à l'administrateur.</p>
      <textarea className="w-full" rows={6} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Ce qui marche bien, ce qui coince, ce que tu voudrais…" aria-label="Ton retour" />
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      <Button
        variant="primary"
        icon="send"
        className="w-full"
        disabled={!texte.trim() || etat === 'envoi'}
        onClick={async () => {
          setEtat('envoi');
          setErreur('');
          try {
            await envoyerRetour(texte, ecran);
            setEtat('envoye');
          } catch (e) {
            setErreur(navigator.onLine ? e.message : 'Pas de réseau : réessaie plus tard.');
            setEtat('saisie');
          }
        }}
      >
        {etat === 'envoi' ? 'Envoi…' : 'Envoyer'}
      </Button>
    </div>
  );
}

const FILTRES_VIDES = { types: [], achat: '', lieu: '', categorie: '', classement: 'categorie' };
const CLASSEMENTS_CATALOGUE = [['categorie', 'Catégorie'], ['lieu', 'Lieu'], ['type', 'Type'], ['nom', 'Nom']];

/** Catalogue (inventaire) : tout ce que l'on possède, ce qu'il faut acheter, où c'est rangé. */
export function Catalogue() {
  const { data } = useData();
  const reglages = useReglages();
  const dense = reglages.dense;
  const [q, setQ] = useState('');
  const [filtres, setFiltres] = useLocalState('catalogue-filtres', FILTRES_VIDES);
  const f = { ...FILTRES_VIDES, ...filtres };
  const [panneau, setPanneau] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selection, setSelection] = useState(null);
  const lieux = new Map(data.lieux.map((l) => [l.id, l.nom]));
  const cats = new Map(data.categories.map((c) => [c.id, c.nom]));
  const vehicule = data.lieux.find((l) => nameKey(l.nom) === nameKey('Véhicule'));
  const recherche = q.trim();

  // Une recherche porte sur tous les types (pour ne rien manquer) ; les autres filtres restent actifs.
  const list = data.articles.filter((a) => {
    if (recherche) return matchesSearch(`${a.nom} ${cats.get(a.categorie_id) ?? ''} ${lieux.get(a.lieu_id) ?? ''}`, recherche);
    if (f.types.length && !f.types.includes(a.type)) return false;
    if (f.achat === 'a_acheter' && !a.a_acheter) return false;
    if (f.achat === 'vehicule' && !(vehicule && a.lieu_id === vehicule.id)) return false;
    if (f.lieu === '-' ? a.lieu_id : f.lieu && a.lieu_id !== f.lieu) return false;
    if (f.categorie === '-' ? a.categorie_id : f.categorie && a.categorie_id !== f.categorie) return false;
    return true;
  });
  const cleGroupe = {
    categorie: (a) => cats.get(a.categorie_id) ?? 'Sans catégorie',
    lieu: (a) => lieux.get(a.lieu_id) ?? 'Lieu non renseigné',
    type: (a) => `${TYPE_ICON[a.type] ?? ''} ${TYPES[a.type] ?? a.type}`,
    nom: () => '',
  }[f.classement] ?? (() => '');
  const groupes = [...list.reduce((m, a) => m.set(cleGroupe(a), [...(m.get(cleGroupe(a)) ?? []), a]), new Map())]
    .sort(([x], [y]) => (/^(Sans|Lieu non)/.test(x) ? 1 : /^(Sans|Lieu non)/.test(y) ? -1 : x.localeCompare(y, 'fr')));
  const nbFiltres = f.types.length + (f.achat ? 1 : 0) + (f.lieu ? 1 : 0) + (f.categorie ? 1 : 0);
  const toggleSel = (id) => setSelection((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const exact = recherche && findSameName(q, data.articles);
  const puces = [
    ...f.types.map((t) => [`type-${t}`, `${TYPE_ICON[t]} ${TYPES[t]}`, () => setFiltres({ ...f, types: f.types.filter((x) => x !== t) })]),
    ...(f.achat ? [['achat', f.achat === 'a_acheter' ? '🛒 À acheter' : '🚐 Dans le véhicule', () => setFiltres({ ...f, achat: '' })]] : []),
    ...(f.lieu ? [['lieu', `📍 ${f.lieu === '-' ? 'Sans lieu' : lieux.get(f.lieu)}`, () => setFiltres({ ...f, lieu: '' })]] : []),
    ...(f.categorie ? [['cat', `🗂️ ${f.categorie === '-' ? 'Sans catégorie' : cats.get(f.categorie)}`, () => setFiltres({ ...f, categorie: '' })]] : []),
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <TextField className="min-w-0 flex-1" value={q} onChange={(v) => { setQ(v); setCreating(false); }} placeholder="🔍 Rechercher ou ajouter" />
        <Button
          variant={selection ? 'primary' : 'secondary'}
          icon="check"
          className="!px-3"
          aria-label={selection ? 'Terminer la sélection' : 'Sélectionner plusieurs articles'}
          aria-pressed={!!selection}
          onClick={() => setSelection(selection ? null : new Set())}
        />
        {!reglages.filtresVisibles && (
          <Button variant={nbFiltres ? 'primary' : 'secondary'} className="!px-3" aria-label="Filtres" onClick={() => setPanneau(true)}>
            ⚙︎{nbFiltres ? ` ${nbFiltres}` : ''}
          </Button>
        )}
      </div>
      {reglages.filtresVisibles && <PanneauFiltres f={f} setFiltres={setFiltres} dense={dense} />}
      {recherche ? (
        <p className="text-xs text-slate-500">Recherche dans tous les types.</p>
      ) : (
        !reglages.filtresVisibles && puces.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {puces.map(([k, label, retirer]) => (
              <button key={k} type="button" onClick={retirer} className="min-h-8 rounded-full bg-sky-100 px-3 text-xs font-medium text-sky-800 dark:bg-sky-500/20 dark:text-sky-200">
                {label} ✕
              </button>
            ))}
          </div>
        )
      )}
      {recherche && !exact && !creating && (
        <Button variant="primary" icon="plus" className="w-full" onClick={() => setCreating(true)}>
          Créer « {recherche} »
        </Button>
      )}
      {creating && (
        <ArticleCreator
          nom={q}
          articles={data.articles}
          lieux={data.lieux}
          categories={data.categories}
          defaultType={f.types.length === 1 ? f.types[0] : 'materiel'}
          onUseExisting={(id) => { setCreating(false); setQ(''); setEditing(data.articles.find((a) => a.id === id)); }}
          onCreated={() => { setCreating(false); setQ(''); }}
          onCancel={() => setCreating(false)}
        />
      )}
      {groupes.map(([titre, articles]) => (
        <section key={titre || 'tous'}>
          {titre && (
            <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-500">
              {titre} <span className="font-normal">({articles.length})</span>
              {selection && (
                <button type="button" className="ml-auto min-h-8 text-xs font-medium text-sky-700 dark:text-sky-400" onClick={() => setSelection((s) => new Set([...s, ...articles.map((a) => a.id)]))}>
                  Tout choisir
                </button>
              )}
            </h2>
          )}
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm dark:divide-slate-800 dark:bg-slate-900">
            {articles.map((a) => {
              const qte = quantiteStock(a.id, data.stocks);
              const choisi = selection?.has(a.id);
              return (
                <Glissable key={a.id} fond="bg-white dark:bg-slate-900" supprimer={selection ? null : () => A.supprimerArticle(a, data)}>
                  <button
                    type="button"
                    onClick={() => (selection ? toggleSel(a.id) : setEditing(a))}
                    className={`flex w-full items-center gap-2 px-3 text-left ${dense ? 'min-h-11 py-0.5' : 'min-h-12 py-1'} ${choisi ? 'bg-sky-100 dark:bg-sky-500/20' : ''}`}
                  >
                    {selection && (
                      <span className={`flex size-6 shrink-0 items-center justify-center rounded-md border-2 ${choisi ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                        {choisi && <Icon name="check" className="size-4" strokeWidth={3} />}
                      </span>
                    )}
                    <span className="shrink-0">{TYPE_ICON[a.type]}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block font-medium ${dense ? 'truncate' : ''}`}>
                        {a.nom}
                        {a.a_acheter && <span className="ml-1" title="À acheter">🛒</span>}
                      </span>
                      {!dense && (
                        <span className="block text-xs text-slate-500">
                          📍 {lieux.get(a.lieu_id) ?? '—'} · 🗂️ {cats.get(a.categorie_id) ?? '—'}
                        </span>
                      )}
                    </span>
                    {dense && a.lieu_id && <span className="max-w-[35%] shrink-0 truncate text-xs text-slate-500">{lieux.get(a.lieu_id)}</span>}
                    {qte != null && <span className="shrink-0 rounded-full bg-slate-100 px-2 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">× {qte}</span>}
                  </button>
                </Glissable>
              );
            })}
          </ul>
        </section>
      ))}
      {list.length === 0 && <Empty>Aucun article.</Empty>}
      {selection && <div className="h-48" aria-hidden="true" />}
      {selection && <BulkBar selection={selection} onDone={() => setSelection(null)} onAll={() => setSelection(new Set(list.map((a) => a.id)))} />}
      {editing && <ArticleEditor article={data.articles.find((a) => a.id === editing.id) ?? editing} onClose={() => setEditing(null)} />}
      {panneau && (
        <Sheet
          title="Filtres et classement"
          onClose={() => setPanneau(false)}
          footer={
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => setFiltres({ ...FILTRES_VIDES, classement: f.classement })}>Tout effacer</Button>
              <Button variant="primary" onClick={() => setPanneau(false)}>
                Voir {list.length} article{list.length > 1 ? 's' : ''}
              </Button>
            </div>
          }
        >
          <PanneauFiltres f={f} setFiltres={setFiltres} />
        </Sheet>
      )}
    </div>
  );
}

/** Filtres du catalogue : type, achats, lieu, catégorie, classement. */
function PanneauFiltres({ f, setFiltres, dense }) {
  const { data } = useData();
  const titre = 'mb-1 text-xs font-bold tracking-wide text-slate-500 uppercase';
  return (
    <div className="space-y-3">
      <div>
        <p className={titre}>Type</p>
        <Puces dense={dense} multiple options={TYPE_OPTIONS} value={f.types} onChange={(types) => setFiltres({ ...f, types })} />
      </div>
      <div>
        <p className={titre}>Achats</p>
        <Puces dense={dense} options={[['', 'Tous'], ['a_acheter', '🛒 À acheter'], ['vehicule', '🚐 Achetés, dans le véhicule']]} value={f.achat} onChange={(achat) => setFiltres({ ...f, achat })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs font-bold text-slate-500 uppercase">
          Lieu
          <select className="mt-1 w-full text-sm font-normal normal-case" value={f.lieu} onChange={(e) => setFiltres({ ...f, lieu: e.target.value })}>
            <option value="">Tous</option>
            <option value="-">Sans lieu</option>
            {data.lieux.map((l) => (
              <option key={l.id} value={l.id}>{l.nom}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-bold text-slate-500 uppercase">
          Catégorie
          <select className="mt-1 w-full text-sm font-normal normal-case" value={f.categorie} onChange={(e) => setFiltres({ ...f, categorie: e.target.value })}>
            <option value="">Toutes</option>
            <option value="-">Sans catégorie</option>
            {data.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <p className={titre}>Classer par</p>
        <Puces dense={dense} options={CLASSEMENTS_CATALOGUE} value={f.classement} onChange={(classement) => setFiltres({ ...f, classement })} />
      </div>
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
        Une tâche type regroupe des articles que tu réutilises souvent. Le bouton + des tâches te la propose. Tu peux aussi enregistrer n'importe quelle tâche comme tâche type depuis sa fiche.
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
  const { data } = useData();
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-3">
      <section className="space-y-2 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
        <h2 className="font-semibold">Toutes les données</h2>
        <Button icon="download" className="w-full" onClick={() => download(`taches-${stamp}.csv`, csvTout(data))}>
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
