import { useState } from 'react';
import { useData } from '../data.js';
import { ACTIVITES, ORDRE_ACTIVITES, duree, formatDuree } from '../../shared/temps.js';
import { BoutonsActivites, ListePeriodes, PeriodeEditor } from '../components/Chrono.jsx';
import { changerReglage, useReglages } from '../reglages.js';
import { activerNotifications, notificationsPossibles, useMaintenant } from '../chrono.js';
import { Button, Segmented } from '../components/ui.jsx';

const JOUR = 86_400_000;

/** Plus > Suivi du temps : toutes les périodes (planification du catalogue comprise), totaux, notification Android. */
export function SuiviTemps() {
  const { data } = useData();
  const [plage, setPlage] = useState('semaine');
  const [edition, setEdition] = useState(null);
  const [notif, setNotif] = useState(() => (notificationsPossibles() ? Notification.permission : 'impossible'));
  const maintenant = useMaintenant(true);
  const { tauxHoraire } = useReglages();
  const debut = plage === 'jour' ? new Date().setHours(0, 0, 0, 0) : plage === 'semaine' ? maintenant - 7 * JOUR : 0;
  const periodes = (data.temps || []).filter((t) => !t.deleted && t.debut >= debut);
  const total = periodes.reduce((s, p) => s + duree(p, maintenant), 0);
  const parAct = {};
  for (const p of periodes) parAct[p.activite] = (parAct[p.activite] || 0) + duree(p, maintenant);
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <p className="text-sm text-slate-500">Hors déplacement (plans, devis, commandes, rangement…) :</p>
        <BoutonsActivites ctx={{ contexte: 'general' }} activites={['etude', 'planification', 'achats', 'rangement']} />
      </section>
      <Segmented options={[['jour', "Aujourd'hui"], ['semaine', '7 jours'], ['tout', 'Tout']]} value={plage} onChange={setPlage} />
      <section className="space-y-1 rounded-2xl bg-white p-3 text-sm shadow-sm dark:bg-slate-900">
        <h2 className="flex justify-between text-base font-semibold">
          Total <span>{formatDuree(total)}</span>
        </h2>
        {ORDRE_ACTIVITES.filter((a) => parAct[a]).map((a) => (
          <div key={a} className="flex justify-between">
            <span>
              {ACTIVITES[a].icone} {ACTIVITES[a].nom}
            </span>
            <b>{formatDuree(parAct[a])}</b>
          </div>
        ))}
        {!total && <p className="text-slate-500">Rien de compté sur cette période. Lance un chrono avec ⏱ dans un déplacement ou une intervention.</p>}
      </section>
      <ListePeriodes periodes={periodes} onEdit={setEdition} />
      <Button icon="plus" className="w-full" onClick={() => setEdition('nouvelle')}>
        Ajouter une période oubliée
      </Button>
      <label className="flex items-center gap-3 rounded-2xl bg-white p-3 text-sm shadow-sm dark:bg-slate-900">
        <span className="flex-1">
          <span className="block text-base font-semibold">Taux horaire</span>
          <span className="text-slate-500">Pour le coût dans le rapport d'intervention (vide = pas de coût). Réglage de cet appareil.</span>
        </span>
        <input className="w-24 text-right" inputMode="decimal" placeholder="€/h" value={tauxHoraire || ''} onChange={(e) => changerReglage('tauxHoraire', Number(e.target.value.replace(',', '.')) || 0)} aria-label="Taux horaire en euros" />
      </label>
      <section className="space-y-2 rounded-2xl bg-white p-3 text-sm shadow-sm dark:bg-slate-900">
        <h2 className="text-base font-semibold">Notification du chrono</h2>
        {notif === 'impossible' ? (
          <p className="text-slate-500">Ce téléphone ne permet pas de notification pour une appli web (sur iPhone : le bandeau du chrono reste dans l’appli, et le temps compte même appli fermée).</p>
        ) : notif === 'granted' ? (
          <p className="text-emerald-700 dark:text-emerald-400">✓ Activée : sur Android, une notification « ⏱ … » avec Pause / Stop s’affiche pendant le chrono.</p>
        ) : (
          <>
            <p className="text-slate-500">Android : affiche le chrono dans les notifications, avec Pause et Stop. (Sur iPhone, ce n’est pas possible pour une appli web.)</p>
            <Button onClick={async () => setNotif(await activerNotifications())}>Activer la notification</Button>
          </>
        )}
      </section>
      {edition && <PeriodeEditor periode={edition === 'nouvelle' ? null : edition} onClose={() => setEdition(null)} />}
    </div>
  );
}
