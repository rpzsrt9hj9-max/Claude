import { useMemo, useState } from 'react';
import { findSimilar, findSameName, STRONG } from '../../shared/match.js';
import { suggestCategorie } from '../../shared/categories.js';
import { TYPES, TYPE_ICON } from '../../shared/schema.js';
import { estBatterie, estChargeur } from '../../shared/accessoires.js';
import { createArticle } from '../actions.js';
import { Button, CategorieSelect, LieuSelect, Segmented, TYPE_OPTIONS } from './ui.jsx';

/**
 * Création d'un article avec contrôle anti-doublons et catégorie proposée automatiquement.
 * Si une ressemblance forte existe, la création demande une confirmation explicite.
 */
export function ArticleCreator({ nom, articles, lieux, categories = [], defaultType = 'materiel', onUseExisting, onCreated, onCancel }) {
  // Une batterie ou un chargeur est un accessoire, quel que soit l'onglet d'où on le crée.
  const [type, setType] = useState(estBatterie({ nom }) || estChargeur({ nom }) ? 'accessoire' : defaultType);
  const [aAcheterCoche, setAAcheter] = useState(false);
  const [lieuId, setLieuId] = useState(null);
  const suggested = useMemo(() => suggestCategorie(nom, { categories, articles }), [nom, categories, articles]);
  const [categorieId, setCategorieId] = useState(suggested?.id ?? null);
  const [unite, setUnite] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');

  const same = useMemo(() => findSameName(nom, articles), [nom, articles]);
  const similar = useMemo(() => findSimilar(nom, articles), [nom, articles]);
  const strong = similar.some((m) => m.score >= STRONG);
  const mustConfirm = strong && !confirmed;

  const create = async () => {
    try {
      const id = await createArticle({ nom, type, lieu_id: lieuId, categorie_id: categorieId, unite, a_acheter: aAcheterCoche }, articles);
      onCreated(id);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border-2 border-sky-500 bg-white p-3 dark:bg-slate-900">
      {(same || similar.length > 0) && (
        <div className={`rounded-xl p-3 ${strong ? 'bg-amber-100 dark:bg-amber-500/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
          <p className="mb-2 font-semibold">{same ? 'Cet article existe déjà :' : 'Vouliez-vous dire :'}</p>
          <ul className="space-y-2">
            {(same ? [{ article: same }] : similar).map(({ article }) => (
              <li key={article.id} className="flex items-center gap-2">
                <span className="flex-1 font-medium">
                  {TYPE_ICON[article.type]} {article.nom} <span className="text-xs text-slate-500">({TYPES[article.type]})</span>
                </span>
                <Button variant="primary" onClick={() => onUseExisting(article.id)}>
                  Utiliser celui-là
                </Button>
              </li>
            ))}
          </ul>
          {!same && strong && !confirmed && (
            <Button variant="ghost" className="mt-2 w-full" onClick={() => setConfirmed(true)}>
              Non, c'est un autre article
            </Button>
          )}
        </div>
      )}

      {!same && !mustConfirm && (
        <>
          <p className="font-semibold">Nouvel article : « {nom.trim()} »</p>
          <div className="-mx-1 overflow-x-auto px-1">
            <Segmented options={TYPE_OPTIONS} value={type} onChange={setType} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <LieuSelect lieux={lieux} value={lieuId} onChange={setLieuId} />
            <CategorieSelect categories={categories} value={categorieId} onChange={setCategorieId} />
          </div>
          {suggested && categorieId === suggested.id && <p className="-mt-1 text-xs text-slate-500">Catégorie proposée automatiquement</p>}
          <input className="w-full" placeholder="Unité (facultatif : pièce, m, L…)" value={unite} onChange={(e) => setUnite(e.target.value)} aria-label="Unité" />
          <label className="flex min-h-11 items-center gap-3 rounded-xl bg-amber-50 px-3 dark:bg-amber-500/10">
            <input type="checkbox" className="size-6 !min-h-0" checked={aAcheterCoche} onChange={(e) => setAAcheter(e.target.checked)} />
            <span className="font-medium">🛒 Je ne l'ai pas : à acheter</span>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button variant="primary" className="flex-1" icon="plus" onClick={create}>
              Créer et ajouter
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Annuler
            </Button>
          </div>
        </>
      )}
      {(same || mustConfirm) && (
        <Button variant="ghost" className="w-full" onClick={onCancel}>
          Annuler
        </Button>
      )}
    </div>
  );
}
