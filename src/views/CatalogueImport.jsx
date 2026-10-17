import { useEffect, useMemo, useState } from 'react';
import { useData } from '../data.js';
import { nameKey, matchesSearch } from '../../shared/match.js';
import { accessoiresDe, etendreSelection } from '../../shared/catalogue.js';
import { TYPES, TYPE_ICON } from '../../shared/schema.js';
import { Button, Empty, Icon } from '../components/ui.jsx';
import { chargerCatalogue } from '../actions.js';

const ONGLETS = [
  ['outillage', `${TYPE_ICON.outillage} ${TYPES.outillage}`],
  ['consommable', `${TYPE_ICON.consommable} Conso.`],
  ['materiel', `${TYPE_ICON.materiel} ${TYPES.materiel}`],
  ['modeles', '📋 Tâches types'],
];

/** Charge le catalogue partagé par l'administrateur. */
export function useCatalogue() {
  const [etat, setEtat] = useState({ chargement: true, catalogue: null, erreur: null });
  useEffect(() => {
    let vivant = true;
    chargerCatalogue()
      .then((catalogue) => vivant && setEtat({ chargement: false, catalogue, erreur: null }))
      .catch((e) => vivant && setEtat({ chargement: false, catalogue: null, erreur: e.message }));
    return () => {
      vivant = false;
    };
  }, []);
  return etat;
}

/**
 * Choix de ce qu'on reprend du catalogue partagé : on coche des articles et des tâches types.
 * Une tâche type coche ses articles ; un article coche ses accessoires (décochables).
 * `onValider(choix)` reçoit { articles: Set, modeles: Set }.
 */
export function ChoixCatalogue({ catalogue, onValider, libelle = 'Reprendre', envoi = false }) {
  const { data } = useData();
  const [onglet, setOnglet] = useState('outillage');
  const [q, setQ] = useState('');
  const [articles, setArticles] = useState(() => new Set());
  const [modeles, setModeles] = useState(() => new Set());
  const presents = useMemo(() => new Set(data.articles.map((a) => nameKey(a.nom))), [data.articles]);
  const dejaChez = (a) => presents.has(nameKey(a.nom));
  const catNom = (id) => catalogue.categories.find((c) => c.id === id)?.nom ?? 'Sans catégorie';

  const basculerArticle = (a) =>
    setArticles((s) => {
      const n = new Set(s);
      if (n.has(a.id)) n.delete(a.id);
      else {
        n.add(a.id);
        for (const acc of accessoiresDe(catalogue, a.id)) if (!dejaChez(catalogue.articles.find((x) => x.id === acc) ?? { nom: '' })) n.add(acc);
      }
      return n;
    });
  const basculerModele = (m) => {
    const actif = modeles.has(m.id);
    setModeles((s) => {
      const n = new Set(s);
      actif ? n.delete(m.id) : n.add(m.id);
      return n;
    });
    if (!actif) setArticles((s) => new Set([...s, ...m.besoins.map((b) => b.article_id)]));
  };

  const visibles = catalogue.articles.filter((a) => a.type === onglet && matchesSearch(`${a.nom} ${catNom(a.categorie_id)}`, q));
  const groupes = [...new Set(visibles.map((a) => a.categorie_id || ''))]
    .map((id) => ({ id, nom: id ? catNom(id) : 'Sans catégorie', items: visibles.filter((a) => (a.categorie_id || '') === id) }))
    .sort((a, b) => (a.id ? (b.id ? a.nom.localeCompare(b.nom, 'fr') : -1) : 1));
  const cochables = visibles.filter((a) => !dejaChez(a));
  const toutCoche = cochables.length > 0 && cochables.every((a) => articles.has(a.id));
  const total = etendreSelection(catalogue, { articles, modeles }, { avecAccessoires: false });
  const nbArticles = [...total].filter((id) => !dejaChez(catalogue.articles.find((a) => a.id === id) ?? { nom: '' })).length;
  const compte = (type) => catalogue.articles.filter((a) => a.type === type && articles.has(a.id)).length;
  const modelesVisibles = catalogue.modeles.filter((m) => matchesSearch(m.titre, q));

  return (
    <div className="space-y-3">
      <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1">
        {ONGLETS.map(([id, label]) => {
          const n = id === 'modeles' ? modeles.size : compte(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => setOnglet(id)}
              aria-current={onglet === id ? 'page' : undefined}
              className={`min-h-11 shrink-0 rounded-full px-4 font-medium ${onglet === id ? 'bg-sky-600 text-white' : 'bg-white text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-300'}`}
            >
              {label}
              {n > 0 && <span className="ml-1 rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white">{n}</span>}
            </button>
          );
        })}
      </div>
      <input type="search" className="w-full" placeholder="🔍 Rechercher" value={q} onChange={(e) => setQ(e.target.value)} />

      {onglet !== 'modeles' && cochables.length > 0 && (
        <button
          type="button"
          className="min-h-11 text-sm font-medium text-sky-700 dark:text-sky-400"
          onClick={() =>
            setArticles((s) => {
              const n = new Set(s);
              cochables.forEach((a) => (toutCoche ? n.delete(a.id) : n.add(a.id)));
              return n;
            })
          }
        >
          {toutCoche ? 'Tout décocher' : `Tout cocher (${cochables.length})`}
        </button>
      )}

      {onglet === 'modeles' ? (
        <ul className="space-y-2">
          {modelesVisibles.map((m) => {
            const coche = modeles.has(m.id);
            return (
              <li key={m.id}>
                <button type="button" aria-pressed={coche} onClick={() => basculerModele(m)} className={`flex min-h-14 w-full items-center gap-3 rounded-2xl p-2 text-left shadow-sm ${coche ? 'bg-violet-100 ring-2 ring-violet-500 dark:bg-violet-500/20' : 'bg-white dark:bg-slate-900'}`}>
                  <Case coche={coche} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">📋 {m.titre}</span>
                    <span className="text-xs text-slate-500">{m.besoins.length} article(s), articles ajoutés automatiquement</span>
                  </span>
                </button>
              </li>
            );
          })}
          {modelesVisibles.length === 0 && <Empty>Aucune tâche type.</Empty>}
        </ul>
      ) : (
        <>
          {groupes.map((g) => (
            <section key={g.id} className="space-y-1">
              <h3 className="text-sm font-bold text-slate-500 uppercase">{g.nom}</h3>
              <ul className="space-y-1">
                {g.items.map((a) => {
                  const deja = dejaChez(a);
                  const coche = articles.has(a.id);
                  const acc = accessoiresDe(catalogue, a.id).map((id) => catalogue.articles.find((x) => x.id === id)?.nom).filter(Boolean);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        disabled={deja}
                        aria-pressed={coche}
                        onClick={() => basculerArticle(a)}
                        className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-2 py-1 text-left shadow-sm ${deja ? 'bg-slate-100 opacity-60 dark:bg-slate-900/50' : coche ? 'bg-sky-100 ring-2 ring-sky-500 dark:bg-sky-500/20' : 'bg-white dark:bg-slate-900'}`}
                      >
                        <Case coche={coche || deja} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium break-words">{a.nom}</span>
                          {deja ? <span className="text-xs text-slate-500">déjà dans ton catalogue</span> : acc.length > 0 && <span className="text-xs text-slate-500">avec : {acc.join(', ')}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {visibles.length === 0 && <Empty>Aucun article ici.</Empty>}
        </>
      )}

      <div className="sticky bottom-20 pt-2">
        <Button variant="primary" icon="check" className="w-full text-lg shadow-lg" disabled={envoi || (!nbArticles && !modeles.size)} onClick={() => onValider({ articles, modeles })}>
          {libelle} ({nbArticles} article{nbArticles > 1 ? 's' : ''}
          {modeles.size ? `, ${modeles.size} tâche${modeles.size > 1 ? 's' : ''} type${modeles.size > 1 ? 's' : ''}` : ''})
        </Button>
      </div>
    </div>
  );
}

function Case({ coche }) {
  return (
    <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg border-2 ${coche ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
      {coche && <Icon name="check" strokeWidth={3} />}
    </span>
  );
}
