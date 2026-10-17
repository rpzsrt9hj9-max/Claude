// Réglages de l'appareil (pas synchronisés : dense sur le téléphone, standard sur l'ordinateur).
import { useEffect, useState } from 'react';

const CLE = 'reglages-appareil';
const DEFAUTS = {
  dense: false, // Affichage : Standard / Dense
  ajoutRapide: true, // champ « Ajout rapide » en haut de la liste des tâches
  suppression: 'glisser', // 'glisser' (vers la gauche : partiel = retirer, complet = supprimer) ou 'croix' (petites croix bleue / rouge)
  // Options développeur
  bloquerPrisSiAAcheter: true, // dans « Charger », un article à acheter ne se coche « pris » qu'après achat
  filtresVisibles: false, // catalogue : filtres toujours affichés (sinon derrière le bouton « Filtres »)
};

function lire() {
  try {
    return { ...DEFAUTS, ...JSON.parse(localStorage.getItem(CLE) || '{}') };
  } catch {
    return { ...DEFAUTS };
  }
}

let courant = lire();
const abonnes = new Set();

export function changerReglage(cle, valeur) {
  courant = { ...courant, [cle]: valeur };
  try {
    localStorage.setItem(CLE, JSON.stringify(courant));
  } catch {
    /* rien */
  }
  abonnes.forEach((f) => f(courant));
}

export const reglages = () => courant;

export function useReglages() {
  const [r, setR] = useState(courant);
  useEffect(() => {
    abonnes.add(setR);
    return () => abonnes.delete(setR);
  }, []);
  return r;
}
