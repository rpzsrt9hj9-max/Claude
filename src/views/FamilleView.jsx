import { useCallback, useEffect, useState } from 'react';
import { useData } from '../data.js';
import { Button, Empty, Icon } from '../components/ui.jsx';
import { demarrerObservation } from '../db.js';
import { shareText } from '../export.js';
import { changerCode, etatInscriptions, lireCode, listerComptes, listerRetours, marquerRetour } from '../famille.js';

const jour = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const nomDe = (c) => c?.nom || c?.email?.split('@')[0] || 'Sans nom';

/** Administrateur : inviter des proches, voir et modifier leur espace, lire leurs retours. */
export function FamilleView() {
  const { user } = useData();
  const [comptes, setComptes] = useState([]);
  const [retours, setRetours] = useState([]);
  const [code, setCode] = useState('');
  const [reglages, setReglages] = useState(null);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    setErreur('');
    try {
      const [c, r, k] = await Promise.all([listerComptes(), listerRetours(), lireCode()]);
      setComptes(c);
      setRetours(r);
      setCode(k);
    } catch (e) {
      setErreur(navigator.onLine ? `${e.message} (le script SQL de la base est-il à jour ?)` : 'Hors ligne : cette page a besoin du réseau.');
    }
    etatInscriptions().then(setReglages).catch(() => setReglages(null));
  }, []);
  useEffect(() => {
    charger();
  }, [charger]);

  const lien = `${location.origin}${import.meta.env.BASE_URL}`;
  const message = `Rejoins-moi sur l'appli de préparation des interventions :\n${lien}\n\nClique sur « Créer un compte » et saisis ce code famille : ${code}`;
  const nomParId = new Map(comptes.map((c) => [c.id, nomDe(c)]));
  const autres = comptes.filter((c) => c.id !== user?.id);
  const nonLus = retours.filter((r) => !r.lu).length;

  const modifierCode = async () => {
    const v = prompt('Nouveau code famille (lettres et chiffres) :', code);
    if (!v?.trim()) return;
    try {
      await changerCode(v);
      setCode(v.trim().toUpperCase());
    } catch (e) {
      alert(e.message);
    }
  };
  const basculerLu = async (r) => {
    setRetours((l) => l.map((x) => (x.id === r.id ? { ...x, lu: !x.lu } : x)));
    try {
      await marquerRetour(r.id, !r.lu);
    } catch (e) {
      alert(e.message);
      charger();
    }
  };

  return (
    <div className="space-y-5">
      {erreur && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-800 dark:bg-red-500/20 dark:text-red-200">{erreur}</p>}

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
        <h2 className="text-lg font-bold">Inviter un proche</h2>
        <p className="text-sm text-slate-500">Il ouvre le lien, choisit « Créer un compte » et saisit le code famille.</p>
        <div className="rounded-xl bg-slate-100 p-3 text-center dark:bg-slate-800">
          <p className="text-xs text-slate-500 uppercase">Code famille</p>
          <p className="font-mono text-3xl font-bold tracking-widest">{code || '…'}</p>
        </div>
        <p className="text-xs break-all text-slate-500">{lien}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" icon="send" disabled={!code} onClick={() => shareText(message)}>
            Partager
          </Button>
          <Button icon="edit" onClick={modifierCode}>
            Changer le code
          </Button>
        </div>
        {reglages && (
          <ul className="space-y-1 text-sm">
            <li className={reglages.inscriptionsOuvertes ? 'text-emerald-700 dark:text-emerald-400' : 'font-semibold text-red-600'}>
              {reglages.inscriptionsOuvertes ? '✓ Inscriptions ouvertes dans Supabase' : '✗ Inscriptions fermées dans Supabase : à ouvrir (Authentication → Sign In / Providers → « Allow new users to sign up »)'}
            </li>
            <li className={reglages.confirmationEmail ? 'font-semibold text-amber-600' : 'text-emerald-700 dark:text-emerald-400'}>
              {reglages.confirmationEmail ? '⚠ Confirmation par e-mail activée : à désactiver (Authentication → Sign In / Providers → Email → « Confirm email »)' : '✓ Pas de confirmation par e-mail'}
            </li>
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Comptes ({comptes.length})</h2>
        <p className="text-sm text-slate-500">« Voir et modifier » ouvre l'espace de la personne comme elle le voit. Les commentaires que tu ajoutes portent la mention « (admin) ».</p>
        {autres.length === 0 && <Empty>Aucun autre compte pour l'instant.</Empty>}
        <ul className="space-y-2">
          {autres.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
              <Icon name="users" className="size-6 shrink-0 text-sky-600" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{nomDe(c)}</span>
                <span className="block truncate text-xs text-slate-500">
                  {c.email} · inscrit le {jour(c.created_at)}
                </span>
              </span>
              <Button icon="eye" onClick={() => demarrerObservation(c)}>
                Voir
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">
          Retours {nonLus > 0 && <span className="ml-1 rounded-full bg-amber-500 px-2 py-0.5 text-xs text-white">{nonLus} nouveau{nonLus > 1 ? 'x' : ''}</span>}
        </h2>
        {retours.length === 0 && <Empty>Aucun retour pour l'instant.</Empty>}
        <ul className="space-y-2">
          {retours.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => basculerLu(r)} className={`w-full rounded-2xl p-3 text-left shadow-sm ${r.lu ? 'bg-slate-100 opacity-70 dark:bg-slate-900/50' : 'bg-white ring-2 ring-amber-400 dark:bg-slate-900'}`}>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{nomParId.get(r.user_id) ?? 'Inconnu'}</span>
                  <span>{jour(r.created_at)}</span>
                  {r.ecran && <span>· {r.ecran}</span>}
                  {r.version && <span>· {r.version}</span>}
                  <span className="ml-auto">{r.lu ? '✓ lu' : 'toucher pour marquer lu'}</span>
                </span>
                <span className="mt-1 block whitespace-pre-wrap">{r.texte}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
