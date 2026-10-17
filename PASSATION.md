# Note de passation — appli « Déplacements » (préparation de chantiers / entretien)

Rédigée le 16/10/2026 à la fin de la session locale (Claude Code desktop, Mac de l'utilisateur), pour reprise en session cloud.

## 1. Contexte utilisateur

- Investisseur immobilier (colocations, Airbnb, chantiers de rénovation) ; plusieurs biens dans différentes villes (noms des biens : voir la table `appartements` dans Supabase, ils ne doivent pas apparaître dans le dépôt public).
- **TDAH** : interface sobre, gros boutons (cibles ≥ 44 px), peu de clics, retour visuel immédiat, pas de menus profonds ni de longs formulaires. Utilisation **mobile d'abord**, souvent d'une main dans le coffre de la voiture, avec peu de réseau.
- Tout en **français** (interface, commentaires du code, messages).
- Il aime qu'on **pose des questions avant d'intégrer** de grosses fonctionnalités, avec une option recommandée.
- Cahier des charges d'origine : `cahier-des-charges-app-deplacements.md` (sur son Mac, dans Téléchargements ; résumé : tâches + matériel + outillage + lieux de stockage, « tâche prête » calculée, quantités sommées, anti-doublons, PWA hors ligne).

## 2. Où est quoi

| Élément | Emplacement |
|---|---|
| Dépôt GitHub (public !) | https://github.com/rpzsrt9hj9-max/Claude |
| Site GitHub Pages (« Mes petites applications ») | https://rpzsrt9hj9-max.github.io/Claude/ |
| Branche servie par Pages | `claude/thermal-insulation-simulator-8ibfbq` (index.html à la racine liste les applis ; chaque appli dans un sous-dossier : `horaires/`, `isolation/`) |
| Source de cette appli | branche `claude/deplacements-app`, dossier racine (cette note y est) |
| URL prévue de l'appli | https://rpzsrt9hj9-max.github.io/Claude/deplacements/ (**pas encore publiée**) |
| Base de données | Supabase, projet `fuaokqhgspgzzdklhvtn` → https://fuaokqhgspgzzdklhvtn.supabase.co |
| Clé publique (publishable) | `sb_publishable_lLUE3Ifwu_XBNh09BZryVw_uvfWNIKC` (déjà dans `src/supabase.js` ; publique par conception) |

Ne jamais demander ni stocker la clé `service_role` / secret.

## 3. Architecture

- **Front** : React 19 + Vite + Tailwind 4, PWA (vite-plugin-pwa, `base: '/Claude/deplacements/'` dans `vite.config.js`).
- **Données locales d'abord** : IndexedDB via Dexie (`src/db.js`). Chaque écriture locale met `_dirty = 1` et `updated_at = Date.now()`, puis une synchro est planifiée.
- **Synchro** (`src/db.js` → `sync()`) : envoi des lignes `_dirty` par `upsert` Supabase, puis réception de toutes les lignes `rev > dernière rev − 200` (marge de recouvrement). Synchro au démarrage, au retour du réseau, au retour au premier plan et toutes les 30 s.
- **« Dernière modification gagne »** : le trigger SQL `app_lww()` ignore une mise à jour plus ancienne (`updated_at`) que la ligne en base, mais lui donne quand même une nouvelle `rev` (le client récupère alors la bonne version). Séquence globale `app_rev`.
- **Aucune suppression physique** : `deleted = true`.
- **Auth** : Supabase e-mail + mot de passe ; inscriptions **désactivées** (vérifié) ; RLS : tout pour `authenticated`, rien pour `anon` (vérifié : l'accès anonyme renvoie « permission denied »). Le compte de l'utilisateur est créé dans Supabase.
- **Ids déterministes** pour les tables de liaison (`shared/schema.js`) : `tache~article`, `deplacement~article`, `article~accessoire`, pour éviter les doublons lors des synchros hors ligne.
- Mode démo local : `VITE_DEMO=1` (pas d'auth ni de synchro, `window.__db` exposé), pour tester l'interface sans Supabase.

### Fichiers clés
- `shared/schema.js` : **source unique du modèle** (tables, champs, types d'articles, ids).
- `shared/calc.js` : quantités (somme si `cumul_quantites`, sinon maximum), état pris (`vide / partiel / complet`), tâche prête, progression.
- `shared/match.js` : anti-doublons (normalisation accents/casse, pluriel, « 12 v » = « 12V », Levenshtein + trigrammes, Ø30 ≠ Ø40).
- `shared/categories.js` : 19 catégories par défaut + règles de suggestion automatique (l'ordre des règles compte).
- `shared/ops.js` : fusion d'articles, duplication de déplacement, copie de tâche, accessoires à proposer.
- `scripts/make-setup-sql.mjs` : génère `supabase/schema.sql` depuis `shared/schema.js` (idempotent : `create table if not exists` + `add column if not exists`). **Toute évolution du modèle = modifier `shared/schema.js`, régénérer, faire coller le SQL à l'utilisateur.**
- `tests/logic.test.js` : 21 tests vitest (`npm test`), tous verts.

## 4. Règles importantes

1. **Dépôt public** : aucune donnée personnelle dans le code (noms d'appartements, adresses, lieux, liste d'articles réelle). Les données de départ ont été importées par SQL collé à la main, hors dépôt. Les fichiers `installation-supabase.sql`, `correction-accents.sql`, `mise-a-jour-v2.sql`, `scripts/seed.local.js` et `scripts/*.local.mjs` sont dans `.gitignore` et **restent sur le Mac**.
2. **Migrations** : l'utilisateur colle le SQL dans Supabase (SQL Editor → New query → Run). Écrire du SQL **idempotent**. Pour les mises à jour de données, fixer `updated_at` à l'instant présent (sinon le trigger LWW les ignore côté client). Pour transmettre du SQL, l'afficher dans un bloc de code ou un fichier ; l'utilisateur a déjà eu un **bug d'accents** à cause d'un `pbcopy` sans `LANG=en_US.UTF-8`.
3. **Publication** (à faire) : `npm run build` puis copier `dist/*` dans `deplacements/` sur la branche Pages, et ajouter une carte « Préparation de déplacements » dans l'`index.html` racine de cette branche (même style que les cartes existantes). **Demander l'accord de l'utilisateur avant tout push.**
4. Un projet Supabase gratuit **se met en pause après 7 jours sans activité** (réactivation en un clic, données conservées). Une action GitHub planifiée pourrait faire un appel régulier pour l'éviter : c'est une idée à proposer, rien n'a été fait.

## 5. État actuel

### Fait et testé
- V1 : tâches par déplacement, onglets Matériel / Outillage avec grandes cases « Pris », quantités (× 4 pour 1 + 3 vis, perceuse × 1 pour 3 tâches), « à compléter » si la quantité augmente, tâche prête au vert, anti-doublons, fusion, lieux, appartements, duplication et clôture de déplacement, checklist de chargement, exports (WhatsApp, impression PDF, CSV, JSON), recherche, micro (Web Speech API), mode sombre.
- Synchro et hors ligne : testés avec un ancien serveur Node (retiré depuis). Avec Supabase : connexion à la base vérifiée (règles RLS et inscriptions fermées) ; l'utilisateur s'est connecté depuis l'aperçu local et l'appli lui a plu (« vraiment top »).
- V2 (testée en mode démo au format mobile, pas encore avec la vraie base) :
  - 3ᵉ type d'article **`consommable`** (« consommables d'outillage » : papier à poncer, disques, forêts…), avec son onglet « Conso. » ; les quantités s'additionnent ;
  - **accessoires** (`article_accessoires`) : quand on ajoute un outil à une tâche, ses accessoires sont proposés **pré-cochés** (sauf ceux déjà présents) ;
  - **catégories** (`categories`, `articles.categorie_id`) avec suggestion automatique ; classement au choix **📍 Lieu / 🗂️ Catégorie / Liste** ;
  - **modification groupée** (« Sélectionner », puis « Ranger à… », « Classer dans… » ou « ✨ Auto ») dans les onglets et le catalogue ;
  - **tâches types** (`taches.modele = true`, sans déplacement) : bouton + → « Tâche vide » ou modèle ; « Enregistrer comme tâche type » ; gestion dans Plus → Tâches types ;
  - **dupliquer une tâche** ;
  - fiche tâche en 3 blocs : 🔧 Outillage, ⚙️ Consommables, 📦 Matériel.

### À vérifier en premier
- **Le script `mise-a-jour-v2.sql` a-t-il été collé et exécuté dans Supabase ?** Il a été copié dans le presse-papiers de l'utilisateur, mais il ne l'a pas confirmé. Pour le vérifier, une table `categories` doit exister avec 19 lignes, ainsi que 2 tâches avec `modele = true`. S'il n'a pas été exécuté, la v2 n'aura ni tables ni données (l'utilisateur doit le lancer depuis son Mac : le fichier est local, avec ses identifiants).
- Hypothèse à faire valider : la ponceuse et la meuleuse utilisent des « Batteries 12V chargées » (accessoire pré-rempli).
- L'installation de la PWA hors ligne (service worker) n'a pas pu être testée dans le navigateur intégré : à tester sur téléphone une fois l'appli publiée.

## 6. Interventions (fait le 16/10/2026, session cloud)

Codé selon les décisions ci-dessous, testé en mode démo au format téléphone (création, déplacement d'une tâche « prévue ailleurs », étapes cochées, commentaire avec photo, récap, clôture). **Pas encore testé avec la vraie base.**

- **Modèle** : `taches.statut` (`a_traiter | reportee | terminee`) et `taches.echeance` ; nouvelles tables `intervention_taches` (id `intervention~tache`, `resultat` gardé à la clôture = historique), `commentaires` (horodatés par `created_at` ; `tache_id` vide = compte rendu) et `photos` (fichier dans le bucket Storage privé `photos`, copie locale dans la table Dexie `photo_fichiers`, envoi à la synchro, compression 1600 px JPEG).
- **Logique** : `shared/interventions.js` (candidats, déplacement, clôture, récap, cases `- [ ]` dans la description). Les tâches des anciens déplacements restent visibles par un « lien hérité » tant que la migration SQL n'est pas faite. 14 tests (`tests/interventions.test.js`).
- **Écrans** : barre du bas `Tâches · Interventions · Catalogue · Plus` ; intervention ouverte : `Tâches · Matériel · Outillage · Conso. · Charger · Récap` ; clôture à confirmer (« Reportée » par défaut) ; rapport imprimable depuis Récap.
- **Synchro** : si une table ou une colonne manque côté Supabase, l'appli continue, garde les lignes en attente et affiche « Base à mettre à jour ».

### À faire par l'utilisateur
- Coller **`supabase/schema.sql`** dans Supabase (SQL Editor → Run). Idempotent : crée les tables, migre `fait` → `statut`, crée les liens des anciens déplacements et le bucket `photos`.

### Décisions validées par l'utilisateur
- « Dupliquer un déplacement » retiré de l'interface : validé (fonction `duplicateTrip` conservée dans `shared/ops.js`).
- Statuts d'intervention : En préparation / En cours / Terminée : validés.

### Prochaine mise à jour prévue
- « Date de planification » = la date d'intervention déjà existante (`deplacements.date_debut`), confirmé par l'utilisateur : rien à ajouter au modèle.

## 6 bis. Déplacements + versions (mise à jour du 16/10/2026, soir)

Décisions de l'utilisateur : **toujours un déplacement** (une intervention par bien, créées automatiquement) ; tâche type modifiée → **demander à chaque fois** quelles tâches ouvertes mettre à jour ; commentaires et photos **inclus par défaut** dans le rapport (case à décocher).

- **Modèle** : table `voyages` (déplacement : `nom`, `date_debut`) ; `deplacements` (= interventions) gagne `voyage_id` et `appartement_id` ; `taches.modele_id` ; `commentaires.dans_rapport`, `photos.dans_rapport`. Cases « Sorti de la voiture » : `prise_articles` avec la clé `sortir~<intervention>` (`cleSortie`) ; cases « Pris » (chargement) : clé = id du déplacement.
- **Compatibilité** : une intervention sans déplacement est montrée comme un déplacement « virtuel » de même id (`shared/voyages.js`), qui devient réel dès qu'on lui ajoute un autre bien. La migration SQL fait la même chose (déplacement de même id) et scinde les anciennes interventions à plusieurs biens (`<id>~<bien>`). Migration testée deux fois de suite sur PGlite (Postgres en mémoire).
- **Barre du bas (v3)** : `Tâches · Interventions · Déplacements · Catalogue · Plus` ; l'onglet Interventions liste toutes les interventions (un bien chacune) et ouvre la même fiche que depuis un déplacement.
- **Écrans** : onglet `Déplacements` → liste → déplacement (`Interventions · Matériel · Outillage · Conso. · Charger`) → intervention (`Tâches · À sortir · Récap`). Charger groupé par type puis lieu. Tâche : date de création + « ouverte depuis », choix du déplacement, articles cliquables (fiche catalogue). Tâches : filtre « Non planifiées ». Tâches types : sélection multiple ; propagation (`shared/modeles.js`). Clôture groupée par bien.
- Tests : 45 (`tests/voyages.test.js` en plus).

### Versions conservées
L'utilisateur demande de **garder la version précédente à chaque mise à jour**. Sur le site : `deplacements/` = version actuelle, `deplacements/v1/` = version précédente (commit `a61ee5f`, compilée avec `BASE=/Claude/deplacements/v1/` et une base locale IndexedDB distincte `deplacements-v1` pour ne pas entrer en conflit). Les étiquettes git (tags) sont refusées par le proxy de la session cloud : noter le commit de chaque version ici.

| Version | Commit | Adresse |
|---|---|---|
| v1 (interventions) | `a61ee5f` | /Claude/deplacements/v1/ |
| v2 (déplacements) | `84e9327` | /Claude/deplacements/v2/ |
| v3 (onglet Interventions) | voir l'historique de `claude/deplacements-app` | /Claude/deplacements/ |

## 6 ter. Version v4 : décisions validées par l'utilisateur (17/10/2026)

Une seule version v4 regroupe tout ce qui suit (choix de l'utilisateur). La v3 reste en ligne dans `/deplacements/v3/`.

**Comptes de la famille** (code fait et testé, cf. `tests/securite.mjs`) : code famille à l'inscription (trigger sur `auth.users`), chaque compte voit son espace (`owner_id` + RLS `espace_visible`), le premier compte est administrateur et peut **voir et modifier** l'espace d'un proche (« Voir comme », en-tête `x-observe-user`), retours des utilisateurs, nouveau compte : catégories de base ou reprise **choisie** du catalogue de l'administrateur (`catalogue_partage()`, sans notes ni lieux). Réglages Supabase à faire par l'utilisateur : ouvrir les inscriptions, désactiver la confirmation par e-mail.

**Affichage**
- Réglage « Standard / Dense » pour toutes les listes, mémorisé **par appareil**. Dense : bandeaux plus fins, cases plus petites mais zone tactile ≈ 44 px, tâche sur 2 lignes (titre tronqué ; « Déplacement › Intervention · échéance », ou le bien si non planifiée), compteurs masqués sur téléphone (gardés sur grand écran), point vert « prête » dans les tâches d'intervention.
- Option « Ajout rapide visible » réglable par l'utilisateur.
- Plus de bandeau en haut (ni titre, ni recherche globale, ni point vert) ; point orange/rouge sur l'onglet Plus seulement en cas de souci de synchro.
- Barre du bas plus basse (≈ 48 px).
- Lignes Matériel/Outillage/Conso./Charger : 1 ligne ≈ 48 px, détails (lieu, quantité prise) au toucher.
- Pas de doublon « déplacement / intervention » dans les lignes de tâches.

**Classements** : tâches par « Bien › déplacement », « Déplacement › bien » ou « Échéance » (groupe « Non planifiées », tri par échéance dans chaque groupe) ; interventions par bien ou par déplacement.

**Références** : `T-0042`, `I-0017`, `D-0008`, numéro croissant par compte et par type ; doublons (deux appareils hors ligne) renumérotés automatiquement ; existants numérotés par date de création. Affichées en petit sur les listes d'interventions et de déplacements, dans la fiche tâche et sur le rapport.

**Interventions** : nom facultatif, affiché « Bien A · nom » ; crayon sur la carte de la liste + appui sur l'en-tête (nom et date).

**Déplacement** : onglets `Interventions · À prendre · Charger · À acheter` (« À prendre » = matériel, outillage, conso. et accessoires avec puces de filtre). **Intervention** : `Tâches · À sortir · À acheter · Récap`.

**Achats** : article « à acheter » (case dans la fiche et à la création depuis une tâche) ; acheté → lieu « Véhicule » (créé par défaut) → « Ranger à… » en lot. Pastille rouge sur Catalogue = nombre d'articles à acheter. Onglet « À acheter » avec case « acheté » (achats faits barrés, masquables) ; dans Charger, un article à acheter porte 🛒 et ne se coche « pris » qu'après achat (désactivable dans les options développeur).

**Accessoires** : 4ᵉ type « Accessoire » (batteries, forets, chargeurs…) ; batteries et chargeurs existants convertis d'après leur nom. Le lien « accessoires » devient « **Items à proposer** » (tout type d'article peut en proposer : peinture → rouleau, bâche). Proposés **et enregistrés dans la tâche**, modifiables tâche par tâche (comme avant). Les **chargeurs ne sont jamais proposés** automatiquement. Quantités : **seules les batteries se multiplient** (une par outil distinct qui la propose) ; les autres accessoires ne se multiplient pas ; un chargeur par type de batterie (marque + tension, pas les Ah). Batterie et chargeur reconnus **d'après le nom** ; marque et tension lues dans le nom (« 18V », « 18 V », « 18 volts ») pour pré-cocher les batteries compatibles d'un outil.

**Catalogue** : bouton « Filtres » (type, lieu, catégorie, à acheter, tri) + puces des filtres actifs ; recherche sur tous les types ; case de sélection à côté de la recherche ; dupliquer un article (avec ses items à proposer) ; créer une catégorie ou un lieu depuis la fiche ; les listes d'ajout (« + ») ne se referment plus après chaque ajout. **Stock** : table `stocks` (article × lieu × quantité) prête pour plusieurs lieux ; à l'écran, une seule quantité au lieu principal.

**Rapport** : description de la tâche, toutes les étapes avec ☑/☐, références.

**Options développeur** (Plus, visibles par tous) : blocage « pris » si à acheter (activé), filtres du catalogue toujours visibles (désactivé).

**Journal des versions** : page « Nouveautés » dans Plus + `CHANGELOG.md` ; une note récapitulative à chaque nouvelle version.

## 7. Commandes

```bash
npm install
npm run dev            # http://localhost:5173/Claude/deplacements/
npm test               # 45 tests
npm run build          # dist/ pour GitHub Pages
npm run schema         # régénère supabase/schema.sql depuis shared/schema.js
BASE=/ VITE_DEMO=1 npx vite build --outDir dist-demo   # version démo locale sans Supabase
```
