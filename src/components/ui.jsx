import { useEffect, useRef, useState } from 'react';

const ICONS = {
  check: 'M5 12.5l4.5 4.5L19 7',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  back: 'M15 5l-7 7 7 7',
  chevron: 'M9 5l7 7-7 7',
  tasks: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  box: 'M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10',
  tool: 'M14 6a4 4 0 0 0 5 5l-8.5 8.5a2.1 2.1 0 0 1-3-3L16 8a4 4 0 0 0-2-2z',
  truck: 'M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  disc: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v5h14v-5',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  merge: 'M6 3v6a6 6 0 0 0 6 6h6M15 12l3 3-3 3M6 21v-6',
  home: 'M3 11l9-8 9 8M5 9.5V21h14V9.5',
  calendar: 'M4 6h16v15H4zM4 10h16M9 3v4M15 3v4',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  edit: 'M4 20h4L19 9l-4-4L4 16v4z',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1M16 5.2a3 3 0 0 1 0 5.6M21 20v-1a5 5 0 0 0-3-4.6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  send: 'M21 3L3 10l7 3 3 7 8-17z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  chat: 'M4 5h16v11H9l-5 4z',
  print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  van: 'M2 7h12v9H2zM14 10h4l4 3v3h-8M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
};

export function Icon({ name, className = 'size-5', strokeWidth = 2 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

const VARIANTS = {
  primary: 'bg-sky-600 text-white active:bg-sky-700 disabled:bg-slate-400',
  secondary: 'bg-slate-200 text-slate-900 active:bg-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:active:bg-slate-700',
  ghost: 'text-slate-700 active:bg-slate-200 dark:text-slate-300 dark:active:bg-slate-800',
  danger: 'bg-red-600 text-white active:bg-red-700',
  success: 'bg-emerald-600 text-white active:bg-emerald-700',
};

export function Button({ variant = 'secondary', className = '', icon, children, ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-4 font-medium transition-colors disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

/** Grande case à cocher tactile : vide (gris), partielle (orange), complète (vert). */
export function BigCheck({ etat = 'vide', onClick, label, size = 'size-14', disabled }) {
  const styles = {
    vide: 'border-2 border-slate-300 bg-white text-transparent dark:border-slate-600 dark:bg-slate-900',
    partiel: 'border-2 border-amber-500 bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    complet: 'border-2 border-emerald-600 bg-emerald-600 text-white',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={etat === 'complet'}
      className={`${size} flex shrink-0 items-center justify-center rounded-2xl transition-all active:scale-90 ${styles[etat]}`}
    >
      {etat === 'partiel' ? <Icon name="minus" className="size-7" strokeWidth={3} /> : <Icon name="check" className="size-8" strokeWidth={3} />}
    </button>
  );
}

export function Pill({ ok, children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
        ok ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
      }`}
    >
      {children}
    </span>
  );
}

export function Stepper({ value, onChange, min = 0, step = 1, label = 'Quantité' }) {
  const [text, setText] = useState(String(value ?? ''));
  useEffect(() => setText(String(value ?? '')), [value]);
  const commit = (v) => {
    const n = Number(String(v).replace(',', '.'));
    if (Number.isFinite(n) && n >= min) onChange(Math.round(n * 1000) / 1000);
    else setText(String(value ?? ''));
  };
  return (
    <div className="inline-flex items-center rounded-xl border border-slate-300 dark:border-slate-700" role="group" aria-label={label}>
      <button type="button" className="flex size-11 items-center justify-center rounded-l-xl active:bg-slate-200 dark:active:bg-slate-800" onClick={() => value - step >= min && onChange(Math.round((value - step) * 1000) / 1000)} aria-label="Moins">
        <Icon name="minus" />
      </button>
      <input
        inputMode="decimal"
        className="!min-h-11 w-14 !rounded-none !border-0 !border-x !px-1 text-center !ring-0"
        value={text}
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        onFocus={(e) => e.target.select()}
      />
      <button type="button" className="flex size-11 items-center justify-center rounded-r-xl active:bg-slate-200 dark:active:bg-slate-800" onClick={() => onChange(Math.round(((Number(value) || 0) + step) * 1000) / 1000)} aria-label="Plus">
        <Icon name="plus" />
      </button>
    </div>
  );
}

/** Feuille plein écran sur téléphone, fenêtre centrée sur ordinateur. */
export function Sheet({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="safe-top flex w-full flex-col bg-slate-50 sm:max-h-[90vh] sm:max-w-xl sm:rounded-2xl dark:bg-slate-950"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 border-b border-slate-200 px-2 py-2 dark:border-slate-800">
          <Button variant="ghost" icon="back" onClick={onClose} aria-label="Fermer" className="!px-2" />
          <h2 className="flex-1 truncate text-lg font-semibold">{title}</h2>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <footer className="safe-bottom border-t border-slate-200 p-3 dark:border-slate-800">{footer}</footer>}
      </div>
    </div>
  );
}

const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

/** Bouton micro (Web Speech API). Le clavier du téléphone propose aussi sa propre dictée. */
export function MicButton({ onResult }) {
  const [on, setOn] = useState(false);
  const rec = useRef(null);
  if (!SpeechRecognition) return null;
  const start = () => {
    if (on) return rec.current?.stop();
    const r = new SpeechRecognition();
    r.lang = 'fr-FR';
    r.interimResults = false;
    r.onresult = (e) => onResult(e.results[0][0].transcript);
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r;
    setOn(true);
    r.start();
  };
  return (
    <button
      type="button"
      onClick={start}
      aria-label="Dicter"
      className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${on ? 'animate-pulse bg-red-600 text-white' : 'bg-slate-200 dark:bg-slate-800'}`}
    >
      <Icon name="mic" />
    </button>
  );
}

/** Champ texte + micro */
export function TextField({ value, onChange, multiline, className = '', ...props }) {
  const Comp = multiline ? 'textarea' : 'input';
  return (
    <div className={`flex items-start gap-2 ${className}`}>
      <Comp className="w-full" value={value} onChange={(e) => onChange(e.target.value)} rows={multiline ? 3 : undefined} {...props} />
      <MicButton onResult={(t) => onChange(value ? `${value} ${t}` : t.charAt(0).toUpperCase() + t.slice(1))} />
    </div>
  );
}

export function LieuSelect({ lieux, value, onChange, className = '', allowEmpty = true, emptyLabel = '— Lieu ? —' }) {
  return (
    <select className={className} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} aria-label="Lieu de stockage">
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {lieux.map((l) => (
        <option key={l.id} value={l.id}>
          {l.nom}
        </option>
      ))}
    </select>
  );
}

export function ProgressBar({ done, total, label }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const complete = total > 0 && done === total;
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-lg font-bold">
          {done} / {total} {label}
        </span>
        <span className={`text-sm font-semibold ${complete ? 'text-emerald-600' : 'text-slate-500'}`}>{complete ? 'Tout est pris ✓' : `${pct} %`}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className={`h-full rounded-full transition-all ${complete ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Empty({ children }) {
  return <p className="py-10 text-center text-slate-500">{children}</p>;
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-xl bg-slate-200 p-1 dark:bg-slate-800">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`min-h-9 rounded-lg px-3 text-sm font-medium ${value === v ? 'bg-white shadow dark:bg-slate-950' : 'text-slate-600 dark:text-slate-400'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function CategorieSelect({ categories, value, onChange, className = '', emptyLabel = '— Catégorie ? —' }) {
  return (
    <select className={className} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} aria-label="Catégorie">
      <option value="">{emptyLabel}</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nom}
        </option>
      ))}
    </select>
  );
}

export const TYPE_OPTIONS = [
  ['outillage', '🔧 Outillage'],
  ['consommable', '⚙️ Conso.'],
  ['materiel', '📦 Matériel'],
];
