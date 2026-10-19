import { useMemo, useState } from 'react';
import { useContexteEcran } from '../chrono.js';
import { useData } from '../data.js';
import { matchesSearch, findSameName, findSimilar, nameKey } from '../../shared/match.js';
import { accessoiresFor } from '../../shared/ops.js';
import { TYPES, TYPE_ICON, TYPE_ORDER } from '../../shared/schema.js';
import { Button, Icon, Sheet, Stepper, TextField } from '../components/ui.jsx';
import { ArticleCreator } from '../components/ArticleCreator.jsx';
import { saveTache, deleteTache, duplicateTache, saveAsModele, remplacerModele, addCommentaire, addTachesToIntervention, affecter, propagerModele } from '../actions.js';
import { libellePlanification, listeVoyages, nomIntervention, voyageDe, voyageOuvert } from '../../shared/voyages.js';
import { refTache } from '../../shared/references.js';
import { diffModele, tachesDuModele } from '../../shared/modeles.js';
import { ArticleEditor } from './ArticleEditor.jsx';
import { ouverteDepuis } from './BacklogView.jsx';
import { STATUTS_TACHE, STATUT_ORDER, ajouterEtape, commentairesTache, planification, statutTache, liens } from '../../shared/interventions.js';
import { Etapes } from '../components/Etapes.jsx';
import { ListeCommentaires, NouveauCommentaire } from '../components/Commentaires.jsx';
import { STATUTS } from '../../shared/schema.js';

const COULEUR_STATUT = { a_traiter: 'bg-sky-600 text-white', en_cours: 'bg-violet-600 text-white', reportee: 'bg-amber-500 text-white', terminee: 'bg-emerald-600 text-white' };

/**
 * Création / édition d'une tâche (ou d'une tâche type si modele = true) avec ses articles.
 */
export function TacheEditor({ tache, modele = !!tache?.modele, defaultAppartementId, interventionId = null, onClose, onOpen }) {
  const { data } = useData();
  const existingLinks = useMemo(() => (tache ? data.tache_articles.filter((l) => l.tache_id === tache.id) : []), [data, tache]);
  const [titre, setTitre] = useState(tache?.titre ?? '');
  const [description, setDescription] = useState(tache?.description ?? '');
  const [appartementId, setAppartementId] = useState(tache?.appartement_id ?? defaultAppartementId ?? '');
  const [echeance, setEcheance] = useState(tache?.echeance ?? '');
  const [statut, setStatut] = useState(tache ? statutTache(tache) : 'a_traiter');
  const [etape, setEtape] = useState('');
  const [links, setLinks] = useState(() => existingLinks.map((l) => ({ article_id: l.article_id, quantite: Number(l.quantite) || 1 })));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [propagation, setPropagation] = useState(null); // { diff, cibles } après modification d'une tâche type

  // Déplacement de la tâche (modifiable depuis la fiche)
  const prevue = tache && !modele ? planification(tache.id, data) : null;
  const interventionDepart = prevue ?? (interventionId ? data.deplacements.find((d) => d.id === interventionId) : null);
  const voyageDepart = interventionDepart ? voyageDe(interventionDepart, data) : '';
  const [voyageId, setVoyageId] = useState(voyageDepart);
  const voyagesOuverts = listeVoyages(data).filter((v) => voyageOuvert(v.id, data) || v.id === voyageDepart);
  // Suivi du temps : tant que la fiche est ouverte, l'écran concerne cette tâche (et son intervention).
  useContexteEcran(3, tache && !modele ? { tache_id: tache.id, intervention_id: interventionDepart?.id ?? null, voyage_id: interventionDepart ? voyageDepart : null, appartement_id: tache.appartement_id ?? null } : { contexte: modele ? 'modeles' : 'nouvelle-tache' });

  const draft = () => ({
    id: tache?.id,
    modele,
    titre,
    description: etape.trim() ? ajouterEtape(description, etape) : description,
    appartement_id: modele ? null : appartementId,
    echeance: modele ? null : echeance,
    statut: modele ? null : statut,
    links,
  });

  const save = async () => {
    if (!titre.trim()) return;
    setSaving(true);
    const d = draft();
    const id = await saveTache(d, existingLinks, 0);
    // Tâche en cours : un article ajouté maintenant manquait ; c'est noté dans le compte rendu.
    if (tache && !modele && d.statut === 'en_cours') {
      const avant = new Set(existingLinks.map((l) => l.article_id));
      const ajoutes = d.links.filter((l) => !avant.has(l.article_id)).map((l) => data.articles.find((a) => a.id === l.article_id)?.nom).filter(Boolean);
      if (ajoutes.length) await addCommentaire({ tacheId: id, texte: `🧰 Manquait : ${ajoutes.join(', ')} (à aller chercher ou à acheter)` }, data);
    }
    const avecTache = { ...data, taches: [...data.taches.filter((t) => t.id !== id), { ...tache, id, appartement_id: d.appartement_id || null }] };
    if (!modele) {
      if (!tache && interventionId && voyageId === voyageDepart) {
        // Tâche créée depuis une intervention : elle y est ajoutée directement.
        await addTachesToIntervention(interventionId, [id], avecTache);
      } else if (voyageId !== voyageDepart || (tache && (tache.appartement_id || '') !== (d.appartement_id || '') && voyageId)) {
        // Nouveau déplacement choisi (ou bien changé) : la tâche rejoint l'intervention de son bien.
        await affecter(id, voyageId || null, avecTache);
      }
    }
    // Tâche type modifiée : proposer de reporter les changements sur les tâches ouvertes du même type.
    if (modele && tache) {
      const diff = diffModele({ liens: existingLinks, description: tache.description }, { liens: d.links, description: d.description });
      const cibles = tachesDuModele({ ...tache, titre: d.titre }, data);
      if (!diff.vide && cibles.length) {
        setPropagation({ diff, cibles, choix: new Set(cibles.map((t) => t.id)) });
        setSaving(false);
        return;
      }
    }
    onClose();
  };

  const historique = tache && !modele
    ? liens(data).filter((l) => l.tache_id === tache.id).map((l) => data.deplacements.find((d) => d.id === l.intervention_id)).filter((d) => d && d.statut === 'termine')
    : [];
  const ajoutEtape = () => {
    if (!etape.trim()) return;
    setDescription((d) => ajouterEtape(d, etape));
    setEtape('');
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

  // Tâche type du même nom déjà existante : remplacer, ou créer une nouvelle version sous un autre nom.
  const [existant, setExistant] = useState(null); // { modele, nom }
  const asModele = async () => {
    const t = titre.trim();
    if (!t) return;
    const meme = data.modeles.find((m) => nameKey(m.titre) === nameKey(t));
    if (meme) {
      let n = 2;
      while (data.modeles.some((m) => nameKey(m.titre) === nameKey(`${t} (${n})`))) n++;
      setExistant({ modele: meme, nom: `${t} (${n})` });
      return;
    }
    await saveAsModele({ titre: t, description }, links);
    setMessage(`Tâche type « ${t} » enregistrée. Tu la retrouves avec le bouton + des tâches.`);
  };
  const remplacerType = async () => {
    await remplacerModele(existant.modele, { description }, links, data);
    setMessage(`Tâche type « ${existant.modele.titre} » mise à jour.`);
    setExistant(null);
  };
  const nouvelleVersion = async () => {
    const nom = existant.nom.trim();
    if (!nom) return;
    await saveAsModele({ titre: nom, description }, links);
    setMessage(`Tâche type « ${nom} » enregistrée.`);
    setExistant(null);
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
        {modele && <p className="rounded-xl bg-violet-100 p-2 text-sm text-violet-900 dark:bg-violet-500/20 dark:text-violet-200">Tâche type : un modèle réutilisable, qui n'apparaît pas dans la liste des tâches.</p>}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400">Titre</span>
          <TextField value={titre} onChange={setTitre} placeholder="Ex. : Fixer le cadre" autoFocus={!tache} />
        </label>
        {!modele && (
          <div className="grid grid-cols-4 gap-1 rounded-2xl bg-slate-200 p-1 dark:bg-slate-800" role="radiogroup" aria-label="Statut">
            {STATUT_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={statut === s}
                onClick={() => setStatut(s)}
                className={`min-h-11 rounded-xl px-0.5 text-[13px] leading-tight font-semibold ${statut === s ? COULEUR_STATUT[s] : 'text-slate-600 dark:text-slate-300'}`}
              >
                {STATUTS_TACHE[s]}
              </button>
            ))}
          </div>
        )}
        {tache && !modele && tache.created_at && (
          <p className="text-sm text-slate-500">
            {tache.ref ? <b className="font-semibold text-slate-600 dark:text-slate-300">{refTache(tache)} · </b> : null}
            Créée le {new Date(tache.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            {statut !== 'terminee' && ` · ouverte depuis ${ouverteDepuis(tache.created_at)}`}
          </p>
        )}
        {!modele && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400">🚐 Déplacement</span>
            <select className="w-full" value={voyageId} onChange={(e) => setVoyageId(e.target.value)}>
              <option value="">— Pas encore planifiée —</option>
              {voyagesOuverts.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nom}
                  {v.date_debut ? ` (${new Date(`${v.date_debut}T00:00`).toLocaleDateString('fr-FR')})` : ''}
                </option>
              ))}
            </select>
            {prevue && voyageId === voyageDepart && <span className="mt-1 block text-xs text-slate-500">Intervention : {libellePlanification(prevue, data)} ({STATUTS[prevue.statut]})</span>}
          </label>
        )}
        {!modele && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400">Date d'échéance</span>
            <div className="flex gap-2">
              <input type="date" className="min-w-0 flex-1" value={echeance ?? ''} onChange={(e) => setEcheance(e.target.value)} />
              {echeance && <Button variant="ghost" icon="x" aria-label="Effacer la date" className="!px-2" onClick={() => setEcheance('')} />}
            </div>
          </label>
        )}
        {!modele && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400">Bien</span>
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
          <TextField multiline value={description} onChange={setDescription} placeholder="Facultatif. Une ligne « - [ ] … » devient une étape à cocher." />
        </label>
        <div className="space-y-2">
          <Etapes description={description} onChange={setDescription} />
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              ajoutEtape();
            }}
          >
            <input className="min-w-0 flex-1" value={etape} onChange={(e) => setEtape(e.target.value)} placeholder="+ Étape à cocher" aria-label="Nouvelle étape à cocher" />
            <Button type="submit" icon="plus" aria-label="Ajouter l'étape" className="!px-3" disabled={!etape.trim()} />
          </form>
        </div>

        <ArticlePicker links={links} setLinks={setLinks} />

        {tache && !modele && (
          <section className="space-y-2">
            <h3 className="font-semibold">💬 Commentaires</h3>
            <NouveauCommentaire tacheId={tache.id} />
            <ListeCommentaires
              commentaires={commentairesTache(tache.id, data)}
              titreDe={(c) => {
                const i = c.intervention_id && data.deplacements.find((d) => d.id === c.intervention_id);
                return i ? nomIntervention(i, data) : null;
              }}
            />
          </section>
        )}
        {historique.length > 0 && <p className="text-sm text-slate-500">Interventions passées : {historique.map((d) => nomIntervention(d, data)).join(', ')}</p>}

        {message && <p className="rounded-xl bg-emerald-100 p-3 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200">{message}</p>}
        {existant && (
          <div className="space-y-2 rounded-2xl border-2 border-violet-500 bg-violet-50 p-3 dark:bg-violet-500/10">
            <p className="font-semibold">La tâche type « {existant.modele.titre} » existe déjà.</p>
            <Button variant="primary" className="w-full" onClick={remplacerType}>
              Remplacer la tâche type existante
            </Button>
            <div className="flex gap-2">
              <input className="min-w-0 flex-1" value={existant.nom} onChange={(e) => setExistant({ ...existant, nom: e.target.value })} aria-label="Nom de la nouvelle version" />
              <Button onClick={nouvelleVersion}>Nouvelle version</Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={() => setExistant(null)}>
              Annuler
            </Button>
          </div>
        )}

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
      {propagation && (
        <Propagation
          propagation={propagation}
          setPropagation={setPropagation}
          onDone={async (choisies) => {
            if (choisies.length) await propagerModele(choisies, propagation.diff, data, tache.id);
            onClose();
          }}
        />
      )}
    </Sheet>
  );
}

/** Après modification d'une tâche type : choisir les tâches ouvertes à mettre à jour. */
function Propagation({ propagation, setPropagation, onDone }) {
  const { data } = useData();
  const { diff, cibles, choix } = propagation;
  const nom = (id) => data.articles.find((a) => a.id === id)?.nom ?? '?';
  const bien = (t) => data.appartements.find((a) => a.id === t.appartement_id)?.nom ?? 'Sans bien';
  const basculer = (id) => {
    const n = new Set(choix);
    n.has(id) ? n.delete(id) : n.add(id);
    setPropagation({ ...propagation, choix: n });
  };
  const changements = [
    ...diff.ajouts.map((a) => `+ ${nom(a.article_id)} × ${a.quantite}`),
    ...diff.quantites.map((a) => `${nom(a.article_id)} : quantité ${a.quantite}`),
    ...diff.retraits.map((id) => `− ${nom(id)}`),
    ...diff.etapes.map((e) => `+ étape « ${e} »`),
  ];
  return (
    <Sheet
      title="Mettre à jour les tâches ouvertes ?"
      onClose={() => onDone([])}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => onDone([])}>Ne rien changer</Button>
          <Button variant="primary" icon="check" disabled={!choix.size} onClick={() => onDone(cibles.filter((t) => choix.has(t.id)))}>
            Mettre à jour ({choix.size})
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-violet-50 p-3 text-sm dark:bg-violet-500/10">
          <p className="mb-1 font-semibold">Modifications de la tâche type :</p>
          <ul className="list-inside list-disc">
            {changements.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p className="mt-2 text-slate-600 dark:text-slate-400">Les étapes déjà cochées et les commentaires ne sont pas touchés.</p>
        </div>
        <ul className="space-y-2">
          {cibles.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                aria-pressed={choix.has(t.id)}
                onClick={() => basculer(t.id)}
                className={`flex min-h-14 w-full items-center gap-3 rounded-2xl p-2 text-left shadow-sm ${choix.has(t.id) ? 'bg-sky-100 ring-2 ring-sky-500 dark:bg-sky-500/20' : 'bg-white dark:bg-slate-900'}`}
              >
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg border-2 ${choix.has(t.id) ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                  {choix.has(t.id) && <Icon name="check" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t.titre}</span>
                  <span className="text-xs text-slate-500">🏠 {bien(t)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

function ArticlePicker({ links, setLinks }) {
  const { data } = useData();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [proposal, setProposal] = useState(null); // { parent, items: [{ article, quantite, checked }] }
  const [fiche, setFiche] = useState(null); // article ouvert pour modification (dans le catalogue)
  const articleById = useMemo(() => new Map(data.articles.map((a) => [a.id, a])), [data.articles]);
  const linked = new Set(links.map((l) => l.article_id));

  const results = useMemo(() => {
    if (!q.trim()) return [];
    const direct = data.articles.filter((a) => matchesSearch(a.nom, q));
    const fuzzy = findSimilar(q, data.articles, 5).map((m) => m.article);
    return [...new Set([...direct, ...fuzzy])].slice(0, 10);
  }, [q, data.articles]);
  const exact = q.trim() && findSameName(q, data.articles);

  // La liste de résultats reste ouverte après un ajout (on peut en ajouter plusieurs à la suite).
  const add = (id, { fermer = false } = {}) => {
    const already = new Set([...linked, id]);
    setLinks((ls) => (ls.some((l) => l.article_id === id) ? ls : [...ls, { article_id: id, quantite: 1 }]));
    if (fermer) setQ('');
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
    <section className="space-y-2">
      {TYPE_ORDER.map((type) =>
        byType[type].length ? (
          <div key={type}>
            <h3 className="mb-0.5 text-sm font-semibold text-slate-600 dark:text-slate-300">
              {TYPE_ICON[type]} {TYPES[type]} <span className="font-normal text-slate-500">({byType[type].length})</span>
            </h3>
            <ul className="divide-y divide-slate-200 rounded-xl bg-white dark:divide-slate-800 dark:bg-slate-900">
              {byType[type].map(({ link: l, article: a }) => (
                <li key={l.article_id} className="flex items-center gap-1.5 py-0.5 pl-2.5">
                  <button type="button" className="min-h-10 min-w-0 flex-1 text-left" onClick={() => setFiche(a)} aria-label={`Modifier ${a.nom} dans le catalogue`}>
                    <span className="block truncate text-sm font-medium text-sky-800 dark:text-sky-300">
                      {a.a_acheter && <span title="À acheter">🛒 </span>}
                      {a.kit && <span title="Basique">📦 </span>}
                      {a.nom}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      📍 {data.lieux.find((x) => x.id === a.lieu_id)?.nom ?? 'lieu ?'}
                      {a.unite ? ` · en ${a.unite}` : ''}
                    </span>
                  </button>
                  <Stepper compact value={l.quantite} min={0.001} onChange={(v) => setQty(a.id, v)} />
                  <Button variant="ghost" icon="x" className="!min-h-9 !min-w-9 !px-1.5 text-slate-400" aria-label={`Retirer ${a.nom}`} onClick={() => removeLink(a.id)} />
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
              <button
                type="button"
                disabled={linked.has(a.id)}
                onClick={() => add(a.id)}
                className={`flex min-h-12 w-full items-center gap-2 rounded-xl px-3 text-left ${linked.has(a.id) ? 'bg-emerald-50 text-slate-500 dark:bg-emerald-500/10' : 'bg-white active:bg-sky-100 dark:bg-slate-900 dark:active:bg-sky-900'}`}
              >
                {linked.has(a.id) ? <Icon name="check" className="size-5 text-emerald-600" /> : <Icon name="plus" className="size-5 text-sky-600" />}
                <span className="flex-1 font-medium">
                  {a.a_acheter && '🛒 '}
                  {a.nom}
                </span>
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
          <li>
            <button type="button" className="min-h-10 w-full text-center text-sm font-medium text-slate-500" onClick={() => setQ('')}>
              Fermer la liste
            </button>
          </li>
        </ul>
      )}

      {creating && (
        <ArticleCreator
          nom={q}
          articles={data.articles}
          lieux={data.lieux}
          categories={data.categories}
          onUseExisting={(id) => add(id, { fermer: true })}
          onCreated={(id) => add(id, { fermer: true })}
          onCancel={() => setCreating(false)}
        />
      )}
      {fiche && <ArticleEditor article={data.articles.find((x) => x.id === fiche.id) ?? fiche} onClose={() => setFiche(null)} />}
    </section>
  );
}
