import { useEffect, useState } from 'react';
import { Button } from '../components/ui.jsx';
import { creerCleSheet, etatCleSheet, revoquerCleSheet } from '../famille.js';

const URL_SCRIPT = 'https://raw.githubusercontent.com/rpzsrt9hj9-max/Claude/claude/deplacements-app/google-sheet/Code.gs';
const dateHeure = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'jamais');

/** Plus > Google Sheet du catalogue : clé de synchro (créer, copier, révoquer) et mode d'emploi. */
export function SheetView() {
  const [etat, setEtat] = useState(undefined); // undefined = chargement, null = pas de clé
  const [cle, setCle] = useState('');
  const [copie, setCopie] = useState(false);
  const [erreur, setErreur] = useState('');
  const charger = () => etatCleSheet().then(setEtat).catch((e) => setErreur(e.message));
  useEffect(() => {
    charger();
  }, []);

  const creer = async () => {
    if (etat && !confirm('Remplacer la clé ? L’ancienne ne fonctionnera plus : il faudra coller la nouvelle dans le Sheet.')) return;
    setErreur('');
    try {
      setCle(await creerCleSheet());
      setCopie(false);
      charger();
    } catch (e) {
      setErreur(e.message);
    }
  };
  const revoquer = async () => {
    if (!confirm('Révoquer la clé ? Le Sheet ne pourra plus se synchroniser.')) return;
    await revoquerCleSheet().catch((e) => setErreur(e.message));
    setCle('');
    charger();
  };
  const copier = async (texte) => {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
    } catch {
      setCopie(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-slate-600 dark:text-slate-300">
        Un Google Sheet relié au catalogue : tu ajoutes, modifies ou supprimes des articles en masse dans le Sheet, puis « 🔄 Appli &gt; Synchroniser maintenant ». Ça marche dans les deux sens.
      </p>

      <section className="space-y-3 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
        <h2 className="font-semibold">🔑 Clé de synchro</h2>
        {etat === undefined && !erreur && <p className="text-sm text-slate-500">Chargement…</p>}
        {etat === null && !cle && <p className="text-sm text-slate-500">Aucune clé pour l’instant.</p>}
        {etat && (
          <p className="text-sm text-slate-500">
            Clé créée le {dateHeure(etat.creee_le)} · dernière synchro : {dateHeure(etat.utilisee_le)}
          </p>
        )}
        {cle && (
          <div className="space-y-2 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 dark:bg-amber-500/10">
            <p className="text-sm font-semibold">Copie-la maintenant : elle ne sera plus affichée.</p>
            <code className="block rounded-lg bg-white p-2 text-xs break-all select-all dark:bg-slate-950">{cle}</code>
            <Button variant="primary" className="w-full" onClick={() => copier(cle)}>
              {copie ? '✓ Copiée' : 'Copier la clé'}
            </Button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant={etat ? 'secondary' : 'primary'} onClick={creer}>
            {etat ? 'Nouvelle clé' : 'Créer une clé'}
          </Button>
          {etat && (
            <Button variant="ghost" className="!text-red-600" onClick={revoquer}>
              Révoquer
            </Button>
          )}
        </div>
        <p className="text-xs text-slate-500">La clé ne donne accès qu’au catalogue (articles, lieux, catégories, items à proposer, stock) : jamais aux tâches, biens ni photos.</p>
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      </section>

      <section className="space-y-2 rounded-2xl bg-white p-3 text-sm shadow-sm dark:bg-slate-900">
        <h2 className="text-base font-semibold">Mise en place (une seule fois, sur ordinateur)</h2>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Crée un Google Sheet vide (sheets.new).</li>
          <li>
            Menu <b>Extensions &gt; Apps Script</b>, efface le contenu et colle le script :{' '}
            <a className="font-medium text-sky-700 underline dark:text-sky-400" href={URL_SCRIPT} target="_blank" rel="noreferrer">
              ouvrir le script
            </a>{' '}
            (tout sélectionner, copier). Enregistre (💾).
          </li>
          <li>Recharge le Sheet : un menu <b>🔄 Appli</b> apparaît. Google demande une autorisation la première fois (c’est ton propre script).</li>
          <li>
            <b>🔄 Appli &gt; Saisir la clé</b> : colle la clé ci-dessus.
          </li>
          <li>
            <b>🔄 Appli &gt; Synchroniser maintenant</b> : ton catalogue arrive dans l’onglet « Catalogue ».
          </li>
        </ol>
        <p className="text-slate-500">
          Ensuite : ajoute des lignes, modifie, supprime, puis synchronise. Une suppression d’article déjà utilisé dans une tâche demande confirmation. Chaque synchro est notée dans l’onglet « Journal ».
        </p>
      </section>
    </div>
  );
}
