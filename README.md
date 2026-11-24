# Bake That Track · l'appli de l'équipe

Appli web installable (PWA) : caisse, cuisine, écran d'appel, soirées, concept et organisation.

- **Installer** : ouvrir le lien dans Chrome (Android) puis « Installer l'application », ou dans Safari (iPhone) puis Partager > « Sur l'écran d'accueil ».
- **Rejoindre l'équipe** : à la première ouverture, entrer le code d'équipe (au moins 6 caractères). La toute première personne le crée.
- **Suivi client** : si l'option est cochée à la caisse, un QR s'affiche après chaque commande ; le client le scanne et son téléphone sonne et vibre quand la pizza est prête (page ouverte).

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html`, `app.css`, `app.js` | l'appli de l'équipe |
| `suivi.html`, `suivi.js` | la page de suivi pour les clients |
| `fb.js` | connexion Firebase (Auth anonyme + Firestore) |
| `config.js` | configuration du projet Firebase |
| `firestore.rules` | règles d'accès à coller dans la console Firebase |
| `manifest.webmanifest`, `sw.js`, `icons/` | ce qui rend l'appli installable et utilisable avec un réseau faible |

## Mettre à jour

Modifier les fichiers, changer `V` en haut de `sw.js` (par exemple `btt-v2`) pour que les téléphones récupèrent la nouvelle version, puis pousser sur la branche `main`.
