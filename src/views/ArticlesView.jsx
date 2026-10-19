import { useMemo, useState } from 'react';
import { useData, useLocalState } from '../data.js';
import { groupBy, formatQty } from '../../shared/calc.js';
import { TYPES, TYPE_ICON, TYPE_ORDER } from '../../shared/schema.js';
import { calculerCaisses, fusionner, lireFusions, separer } from '../../shared/caisses.js';
import { planRetrait, texteRetrait } from '../../shared/retrait.js';
import { matchesSearch, findSameName } from '../../shared/match.js';
import { BigCheck, Button, Empty, Icon, LieuSelect, ProgressBar, Puces, Segmented, Stepper } from '../components/ui.jsx';
import { Glissable } from '../components/Glissable.jsx';
import { BulkBar } from '../components/BulkBar.jsx';
import { ArticleCreator } from '../components/ArticleCreator.jsx';
import { aAcheter, ajouterAuVoyage, lierATache, rangerArticles, setCaissesVoyage, setPrise, togglePris, verifierContenu } from '../actions.js';
import { avecAnnulation } from '../annulation.js';
import { useReglages } from '../reglages.js';
import { ArticleEditor } from './ArticleEditor.jsx';

/** Un article « à acheter » ne peut pas être coché « pris » tant qu'il n'est pas acheté (option développeur). */
export const bloqueParAchat = (article, reglages) => reglages.bloquerPrisSiAAcheter && !!article.a_acheter;

/**
 * Retirer un article de la liste à prendre d'un déplacement : confirmation (tâches regroupées par bien),
 * puis une question par tâche type concernée. Annulable.
 */
export async function retirerDeLaListe(item, voyageId, data) {
  const plan = planRetrait(item, voyageId, data);
  if (!confirm(texteRetrait(item, plan))) return;
  const writes = [...plan.writes];
  for (const m of plan.modeles) {
    if (confirm(`Modifier aussi la tâche type « ${m.modele.titre} » ?\n\n« ${item.article.nom} » n'y sera plus proposé pour les prochaines fois.\n(Tâche concernée : ${m.taches.join(', ')})`)) writes.push(...plan.writesModele(m.modele.id));
  }
  await avecAnnulation(writes, `« ${item.article.nom} » retiré de la liste`);
}

// Couleurs des caisses (étiquettes) : même ordre que la liste des caisses.
const COULEURS = ['bg-sky-100 text-sky-800', 'bg-violet-100 text-violet-800', 'bg-amber-100 text-amber-900', 'bg-emerald-100 text-emerald-800', 'bg-rose-100 text-rose-800', 'bg-teal-100 text-teal-800', 'bg-orange-100 text-orange-900', 'bg-slate-200 text-slate-800'];

/** Onglet « À prendre » : matériel, outillage, consommables, accessoires et basiques ; lieux, caisses, ajout direct. */
export function ArticlesView() {
  const { data, trip, depId, voyage: voyageCtx, dep } = useData();
  const voyage = voyageCtx ?? dep;
  const { dense } = useReglages();
  const [types, setTypes] = useLocalState('a-prendre-types', []);
  const [mode, setMode] = useLocalState('articles-mode', 'lieu');
  const [cacherPris, setCacherPris] = useLocalState('cacher-pris', false);
  const [editing, setEditing] = useState(null);
  const [selection, setSelection] = useState(null); // Set d'ids en mode sélection, sinon null
  const [fusion, setFusion] = useState(null); // clé de la première caisse choisie pour une fusion
  const items = trip.items.filter((i) => !types.length || types.includes(i.article.type));
  const shown = cacherPris ? items.filter((i) => !i.status.complet) : items;
  const reste = (type) => trip.items.filter((i) => i.article.type === type && !i.status.complet).length;
  const presents = TYPE_ORDER.filter((t) => trip.items.some((i) => i.article.type === t));

  const fusions = lireFusions(voyage);
  const { caisses, parArticle } = useMemo(() => calculerCaisses(trip.items, data, fusions), [trip.items, data, voyage?.caisses]); // eslint-disable-line react-hooks/exhaustive-deps
  const couleur = new Map(caisses.map((c, i) => [c.cle, COULEURS[i % COULEURS.length]]));
  const peutFusionner = voyage && !voyage.virtuel;
  // Fusion : fusion = null (inactif), '' (choisir la 1re caisse) ou clé de la 1re caisse choisie.
  const choisirCaisse = async (c) => {
    if (!fusion) return setFusion(c.cle);
    if (fusion !== c.cle) await setCaissesVoyage(voyage, fusionner(fusions, fusion, c.cle));
    setFusion(null);
  };

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
    onRetirer: () => retirerDeLaListe(i, depId, data),
    caisses: mode === 'caisses' ? (parArticle.get(i.article.id) || []).map((c) => ({ ...c, couleur: couleur.get(c.cle) })) : null,
  });

  const parLieu = mode === 'lieu' || mode === 'caisses';
  const groups = mode === 'liste' ? [{ ref: null, items: shown, flat: true }] : groupBy(shown, parLieu ? data.lieux : data.categories, parLieu ? 'lieu_id' : 'categorie_id');
  const taille = dense ? 'min-h-8 px-3 text-xs' : 'min-h-10 px-4 text-sm';

  return (
    <div className={dense ? 'space-y-2' : 'space-y-3'}>
      <ProgressBar done={items.filter((i) => i.status.complet).length} total={items.length} label="pris" />
      <AjoutDirect voyageId={depId} />
      {presents.length > 1 && <Puces dense={dense} multiple value={types} onChange={setTypes} options={presents.map((t) => [t, `${TYPE_ICON[t]} ${TYPES[t]}`, reste(t)])} />}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented options={[['lieu', '📍 Lieu'], ['caisses', '📦 Caisses'], ['categorie', '🗂️ Cat.'], ['liste', 'Liste']]} value={mode} onChange={setMode} />
        <button type="button" onClick={() => setCacherPris(!cacherPris)} className={`${taille} rounded-full ${cacherPris ? 'bg-slate-700 text-white' : 'bg-white text-slate-500 shadow-sm dark:bg-slate-900'}`}>
          {cacherPris ? 'Pris masqués' : 'Masquer pris'}
        </button>
        <button type="button" onClick={() => setSelection(selection ? null : new Set())} className={`${taille} rounded-full ${selection ? 'bg-sky-600 text-white' : 'bg-white text-slate-500 shadow-sm dark:bg-slate-900'}`}>
          {selection ? 'Terminer' : 'Sélectionner'}
        </button>
      </div>

      {mode === 'caisses' && caisses.length > 0 && (
        <section className="space-y-2 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
          <h2 className="font-semibold">
            📦 {caisses.length} caisse{caisses.length > 1 ? 's' : ''} à prévoir
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {caisses.map((c) => (
              <span key={c.cle} className={`inline-flex items-center rounded-full text-sm font-medium ${couleur.get(c.cle)} ${fusion === c.cle ? 'ring-2 ring-sky-600' : ''}`}>
                <button type="button" disabled={!peutFusionner || fusion === null} onClick={() => choisirCaisse(c)} className="min-h-9 px-3 disabled:opacity-100">
                  {c.nom} <span className="opacity-60">({c.lignes.length})</span>
                </button>
                {c.membres.length > 1 && peutFusionner && (
                  <button type="button" aria-label={`Séparer ${c.nom}`} className="min-h-9 pr-2.5 pl-1" onClick={() => setCaissesVoyage(voyage, separer(fusions, c.cle))}>
                    ✂︎
                  </button>
                )}
              </span>
            ))}
          </div>
          {peutFusionner && caisses.length > 1 && (
            <button type="button" className="text-sm font-medium text-sky-700 dark:text-sky-400" onClick={() => setFusion(fusion === null ? '' : null)}>
              {fusion === null ? '🔗 Fusionner deux caisses' : fusion ? 'Touche la caisse à y regrouper… (annuler)' : 'Touche la première caisse… (annuler)'}
            </button>
          )}
        </section>
      )}

      {trip.items.length === 0 && <Empty>Rien à prendre pour ce déplacement. Ajoute des articles dans les tâches ou ci-dessus.</Empty>}

      {groups.map((g) => (
        <section key={g.ref?.id ?? 'none'}>
          {!g.flat && (
            <h2 className="mb-1.5 flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
              {parLieu ? <Icon name="pin" className="size-4 text-sky-600" /> : <span>🗂️</span>}
              {g.ref ? g.ref.nom : parLieu ? 'Lieu non renseigné' : 'Sans catégorie'}
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

/** « + Ajouter à prendre » : une affaire liée au déplacement, sans tâche (lunettes de soleil, matériel en plus). */
function AjoutDirect({ voyageId }) {
  const { data } = useData();
  const [q, setQ] = useState('');
  const [creation, setCreation] = useState(false);
  const resultats = q.trim() ? data.articles.filter((a) => matchesSearch(a.nom, q)).slice(0, 6) : [];
  const ajouter = async (id) => {
    await ajouterAuVoyage(voyageId, id);
    setCreation(false);
  };
  return (
    <div className="space-y-1">
      <input type="search" className="w-full !min-h-10" placeholder="＋ Ajouter à prendre (sans tâche)…" value={q} onChange={(e) => { setQ(e.target.value); setCreation(false); }} aria-label="Ajouter une affaire au déplacement" />
      {q.trim() && !creation && (
        <ul className="space-y-1">
          {resultats.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => ajouter(a.id)} className="flex min-h-11 w-full items-center gap-2 rounded-xl bg-white px-3 text-left active:bg-sky-100 dark:bg-slate-900">
                <Icon name="plus" className="size-5 text-sky-600" />
                <span className="flex-1 truncate">
                  {TYPE_ICON[a.type]} {a.nom}
                </span>
              </button>
            </li>
          ))}
          {!findSameName(q, data.articles) && (
            <li>
              <button type="button" onClick={() => setCreation(true)} className="flex min-h-11 w-full items-center gap-2 rounded-xl border-2 border-dashed border-sky-500 px-3 font-medium text-sky-700 dark:text-sky-400">
                <Icon name="plus" /> Créer « {q.trim()} »
              </button>
            </li>
          )}
          <li>
            <button type="button" className="min-h-9 w-full text-center text-sm text-slate-500" onClick={() => setQ('')}>
              Fermer la liste
            </button>
          </li>
        </ul>
      )}
      {creation && (
        <ArticleCreator
          nom={q}
          articles={data.articles}
          lieux={data.lieux}
          categories={data.categories}
          onUseExisting={ajouter}
          onCreated={async (id) => {
            await ajouter(id);
            setQ('');
          }}
          onCancel={() => setCreation(false)}
        />
      )}
    </div>
  );
}

/** « → lier à une tâche » : rattache une affaire du déplacement à une de ses tâches. */
function LierATache({ item }) {
  const { data, trip, depId } = useData();
  const taches = trip.taches.map((t) => t.tache);
  if (!taches.length) return null;
  return (
    <select
      className="w-full !min-h-9 text-sm"
      value=""
      aria-label="Lier à une tâche"
      onChange={async (e) => {
        const t = taches.find((x) => x.id === e.target.value);
        if (!t) return;
        const modele = t.modele_id && data.taches.find((x) => x.id === t.modele_id && x.modele);
        const aussi = modele ? confirm(`Ajouter aussi « ${item.article.nom} » à la tâche type « ${modele.titre} » ?`) : false;
        await lierATache(depId, item, t, data, aussi);
      }}
    >
      <option value="">→ Lier à une tâche…</option>
      {taches.map((t) => (
        <option key={t.id} value={t.id}>
          {t.titre}
        </option>
      ))}
    </select>
  );
}

/**
 * Ligne d'article sur une seule ligne (~48 px) ; un toucher déplie les détails (tâches, lieu, quantité, contenu d'un basique).
 * onRetirer : glissement « retirer » ; fondSortie : 'dedans' (bleu) | 'absent' (gris, non cochable) pour « À sortir ».
 */
export function ItemRow({ item, onEdit, selected, onSelect, cle, verbe = 'pris', onRetirer, caisses, fondSortie }) {
  const { data, depId: depCtx } = useData();
  const reglages = useReglages();
  const depId = cle ?? depCtx;
  const [ouvert, setOuvert] = useState(false);
  const { article, total, status, usages } = item;
  const multi = total !== 1;
  const selecting = onSelect !== undefined;
  const bloque = (verbe === 'pris' && !status.complet && bloqueParAchat(article, reglages)) || fondSortie === 'absent';
  const tone = selecting
    ? selected
      ? 'bg-sky-100 ring-2 ring-inset ring-sky-500 dark:bg-sky-950'
      : 'bg-white dark:bg-slate-900'
    : fondSortie === 'absent'
      ? 'bg-slate-200 dark:bg-slate-800'
      : fondSortie === 'dedans' && !status.complet
        ? 'bg-sky-100 dark:bg-sky-950'
        : status.etat === 'complet'
          ? 'bg-emerald-50 dark:bg-emerald-950'
          : status.etat === 'partiel'
            ? 'bg-amber-50 dark:bg-amber-950'
            : 'bg-white dark:bg-slate-900';
  const lieu = data.lieux.find((l) => l.id === article.lieu_id)?.nom;
  const cat = data.categories.find((c) => c.id === article.categorie_id)?.nom;
  const duDeplacement = usages.some((u) => u.voyage);

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
    <Glissable className="rounded-xl shadow-sm" fond={tone} retirer={onRetirer} libelleRetirer="Ne pas prendre">
      <div className="flex min-h-12 items-center gap-2 pr-1 pl-2.5">
        <BigCheck
          compact
          etat={status.etat}
          disabled={bloque}
          label={fondSortie === 'absent' ? `${article.nom} : pas dans la voiture` : bloque ? `${article.nom} : à acheter d'abord` : status.complet ? `Décocher ${article.nom}` : `${article.nom} ${verbe}`}
          onClick={() => togglePris(depId, item)}
        />
        <button type="button" onClick={() => setOuvert(!ouvert)} aria-expanded={ouvert} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-left">
          <span className="flex w-full items-center gap-2">
            <span className={`min-w-0 flex-1 truncate font-semibold ${status.complet ? 'text-emerald-800 dark:text-emerald-300' : fondSortie === 'absent' ? 'text-slate-500' : ''}`}>
              {article.a_acheter && <span title="À acheter">🛒 </span>}
              {article.kit && <span title="Basique">📦 </span>}
              {article.nom}
            </span>
            {item.contenu && verbe === 'pris' && <span className="shrink-0 text-xs text-slate-500">{status.verifies ?? 0}/{item.contenu.length}</span>}
            {status.etat === 'partiel' && !item.contenu && <span className="shrink-0 text-xs font-semibold text-amber-700 dark:text-amber-300">{formatQty(status.taken, null)}/</span>}
            <span className="shrink-0 font-bold text-sky-700 dark:text-sky-400">× {formatQty(total, article.unite)}</span>
          </span>
          {fondSortie === 'absent' && <span className="text-xs text-slate-500">Pas chargé dans la voiture</span>}
          {caisses?.length > 0 && (
            <span className="mt-0.5 flex flex-wrap gap-1">
              {caisses.map((c) => (
                <span key={c.cle} className={`rounded-full px-2 text-[11px] font-medium ${c.couleur}`}>
                  → {c.nom}
                  {caisses.length > 1 ? ` ×${formatQty(c.quantite, null)}` : ''}
                </span>
              ))}
            </span>
          )}
        </button>
        {reglages.boutonAchat && (
          <button
            type="button"
            onClick={() => aAcheter([article.id], !article.a_acheter)}
            aria-label={article.a_acheter ? `${article.nom} : plus à acheter` : `${article.nom} : à acheter`}
            aria-pressed={!!article.a_acheter}
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-base ${article.a_acheter ? 'bg-red-100 dark:bg-red-500/20' : 'opacity-40 grayscale'}`}
          >
            🛒
          </button>
        )}
        <Icon name="chevron" className={`size-4 shrink-0 text-slate-400 transition-transform ${ouvert ? 'rotate-90' : ''}`} />
      </div>
      {ouvert && (
        <div className="space-y-2 border-t border-slate-200/70 px-2.5 pt-2 pb-2.5 dark:border-slate-700/50">
          {bloque && fondSortie !== 'absent' && <p className="text-sm font-semibold text-red-700 dark:text-red-300">🛒 À acheter d'abord : coche-le « acheté » dans l'onglet À acheter.</p>}
          <p className="text-sm text-slate-500">{usages.map((u) => `${u.tache ? u.tache.titre : '🚐 Déplacement'} : ${formatQty(u.quantite, null)}`).join(' ; ')}</p>
          {item.contenu && verbe === 'pris' && (
            <ul className="space-y-0.5 rounded-lg bg-white/70 p-1 dark:bg-slate-900/60">
              {item.contenu.map((c) => (
                <li key={c.article.id} className="flex items-center gap-2">
                  <BigCheck compact etat={c.verifie ? 'complet' : 'vide'} label={`${c.article.nom} vérifié`} onClick={() => verifierContenu(depId, article.id, c, !c.verifie)} />
                  <span className={`flex-1 text-sm ${c.verifie ? 'text-emerald-800 line-through dark:text-emerald-300' : ''}`}>{c.article.nom}</span>
                  {c.quantite !== 1 && <span className="text-sm text-slate-500">× {formatQty(c.quantite, null)}</span>}
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <LieuSelect
              lieux={data.lieux}
              value={article.lieu_id}
              onChange={(v) => rangerArticles([article.id], v, data)}
              onAcheter={reglages.achatDansLieu && !article.a_acheter ? () => aAcheter([article.id], true) : undefined}
              className="min-w-0 flex-1 text-sm"
            />
            {multi && !bloque && !item.contenu && <Stepper compact label={`Quantité ${verbe}`} value={status.taken} onChange={(v) => setPrise(depId, item, v)} />}
          </div>
          {duDeplacement && verbe === 'pris' && <LierATache item={item} />}
          <Button variant="ghost" icon="edit" className="!min-h-9 w-full text-sm" onClick={onEdit}>
            Fiche de l'article
          </Button>
        </div>
      )}
    </Glissable>
  );
}
