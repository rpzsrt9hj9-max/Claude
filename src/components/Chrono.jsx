import { useEffect, useRef, useState } from 'react';
import { useData } from '../data.js';
import { write } from '../db.js';
import { ACTIVITES, ORDRE_ACTIVITES, bilan, chrono, duree, enCours, formatDuree } from '../../shared/temps.js';
import { uuid } from '../../shared/schema.js';
import {
  aReprendre, appliCachee, enPause, lancer, libelleContexte, oublierPause, oublierReprise, pause, reprendre, stop, suivreEcran, terminerA, useContexteActuel, useMaintenant,
} from '../chrono.js';
import { useReglages } from '../reglages.js';
import { Button, Icon, Sheet } from './ui.jsx';
import { Glissable } from './Glissable.jsx';
import { avecAnnulation } from '../annulation.js';

const TROIS_HEURES = 3 * 3_600_000;

/**
 * Bandeau du chrono, au-dessus de la barre du bas, et « moteur » : suit l'écran (planification, mode automatique),
 * s'arrête quand l'appli est cachée, propose de reprendre, gère les boutons de la notification Android.
 */
export function BandeauChrono({ data, onHauteur }) {
  const actif = enCours(data.temps);
  const maintenant = useMaintenant(!!actif);
  const ctx = useContexteActuel();
  const dataRef = useRef(data);
  dataRef.current = data;
  const [reprise, setReprise] = useState(aReprendre);
  const [vuePause, setVuePause] = useState(enPause);
  const [correction, setCorrection] = useState(false);

  // L'écran change : la planification (ou le mode automatique) suit.
  useEffect(() => {
    suivreEcran(ctx, dataRef.current);
  }, [ctx]);

  useEffect(() => {
    const vis = async () => {
      if (document.visibilityState === 'hidden') await appliCachee(dataRef.current);
      else {
        setReprise(aReprendre());
        suivreEcran(ctx, dataRef.current);
      }
    };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, [ctx]);

  // Boutons de la notification (Android) : le service worker prévient l'appli, ou l'ouvre avec #chrono=…
  useEffect(() => {
    const agir = (a) => (a === 'pause' ? pause(dataRef.current) : a === 'stop' ? stop(dataRef.current) : null);
    const m = location.hash.match(/chrono=(pause|stop)/);
    if (m) {
      agir(m[1]);
      history.replaceState(null, '', location.pathname + location.search);
    }
    const msg = (e) => e.data?.chrono && agir(e.data.chrono);
    navigator.serviceWorker?.addEventListener('message', msg);
    return () => navigator.serviceWorker?.removeEventListener('message', msg);
  }, []);

  useEffect(() => setVuePause(actif ? null : enPause()), [actif?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = actif || vuePause || reprise;
  useEffect(() => onHauteur?.(visible ? 1 : 0), [visible, onHauteur]);
  if (!visible) return null;

  const contenu = (() => {
    if (reprise && !actif) {
      const a = ACTIVITES[reprise.activite];
      return (
        <>
          <span className="min-w-0 flex-1 truncate">
            {a.icone} Reprendre {a.nom.toLowerCase()} ?
          </span>
          <button type="button" className="min-h-9 rounded-lg bg-sky-500 px-3 font-bold" onClick={() => { reprendre(reprise, data); setReprise(null); }}>
            ▶ Reprendre
          </button>
          <button type="button" aria-label="Non" className="flex size-9 items-center justify-center" onClick={() => { oublierReprise(); setReprise(null); }}>
            <Icon name="x" className="size-4" />
          </button>
        </>
      );
    }
    if (actif) {
      const a = ACTIVITES[actif.activite] ?? ACTIVITES.planification;
      const ms = duree(actif, maintenant);
      const long = actif.activite !== 'planification' && ms > TROIS_HEURES;
      return (
        <>
          <button type="button" className="flex min-h-9 min-w-0 flex-1 items-center gap-2 text-left" onClick={() => long && setCorrection(true)}>
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
            </span>
            <span className="min-w-0 truncate">
              {a.icone} <b>{a.nom}</b>
              {libelleContexte(actif, data) && <span className="opacity-80"> · {libelleContexte(actif, data)}</span>}
            </span>
            <span className={`ml-auto shrink-0 font-mono tabular-nums ${long ? 'text-amber-300' : ''}`}>{chrono(ms)}</span>
          </button>
          {long && (
            <button type="button" className="min-h-9 rounded-lg bg-amber-500 px-2 text-xs font-bold text-slate-900" onClick={() => setCorrection(true)}>
              Corriger ?
            </button>
          )}
          <button type="button" aria-label="Pause" className="flex size-9 shrink-0 items-center justify-center rounded-lg active:bg-white/10" onClick={() => pause(data)}>
            ⏸
          </button>
          <button type="button" aria-label="Arrêter" className="flex size-9 shrink-0 items-center justify-center rounded-lg active:bg-white/10" onClick={() => stop(data)}>
            ⏹
          </button>
        </>
      );
    }
    const a = ACTIVITES[vuePause.activite];
    return (
      <>
        <span className="min-w-0 flex-1 truncate opacity-90">
          ⏸ En pause : {a.icone} {a.nom}
          {libelleContexte(vuePause.ctx, data) && ` · ${libelleContexte(vuePause.ctx, data)}`}
        </span>
        <button type="button" className="min-h-9 rounded-lg bg-sky-500 px-3 font-bold" onClick={() => reprendre(vuePause, data)}>
          ▶
        </button>
        <button type="button" aria-label="Oublier" className="flex size-9 items-center justify-center" onClick={() => { oublierPause(); setVuePause(null); }}>
          <Icon name="x" className="size-4" />
        </button>
      </>
    );
  })();

  return (
    <>
      <div className="flex min-h-10 items-center gap-1 bg-slate-800 px-3 text-sm text-white dark:bg-slate-700">{contenu}</div>
      {correction && actif && <CorrigerFin periode={actif} onClose={() => setCorrection(false)} />}
    </>
  );
}

const versChamp = (ms) => {
  const d = new Date(ms);
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
};
const depuisChamp = (v) => (v ? new Date(v).getTime() : null);

/** Le chrono tourne depuis longtemps : il s'est peut-être arrêté plus tôt. */
function CorrigerFin({ periode, onClose }) {
  const { data } = useData();
  const [fin, setFin] = useState(versChamp(Math.min(Date.now(), periode.debut + 3_600_000)));
  const a = ACTIVITES[periode.activite];
  return (
    <Sheet title="Chrono oublié ?" onClose={onClose}>
      <div className="space-y-3">
        <p>
          {a.icone} {a.nom} tourne depuis {formatDuree(Date.now() - periode.debut)}.
        </p>
        <Button className="w-full" onClick={onClose}>
          C'est normal, il continue
        </Button>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Il s'est arrêté à :</span>
          <input type="datetime-local" className="w-full" value={fin} min={versChamp(periode.debut)} onChange={(e) => setFin(e.target.value)} />
        </label>
        <Button variant="primary" className="w-full" onClick={async () => { await terminerA(data, depuisChamp(fin)); onClose(); }}>
          Arrêter à cette heure
        </Button>
      </div>
    </Sheet>
  );
}

/** Bouton ⏱ des en-têtes (déplacement, intervention) : choisir l'activité à chronométrer. */
export function BoutonChrono({ ctx, taches = [] }) {
  const { chronoInterface } = useReglages();
  const [ouvert, setOuvert] = useState(false);
  if (chronoInterface === 'onglet') return null;
  return (
    <>
      <Button variant="ghost" className="!px-2 text-lg" aria-label="Chronométrer" onClick={() => setOuvert(true)}>
        ⏱
      </Button>
      {ouvert && <ChoixActivite ctx={ctx} taches={taches} onClose={() => setOuvert(false)} />}
    </>
  );
}

/** Boutons d'activités (Trajet, Préparation…), et les tâches si on est dans une intervention. */
export function BoutonsActivites({ ctx, taches = [], onLance }) {
  const { data } = useData();
  const actif = enCours(data.temps);
  const go = async (activite, c = ctx) => {
    await lancer(activite, c, data);
    onLance?.();
  };
  const estActif = (act, tacheId = null) => actif && actif.activite === act && (actif.tache_id ?? null) === tacheId && (actif.voyage_id ?? null) === (ctx.voyage_id ?? null);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {ORDRE_ACTIVITES.filter((a) => a !== 'tache').map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => go(a)}
            className={`flex min-h-12 items-center gap-2 rounded-xl px-3 text-left font-medium shadow-sm ${estActif(a) ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-900'}`}
          >
            <span className="text-xl">{ACTIVITES[a].icone}</span> {ACTIVITES[a].nom}
          </button>
        ))}
      </div>
      {taches.length > 0 && (
        <>
          <p className="pt-1 text-sm font-semibold text-slate-500">🔨 Travailler sur une tâche</p>
          <ul className="space-y-1">
            {taches.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => go('tache', { ...ctx, tache_id: t.id, appartement_id: t.appartement_id ?? ctx.appartement_id ?? null })}
                  className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left shadow-sm ${estActif('tache', t.id) ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-900'}`}
                >
                  ▶ <span className="truncate">{t.titre}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ChoixActivite({ ctx, taches, onClose }) {
  return (
    <Sheet title="Chronométrer" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-500">Un seul chrono à la fois : en lancer un arrête le précédent.</p>
      <BoutonsActivites ctx={ctx} taches={taches} onLance={onClose} />
    </Sheet>
  );
}

/** ▶ / ⏸ sur une tâche d'intervention. */
export function BoutonTacheChrono({ tache, ctx }) {
  const { data } = useData();
  const { chronoInterface } = useReglages();
  if (chronoInterface === 'onglet') return null;
  const actif = enCours(data.temps);
  const enMarche = actif?.activite === 'tache' && actif.tache_id === tache.id;
  return (
    <button
      type="button"
      aria-label={enMarche ? `Pause sur ${tache.titre}` : `Travailler sur ${tache.titre}`}
      onClick={() => (enMarche ? pause(data) : lancer('tache', { ...ctx, tache_id: tache.id, appartement_id: tache.appartement_id ?? ctx.appartement_id ?? null }, data))}
      className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm ${enMarche ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
    >
      {enMarche ? '⏸' : '▶'}
    </button>
  );
}

/** Suggestion discrète (mode « un toucher + suggestions ») : « ▶ Lancer Préparation ». */
export function SuggestionChrono({ activite, ctx }) {
  const { data } = useData();
  const { chronoDemarrage } = useReglages();
  if (chronoDemarrage !== 'suggestions' || enCours(data.temps)) return null;
  const a = ACTIVITES[activite];
  return (
    <button type="button" onClick={() => lancer(activite, ctx, data)} className="flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-emerald-500 text-sm font-medium text-emerald-700 dark:text-emerald-400">
      ▶ Lancer le chrono : {a.icone} {a.nom}
    </button>
  );
}

/** Onglet « Temps » d'un déplacement : lancer, bilan (activités, biens, tâches), périodes modifiables. */
export function TempsView({ voyage, interventions, taches }) {
  const { data } = useData();
  const maintenant = useMaintenant(!!enCours(data.temps));
  const b = bilan(voyage.id, interventions.map((i) => ({ id: i.id, appartement_id: i.appartement_id })), data, maintenant);
  const [edition, setEdition] = useState(null); // période | 'nouvelle'
  const ctx = { voyage_id: voyage.id };
  const max = Math.max(1, ...Object.values(b.parActivite));
  return (
    <div className="space-y-4">
      <BoutonsActivites ctx={ctx} taches={taches} />
      <section className="space-y-2 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
        <h2 className="flex items-baseline justify-between font-semibold">
          Bilan <span className="text-xl font-bold">{formatDuree(b.total)}</span>
        </h2>
        {ORDRE_ACTIVITES.filter((a) => b.parActivite[a]).map((a) => (
          <div key={a} className="text-sm">
            <div className="flex justify-between">
              <span>
                {ACTIVITES[a].icone} {ACTIVITES[a].nom}
              </span>
              <b>{formatDuree(b.parActivite[a])}</b>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-2 rounded-full bg-sky-500" style={{ width: `${(b.parActivite[a] / max) * 100}%` }} />
            </div>
          </div>
        ))}
        {!b.total && <p className="text-sm text-slate-500">Aucun temps compté pour ce déplacement.</p>}
      </section>
      {b.total > 0 && (
        <section className="space-y-1 rounded-2xl bg-white p-3 text-sm shadow-sm dark:bg-slate-900">
          <h2 className="text-base font-semibold">Par bien</h2>
          <p className="text-xs text-slate-500">Temps commun (trajet, préparation…) réparti à parts égales entre les biens.</p>
          {b.parBien.map((x) => (
            <div key={x.id} className="flex justify-between border-t border-slate-100 py-1 dark:border-slate-800">
              <span>
                🏠 {x.nom}
                <span className="block text-xs text-slate-500">
                  {ORDRE_ACTIVITES.filter((a) => x.parActivite[a]).map((a) => `${ACTIVITES[a].icone} ${formatDuree(x.parActivite[a])}`).join(' · ')}
                </span>
              </span>
              <b>{formatDuree(x.ms)}</b>
            </div>
          ))}
          {b.parTache.length > 0 && <h2 className="pt-2 text-base font-semibold">Par tâche</h2>}
          {b.parTache.map((x) => (
            <div key={x.tache.id} className="flex justify-between border-t border-slate-100 py-1 dark:border-slate-800">
              <span className="min-w-0 truncate">🔨 {x.tache.titre}</span>
              <b>{formatDuree(x.ms)}</b>
            </div>
          ))}
        </section>
      )}
      <ListePeriodes periodes={b.periodes} onEdit={setEdition} />
      <Button icon="plus" className="w-full" onClick={() => setEdition('nouvelle')}>
        Ajouter une période oubliée
      </Button>
      {edition && <PeriodeEditor periode={edition === 'nouvelle' ? null : edition} ctx={ctx} interventions={interventions} taches={taches} onClose={() => setEdition(null)} />}
    </div>
  );
}

/** Liste des périodes (la plus récente en haut), supprimables par glissement. */
export function ListePeriodes({ periodes, onEdit }) {
  const { data } = useData();
  const maintenant = useMaintenant(periodes.some((p) => p.fin == null));
  const heure = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const jour = (ms) => new Date(ms).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const liste = [...periodes].sort((a, b) => b.debut - a.debut);
  if (!liste.length) return null;
  let dernierJour = '';
  return (
    <section className="space-y-1">
      <h2 className="font-semibold">Périodes</h2>
      <ul className="space-y-1">
        {liste.map((p) => {
          const a = ACTIVITES[p.activite] ?? ACTIVITES.planification;
          const j = jour(p.debut);
          const titreJour = j !== dernierJour ? (dernierJour = j) : null;
          return (
            <div key={p.id}>
              {titreJour && <p className="pt-1 text-xs font-bold text-slate-500 uppercase">{titreJour}</p>}
              <Glissable as="div" className="rounded-xl shadow-sm" fond="bg-white dark:bg-slate-900" supprimer={() => avecAnnulation([{ table: 'temps', row: { id: p.id, deleted: true } }], 'Période supprimée')}>
                <button type="button" onClick={() => onEdit(p)} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm">
                  <span className="shrink-0 text-lg">{a.icone}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {a.nom}
                      {libelleContexte(p, data) && <span className="font-normal text-slate-500"> · {libelleContexte(p, data)}</span>}
                    </span>
                    <span className="text-xs text-slate-500">
                      {heure(p.debut)} → {p.fin ? heure(p.fin) : 'en cours'}
                    </span>
                  </span>
                  <b className="shrink-0">{formatDuree(duree(p, maintenant))}</b>
                </button>
              </Glissable>
            </div>
          );
        })}
      </ul>
    </section>
  );
}

/** Modifier une période (activité, début, fin, tâche) ou en ajouter une oubliée. */
export function PeriodeEditor({ periode, ctx = {}, interventions = [], taches = [], onClose }) {
  const [f, setF] = useState(() => ({
    activite: periode?.activite ?? 'trajet',
    debut: versChamp(periode?.debut ?? Date.now() - 3_600_000),
    fin: periode?.fin ? versChamp(periode.fin) : periode ? '' : versChamp(Date.now()),
    tache_id: periode?.tache_id ?? '',
    intervention_id: periode?.intervention_id ?? '',
  }));
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const enregistrer = async () => {
    const debut = depuisChamp(f.debut);
    const fin = depuisChamp(f.fin);
    if (!debut || (fin && fin < debut)) return alert("L'heure de fin doit être après le début.");
    const tache = taches.find((t) => t.id === f.tache_id);
    const inter = interventions.find((i) => i.id === f.intervention_id);
    await write({
      table: 'temps',
      row: {
        ...(periode ?? { ...ctx, id: uuid(), contexte: ctx.contexte ?? null, note: null }),
        activite: f.activite,
        debut,
        fin,
        tache_id: f.tache_id || null,
        intervention_id: f.intervention_id || null,
        appartement_id: tache?.appartement_id ?? inter?.appartement_id ?? null,
        deleted: false,
      },
    });
    onClose();
  };
  const label = 'mb-1 block text-sm font-medium text-slate-600 dark:text-slate-400';
  return (
    <Sheet title={periode ? 'Modifier la période' : 'Ajouter une période'} onClose={onClose} footer={<Button variant="primary" icon="check" className="w-full text-lg" onClick={enregistrer}>Enregistrer</Button>}>
      <div className="space-y-3">
        <label className="block">
          <span className={label}>Activité</span>
          <select className="w-full" value={f.activite} onChange={set('activite')}>
            {ORDRE_ACTIVITES.map((a) => (
              <option key={a} value={a}>
                {ACTIVITES[a].icone} {ACTIVITES[a].nom}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-1 gap-2">
          <label className="block">
            <span className={label}>Début</span>
            <input type="datetime-local" className="w-full" value={f.debut} onChange={set('debut')} />
          </label>
          <label className="block">
            <span className={label}>Fin {periode && !periode.fin ? '(vide = toujours en cours)' : ''}</span>
            <input type="datetime-local" className="w-full" value={f.fin} onChange={set('fin')} />
          </label>
        </div>
        {interventions.length > 1 && (
          <label className="block">
            <span className={label}>Bien (sinon réparti entre tous)</span>
            <select className="w-full" value={f.intervention_id} onChange={set('intervention_id')}>
              <option value="">— Tous les biens du déplacement —</option>
              {interventions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nomAffiche ?? i.nom}
                </option>
              ))}
            </select>
          </label>
        )}
        {taches.length > 0 && (
          <label className="block">
            <span className={label}>Tâche</span>
            <select className="w-full" value={f.tache_id} onChange={set('tache_id')}>
              <option value="">— Aucune —</option>
              {taches.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.titre}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </Sheet>
  );
}
