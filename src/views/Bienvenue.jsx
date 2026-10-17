import { useState } from 'react';
import { useData } from '../data.js';
import { Button, Icon } from '../components/ui.jsx';
import { ChoixCatalogue, useCatalogue } from './CatalogueImport.jsx';
import { terminerBienvenue } from '../actions.js';

/** Premier démarrage d'un nouveau compte : transparence sur l'accès administrateur, puis choix du départ. */
export function Bienvenue({ onTermine }) {
  const { data, user } = useData();
  const { chargement, catalogue, erreur } = useCatalogue();
  const [etape, setEtape] = useState('accueil');
  const [envoi, setEnvoi] = useState(false);
  const gestionnaire = catalogue?.proprietaire || "Le gestionnaire de l'appli";

  const terminer = async (choix) => {
    setEnvoi(true);
    try {
      await terminerBienvenue(choix ? catalogue : null, choix, data);
      onTermine();
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="safe-top safe-bottom fixed inset-0 z-[55] overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-xl space-y-5 p-5">
        {etape === 'accueil' ? (
          <>
            <div className="pt-6 text-center">
              <div className="mb-2 text-5xl">👋</div>
              <h1 className="text-2xl font-bold">Bienvenue{user?.nom ? ` ${user.nom}` : ''} !</h1>
              <p className="mt-1 text-slate-500">Prépare tes tâches, interventions et déplacements, avec le matériel qu'il faut.</p>
            </div>
            <p className="flex gap-3 rounded-2xl bg-violet-100 p-3 text-sm text-violet-900 dark:bg-violet-500/20 dark:text-violet-200">
              <Icon name="eye" className="mt-0.5 size-5 shrink-0" />
              <span>
                <b>{gestionnaire}</b>, qui gère l'appli, peut consulter et modifier tes données pour t'aider et améliorer l'appli. Personne d'autre ne les voit.
              </span>
            </p>
            <h2 className="pt-2 text-lg font-semibold">Par quoi veux-tu commencer ?</h2>
            <Button variant="primary" icon="check" className="w-full !min-h-16 text-lg" disabled={envoi} onClick={() => terminer(null)}>
              Partir de zéro
            </Button>
            <p className="-mt-3 text-sm text-slate-500">Seules les catégories de base (Plomberie, Peinture…) sont déjà là.</p>
            <Button className="w-full !min-h-16 text-lg" disabled={envoi || chargement || !!erreur} onClick={() => setEtape('catalogue')}>
              {chargement ? 'Chargement du catalogue…' : `Reprendre une partie du catalogue de ${catalogue?.proprietaire || 'l’administrateur'}`}
            </Button>
            <p className="-mt-3 text-sm text-slate-500">
              {erreur ? `Catalogue indisponible : ${erreur}` : "Tu choisis les outils, consommables, matériel et tâches types à copier. Rien d'autre n'est copié : ni lieux, ni notes, ni biens, ni tâches, ni photos."}
            </p>
          </>
        ) : (
          <>
            <button type="button" className="flex min-h-11 items-center gap-1 font-medium text-sky-700 dark:text-sky-400" onClick={() => setEtape('accueil')}>
              <Icon name="back" /> Retour
            </button>
            <h1 className="text-2xl font-bold">Catalogue de {catalogue.proprietaire || "l'administrateur"}</h1>
            <p className="text-sm text-slate-500">Coche ce que tu veux reprendre. Tu pourras en ajouter d'autres plus tard, dans Plus.</p>
            <ChoixCatalogue catalogue={catalogue} envoi={envoi} libelle="Reprendre et commencer" onValider={terminer} />
          </>
        )}
      </div>
    </div>
  );
}
