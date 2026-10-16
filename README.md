# Préparation de déplacements chantier / entretien

PWA mobile pour relier **tâches**, **matériel**, **outillage** et **lieux de stockage**, avec calcul automatique des quantités et de l'état « prête ».

En ligne : https://rpzsrt9hj9-max.github.io/Claude/deplacements/

## Architecture

| Besoin | Choix |
|---|---|
| Interface | React + Vite + Tailwind, PWA installable (vite-plugin-pwa) |
| Hébergement | GitHub Pages (fichiers statiques du dossier `dist/`, publiés dans `deplacements/`) |
| Données | Supabase (PostgreSQL) ; accès réservé aux comptes connectés (RLS) |
| Hors ligne | Copie locale complète dans IndexedDB (Dexie) ; modifications en file d'attente, envoyées au retour du réseau |
| Conflits | « Dernière modification gagne » selon l'horodatage `updated_at`, appliquée par un trigger dans la base |

La logique métier est dans `shared/` et testée dans `tests/` :
- `calc.js` : quantités (somme pour le matériel, maximum pour l'outillage, réglable par article), état pris / à compléter, tâche prête.
- `match.js` : anti-doublons (casse, accents, pluriel, « 12 v » = « 12V », Levenshtein + trigrammes ; Ø30 ≠ Ø40).
- `ops.js` : fusion d'articles, duplication de déplacement.

## Installation de Supabase (une seule fois)

1. Créer un projet gratuit sur https://supabase.com.
2. **SQL Editor** > New query : coller `supabase/schema.sql` (structure seule) puis **Run**.
   Le jeu de départ personnel est fourni à part, hors du dépôt (`installation-supabase.sql`).
3. **Authentication > Users > Add user** : créer ton compte (e-mail + mot de passe).
4. **Authentication > Sign In / Providers** : désactiver « Allow new users to sign up ».
5. **Project Settings > API** : recopier l'URL du projet et la clé `anon` / publishable dans `src/supabase.js`.

## Développement

```bash
npm install
npm run dev        # http://localhost:5173/Claude/deplacements/
npm test           # tests unitaires
npm run build      # produit dist/ à copier dans deplacements/ sur la branche GitHub Pages
```

## Bon à savoir

- Un projet Supabase gratuit est mis **en pause après 7 jours sans activité**. Il se réactive en un clic depuis le tableau de bord Supabase ; les données sont conservées. L'appli reste utilisable hors ligne en attendant.
- Sauvegardes : Plus → Exporter (CSV et JSON complet).
- Le dépôt est public : aucune donnée personnelle dans le code. La clé `anon` publiée est prévue pour ça ; les règles RLS bloquent tout accès sans connexion.
