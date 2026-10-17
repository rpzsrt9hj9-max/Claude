// Journal des versions affiché dans l'appli (Plus → Nouveautés) ; même contenu que CHANGELOG.md.
export const NOUVEAUTES = [
  {
    version: 'v4',
    date: '2026-10-17',
    titre: 'Famille, achats, accessoires et affichage dense',
    points: [
      'Comptes de la famille : chacun crée son compte avec le code famille et a son propre espace ; l’administrateur peut voir et modifier un compte (« Voir comme ») et lit les retours.',
      'Nouveau compte : écran de bienvenue, catégories de base, et reprise au choix d’une partie du catalogue de l’administrateur.',
      '« Envoyer un retour » dans Plus.',
      'Affichage dense (Plus → Affichage) : listes sur 2 lignes, cases plus petites (zone tactile conservée), bandeaux plus fins. Champ « Ajout rapide » affichable ou non.',
      'Plus de bandeau en haut ni de recherche globale : un point orange ou rouge sur « Plus » signale seulement un souci de synchronisation. Barre du bas plus basse.',
      'Références automatiques : T-0042 (tâches), I-0017 (interventions), D-0008 (déplacements).',
      'Interventions : nom personnalisé (« Bien A · rotation locataire »), crayon pour renommer, classement par bien ou par déplacement.',
      'Tâches : classement par bien, par déplacement ou par échéance ; plus de doublon déplacement / intervention.',
      'Déplacement : onglets Interventions · À prendre · Charger · À acheter. Intervention : Tâches · À sortir · À acheter · Récap. Lignes compactes, détails au toucher.',
      'Achats : article « à acheter » (pastille rouge sur Catalogue), coché « acheté » → rangé dans « Véhicule » → « Ranger à… ».',
      'Nouveau type « Accessoire » (batteries, forets, chargeurs). « Items à proposer » pour tout article ; une batterie par outil ; chargeurs jamais proposés ; batteries compatibles (marque + tension) pré-cochées.',
      'Catalogue : bouton Filtres (type, lieu, catégorie, achats, classement), recherche dans tous les types, quantité en stock, dupliquer un article, créer un lieu ou une catégorie depuis la fiche, listes d’ajout qui restent ouvertes.',
      'Rapport : description des tâches, étapes cochées ☑ et non cochées ☐, références.',
      'Options développeur (Plus) : blocage « pris » tant qu’un article est à acheter, filtres du catalogue toujours visibles.',
    ],
  },
  {
    version: 'v3',
    date: '2026-10-16',
    titre: 'Onglet Interventions',
    points: ['Barre du bas : Tâches · Interventions · Déplacements · Catalogue · Plus.', 'Liste de toutes les interventions (une par bien), quel que soit le déplacement.'],
  },
  {
    version: 'v2',
    date: '2026-10-16',
    titre: 'Déplacements',
    points: [
      'Un déplacement regroupe une intervention par bien, créées automatiquement.',
      'Chargement mis en commun pour tout le déplacement, liste « À sortir » par intervention.',
      'Tâches types : choix multiple, report des modifications sur les tâches ouvertes.',
      'Date de création des tâches, déplacement modifiable depuis la tâche, filtre « Non planifiées », cases « Rapport ».',
    ],
  },
  {
    version: 'v1',
    date: '2026-10-16',
    titre: 'Tâches et interventions',
    points: [
      'Liste générale des tâches : statut, échéance, étapes à cocher, commentaires avec photos.',
      'Interventions : choix des tâches par biens et par échéance, matériel à prendre, récap, clôture et rapport imprimable.',
    ],
  },
];
