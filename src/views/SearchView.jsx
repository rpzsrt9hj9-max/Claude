import { useState } from 'react';
import { useData } from '../data.js';
import { TYPE_ICON } from '../../shared/schema.js';
import { matchesSearch } from '../../shared/match.js';
import { Sheet, TextField, Empty } from '../components/ui.jsx';
import { TacheEditor } from './TacheEditor.jsx';
import { ArticleEditor } from './ArticleEditor.jsx';

/** Recherche globale : tâches (tous déplacements), articles, lieux. */
export function SearchView({ onClose }) {
  const { data } = useData();
  const [q, setQ] = useState('');
  const [tache, setTache] = useState(null);
  const [article, setArticle] = useState(null);
  const deps = new Map(data.deplacements.map((d) => [d.id, d.nom]));
  const lieux = new Map(data.lieux.map((l) => [l.id, l.nom]));
  const has = q.trim().length > 0;
  const taches = has ? data.taches.filter((t) => matchesSearch(`${t.titre} ${t.description ?? ''}`, q)).slice(0, 20) : [];
  const articles = has ? data.articles.filter((a) => matchesSearch(`${a.nom} ${a.notes ?? ''} ${lieux.get(a.lieu_id) ?? ''}`, q)).slice(0, 20) : [];

  return (
    <Sheet title="Recherche" onClose={onClose}>
      <TextField value={q} onChange={setQ} placeholder="Tâche, article, lieu…" autoFocus />
      {has && !taches.length && !articles.length && <Empty>Aucun résultat.</Empty>}
      {taches.length > 0 && (
        <section className="mt-4">
          <h3 className="mb-2 text-sm font-bold uppercase text-slate-500">Tâches</h3>
          <ul className="space-y-1">
            {taches.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => setTache(t)} className="min-h-12 w-full rounded-xl bg-white px-3 py-2 text-left dark:bg-slate-900">
                  <span className={`block font-medium ${t.fait ? 'line-through opacity-60' : ''}`}>{t.titre}</span>
                  <span className="text-xs text-slate-500">{t.modele ? '📋 Tâche type' : deps.get(t.deplacement_id)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {articles.length > 0 && (
        <section className="mt-4">
          <h3 className="mb-2 text-sm font-bold uppercase text-slate-500">Articles</h3>
          <ul className="space-y-1">
            {articles.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => setArticle(a)} className="flex min-h-12 w-full items-center gap-2 rounded-xl bg-white px-3 text-left dark:bg-slate-900">
                  <span>{TYPE_ICON[a.type]}</span>
                  <span className="flex-1 font-medium">{a.nom}</span>
                  <span className="text-xs text-slate-500">📍 {lieux.get(a.lieu_id) ?? '?'}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {tache && <TacheEditor tache={tache} onClose={() => setTache(null)} />}
      {article && <ArticleEditor article={article} onClose={() => setArticle(null)} />}
    </Sheet>
  );
}
