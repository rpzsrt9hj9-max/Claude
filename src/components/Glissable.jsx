import { useRef, useState } from 'react';
import { Icon } from './ui.jsx';
import { useReglages } from '../reglages.js';
import { annuler, fermerAnnulation, useAnnulation } from '../annulation.js';

// Seuils du glissement vers la gauche, en part de la largeur de la ligne.
const SEUIL_RETIRER = 0.3; // glissement partiel : retirer (bleu)
const SEUIL_SUPPRIMER = 0.65; // glissement presque complet : supprimer (rouge)

/**
 * Ligne qu'on peut glisser vers la gauche (réglage « glisser ») ou munie de petites croix (réglage « croix »).
 * Croix / zone bleue = retirer ; croix / zone rouge = supprimer.
 * Une lueur légère sur le bord droit indique ce qui est possible (rouge, bleu, ou les deux).
 */
export function Glissable({ retirer, supprimer, libelleRetirer = 'Retirer', libelleSupprimer = 'Supprimer', className = '', fond = '', children, as: Tag = 'li' }) {
  const { suppression } = useReglages();
  const [dx, setDx] = useState(0);
  const [anime, setAnime] = useState(false);
  const ref = useRef(null);
  const geste = useRef(null); // { x, y, largeur, horizontal }
  const aBouge = useRef(false);

  if (!retirer && !supprimer) return <Tag className={`${className} ${fond}`}>{children}</Tag>;

  if (suppression === 'croix') {
    return (
      <Tag className={`flex items-center ${className} ${fond}`}>
        <div className="min-w-0 flex-1">{children}</div>
        {retirer && <Croix couleur="bleu" label={libelleRetirer} onClick={retirer} />}
        {supprimer && <Croix couleur="rouge" label={libelleSupprimer} onClick={supprimer} />}
      </Tag>
    );
  }

  const largeur = () => geste.current?.largeur || ref.current?.offsetWidth || 1;
  const action = (d) => {
    const r = -d / largeur();
    if (supprimer && r >= SEUIL_SUPPRIMER) return 'supprimer';
    if (retirer && r >= SEUIL_RETIRER) return 'retirer';
    return null;
  };
  const enCours = action(dx);

  const debut = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    geste.current = { x: e.clientX, y: e.clientY, largeur: ref.current?.offsetWidth || 1, horizontal: null };
    aBouge.current = false;
    setAnime(false);
  };
  const deplacement = (e) => {
    const g = geste.current;
    if (!g) return;
    const ddx = e.clientX - g.x;
    const ddy = e.clientY - g.y;
    if (g.horizontal === null && (Math.abs(ddx) > 8 || Math.abs(ddy) > 8)) {
      g.horizontal = Math.abs(ddx) > Math.abs(ddy) * 1.2;
      if (g.horizontal) e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (!g.horizontal) return;
    aBouge.current = true;
    setDx(Math.min(0, Math.max(ddx, -g.largeur)));
  };
  const fin = () => {
    const g = geste.current;
    geste.current = null;
    if (!g?.horizontal) return;
    const a = action(dx);
    setAnime(true);
    if (a) {
      setDx(-g.largeur);
      setTimeout(() => {
        (a === 'supprimer' ? supprimer : retirer)();
        setAnime(false);
        setDx(0);
      }, 180);
    } else setDx(0);
  };

  // Lueur du bord droit : ce que permet le glissement.
  const lueur = retirer && supprimer
    ? 'linear-gradient(to bottom, rgb(14 165 233 / 0.45), rgb(220 38 38 / 0.45))'
    : supprimer
      ? 'rgb(220 38 38 / 0.4)'
      : 'rgb(14 165 233 / 0.45)';

  return (
    <Tag ref={ref} className={`relative overflow-hidden ${className} ${fond}`}>
      {dx < 0 && (
        <div className={`absolute inset-0 flex items-center justify-end gap-2 pr-4 font-semibold text-white ${enCours === 'supprimer' ? 'bg-red-600' : enCours === 'retirer' ? 'bg-sky-600' : 'bg-slate-400 dark:bg-slate-600'}`}>
          <Icon name={enCours === 'supprimer' ? 'trash' : 'x'} className="size-5" />
          {enCours === 'supprimer' ? libelleSupprimer : enCours === 'retirer' ? libelleRetirer : retirer ? `${libelleRetirer}…` : `${libelleSupprimer}…`}
        </div>
      )}
      <div
        className={`relative touch-pan-y ${fond}`}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: anime ? 'transform 180ms ease-out' : undefined }}
        onPointerDown={debut}
        onPointerMove={deplacement}
        onPointerUp={fin}
        onPointerCancel={fin}
        onClickCapture={(e) => {
          if (aBouge.current) {
            e.stopPropagation();
            e.preventDefault();
            aBouge.current = false;
          }
        }}
      >
        {children}
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-1 right-0 w-1 rounded-l-full" style={{ background: lueur }} />
      </div>
    </Tag>
  );
}

function Croix({ couleur, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${couleur === 'rouge' ? 'text-red-600 active:bg-red-100 dark:text-red-400 dark:active:bg-red-500/20' : 'text-sky-600 active:bg-sky-100 dark:text-sky-400 dark:active:bg-sky-500/20'}`}
    >
      <Icon name="x" className="size-5" strokeWidth={2.5} />
    </button>
  );
}

/** Bandeau « Annuler » en bas de l'écran, discret : il ne bloque rien et disparaît seul. */
export function BandeauAnnulation() {
  const a = useAnnulation();
  if (!a) return null;
  return (
    <div className="safe-bottom pointer-events-none fixed inset-x-0 bottom-[calc(var(--bas)+0.5rem)] z-40 flex justify-start px-3 pr-20">
      <div role="status" className="pointer-events-auto flex max-w-md min-w-0 items-center gap-1 rounded-xl bg-slate-800/95 py-1 pr-1 pl-3 text-sm text-white shadow-lg dark:bg-slate-700/95">
        <span className="min-w-0 truncate">{a.message}</span>
        <button type="button" onClick={annuler} className="min-h-9 shrink-0 rounded-lg px-3 font-bold text-sky-300 active:bg-white/10">
          Annuler
        </button>
        <button type="button" onClick={fermerAnnulation} aria-label="Fermer" className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-400 active:bg-white/10">
          <Icon name="x" className="size-4" />
        </button>
      </div>
    </div>
  );
}
