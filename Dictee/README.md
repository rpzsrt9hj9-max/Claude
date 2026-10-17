# Dictée — dictée vocale locale (façon Wispr Flow)

Bouton Action → enregistre (sans limite) → WhisperKit transcrit sur l'iPhone → Claude Haiku
ponctue et gère les autocorrections → texte dans le presse-papier + historique daté.

## Installation (Mac)
1. Installer Xcode (App Store), puis `brew install xcodegen`.
2. `cd Dictee && xcodegen` → ouvre `Dictee.xcodeproj`.
3. Dans Xcode, pour les 2 targets (Dictee et DicteeLiveActivity) : Signing & Capabilities → ton Team,
   et change le Bundle Identifier (`com.example.…` → le tien, l'extension doit rester `<app>.liveactivity`).
4. Branche l'iPhone (mode développeur activé), Run.
5. Dans l'app : Réglages → colle ta clé API Anthropic → « Télécharger le modèle » (une fois, Wi-Fi).
6. iPhone › Réglages › Bouton Action › Raccourci → « Dicter (démarrer / arrêter) ».
   Si le texte n'est pas déjà copié, crée un raccourci : [Dicter] → Si « Résultat » a une valeur → Copier dans le presse-papiers.
