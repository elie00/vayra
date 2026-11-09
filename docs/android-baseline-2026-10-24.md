# Android — état de base avant VAYRA Connect (24 octobre 2026)

Étape 1 de [docs/connect-plan.md](connect-plan.md). APK de debug compilée depuis
`main` (`pnpm tauri android build --debug --target aarch64 --apk`), installée sur
l'émulateur `harbor_pixel6` (arm64), profil sans addon ni clé TMDB.

## Ce qui marche

- Démarrage, accueil, fiche, recherche, interface en français.
- Lecture par l'interface avec le lecteur natif ExoPlayer (`HarborExoBridge.kt`),
  directement et à travers le proxy de flux Rust : vidéo de test de 4 minutes
  servie depuis le Mac (`http://10.0.2.2:8765/…`), image et durée correctes.
- La WebView est servie en `http://tauri.localhost` et se débogue par
  `adb forward tcp:<port> localabstract:webview_devtools_remote_<pid>`.

## Écarts relevés

| # | Écart | Effet | Piste |
|---|---|---|---|
| 1 | La carte « Le stream n'a pas pu se charger » écrase son texte en colonne d'un mot | Lisibilité de l'erreur sur téléphone | Largeur minimale du texte ou passage à la ligne du bouton |
| 2 | Appels à `https://harbor.site/api/imdb/…` refusés par CORS | Données IMDb manquantes sur Android | Ancien domaine : passer par le client HTTP natif ou le nouveau domaine |
| 3 | Feuilles de polices Fontshare et Google Fonts refusées par la CSP | Polices de repli | Autoriser ces origines en `style-src` ou embarquer les polices |
| 4 | Un lien direct saisi par l'utilisateur passe par la détection des vidéos d'erreur (< 180 s) | Un court extrait renvoie au sélecteur | Exempter les liens `url:` comme les fichiers locaux |
| 5 | Le champ de recherche laisse le clavier corriger et capitaliser (`Https`, `MP4`) | Une URL tapée à la main casse | `autoCapitalize="off"`, `autoCorrect="off"`, `spellCheck={false}` |
| 6 | Un essai avec la vidéo de 4 minutes a échoué une fois, non reproduit | Inconnu | À surveiller pendant les étapes suivantes |

Ces points ne bloquent pas Connect ; ils seront traités au fil des étapes.
