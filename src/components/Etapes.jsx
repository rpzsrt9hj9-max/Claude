import { lignesDescription, basculerEtape } from '../../shared/interventions.js';
import { setDescription } from '../actions.js';
import { Icon } from './ui.jsx';

/**
 * Description d'une tâche : le texte, et les lignes « - [ ] étape » en grandes cases à cocher.
 * Si `tache` est fourni, cocher enregistre tout de suite ; sinon `onChange` reçoit la nouvelle description.
 */
export function Etapes({ description, tache, onChange, compact }) {
  const lignes = lignesDescription(description);
  if (!lignes.some((l) => l.type === 'case' || (!compact && l.texte.trim()))) return null;
  const basculer = (index) => {
    const d = basculerEtape(description, index);
    if (tache) setDescription(tache, d);
    else onChange?.(d);
  };
  return (
    <div className="space-y-1">
      {lignes.map((l) =>
        l.type === 'case' ? (
          <button
            key={l.index}
            type="button"
            onClick={() => basculer(l.index)}
            aria-pressed={l.fait}
            className={`flex w-full items-center gap-3 rounded-xl px-2 text-left ${compact ? 'min-h-10' : 'min-h-12'} ${l.fait ? 'text-slate-400' : ''} active:bg-slate-100 dark:active:bg-slate-800`}
          >
            <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg border-2 ${l.fait ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-400'}`}>
              {l.fait && <Icon name="check" strokeWidth={3} />}
            </span>
            <span className={`break-words ${l.fait ? 'line-through' : ''}`}>{l.texte}</span>
          </button>
        ) : l.texte.trim() && !compact ? (
          <p key={l.index} className="px-2 whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300">
            {l.texte}
          </p>
        ) : null,
      )}
    </div>
  );
}
