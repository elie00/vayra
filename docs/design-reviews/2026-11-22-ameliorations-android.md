# Améliorations Android — Native Kotlin/Media3 & Interface Material Design 3

- **Date** : 22 novembre 2026
- **Périmètre** : Application Android personnelle VAYRA (`src-tauri/gen/android/app/src/main/`, `src/mobile/`, `src/lib/android-insets.ts`, `src/lib/player/exo/`, `src/components/player/`, `src/views/player/`, `src/index.css`)
- **Références** : `docs/mobile-design-spec.md`, `.agents/skills/checklist-design/references/mobile.md`, `docs/design-reviews/2026-11-11-android-emulateur.md`

---

## 1. Couche native Android, Kotlin & ExoPlayer (Media3)

| Amélioration | Fichiers | Détail |
| --- | --- | --- |
| **Audio Becoming Noisy** | `HarborExoBridge.kt` | Ajout de `.setHandleAudioBecomingNoisy(true)` sur `ExoPlayer.Builder` : met automatiquement la lecture en pause au débranchement d'un casque filaire ou à la déconnexion Bluetooth. |
| **Auto-PiP natif Android 12+ & repli API 26–30** | `HarborExoBridge.kt`, `MainActivity.kt` | `buildPipParams()` + `updatePipParams()` configurent `aspectRatio`, `sourceRectHint`, `setAutoEnterEnabled(true)` et `setSeamlessResizeEnabled(true)` (API 31+) quand la vidéo est active et en lecture ; repli `onUserLeaveHint()` sur Android 8–11 ; désactivation automatique en pause ou à la fermeture. |
| **Restauration immersive après PiP** | `HarborExoBridge.kt` | `onPipChanged(false)` réapplique `setImmersive(true)` si le lecteur est visible afin que les barres système ne restent pas bloquées à l'écran. |
| **Correction du bug Fill vs Stretch** | `src/lib/player/exo/bridge.ts` | `setStretch()` n'était pas implémenté et `panscan >= 1` (Fill) était mappé sur `RESIZE_MODE_FILL` (étirement/déformation) au lieu de `RESIZE_MODE_ZOOM` (recadrage sans déformation). Maintenant : **Fit** → `fit`, **Fill** → `zoom`, **Stretch** → `fill`. |
| **Geste luminosité bord gauche + fix HUD bloqué** | `HarborExoBridge.kt`, `src/lib/player/exo/bridge.ts`, `src/views/player/drag-click-stage.tsx`, `src/views/player/player-overlay-layers.tsx`, `src/views/player.tsx` | Glissement vertical à gauche = luminosité de la fenêtre lecteur (`getScreenBrightness`/`setScreenBrightness`), restaurée à `BRIGHTNESS_OVERRIDE_NONE` à la sortie ; correction de `onPointerCancel` qui laissait le HUD volume/luminosité figé. |
| **Insets 4 côtés + clavier (IME) & bord-à-bord** | `MainActivity.kt`, `src/lib/android-insets.ts`, `src/index.css`, `src/components/player/transport.tsx` | Transmission de `top`, `bottom`, `left`, `right` (`systemBars() or displayCutout()`) et `ime` (`ime()`) vers `--vayra-safe-left/right` et `--vayra-ime-bottom` ; `isNavigationBarContrastEnforced = false` (API 29+) et `layoutInDisplayCutoutMode` (`ALWAYS`/`SHORT_EDGES`) ; HUD lecteur et panneaux paysage protégés contre les poinçons caméra et barres latérales. |
| **Thème natif Material 3 & zéro flash** | `res/values/themes.xml`, `res/values-v31/themes.xml`, `MainActivity.kt`, `HarborExoBridge.kt` | Passage de `Theme.MaterialComponents.NoActionBar` à `Theme.Material3.Dark.NoActionBar`, surface `#0A0B0D` (`VAYRA_CANVAS_COLOR`) appliquée dès `onWebViewCreate` et au masquage du lecteur, `overScrollMode = OVER_SCROLL_NEVER`. |
| **Haptique natif Android (`VayraHaptics`)** | `MainActivity.kt`, `src/mobile/haptics.ts`, `proguard-rules.pro` | Pont `@JavascriptInterface` utilisant `View.performHapticFeedback` (`CLOCK_TICK`, `CONFIRM`, `REJECT`, `GESTURE_END`, `CONTEXT_CLICK`) qui respecte le réglage système « Retour tactile », avec repli `navigator.vibrate`. |
| **Hygiène mémoire capture** | `HarborExoBridge.kt` | `bmp.recycle()` dans `finally` après encodage PNG dans `screenshot()`. |

---

## 2. Interface mobile Material Design 3, Google Sans & Accessibilité

- **Barre de navigation M3 (`src/mobile/shell.tsx`)** : ajout de la pilule active tonale Material 3 (`h-8 w-16 rounded-full bg-ink/12`) autour de l'icône active + marges horizontales safe-area.
- **Accessibilité TalkBack (`src/mobile/shell.tsx`, `src/mobile/search.tsx`)** : `MenuScreen` et `MobileSearch` passent de `role="dialog" aria-modal="true"` à `role="region"` afin de ne plus piéger TalkBack hors de la barre d'onglets inférieure sœur ; liens de menu élargis en cible pleine largeur `min-h-12` (`48dp`).
- **Focus trap & fermeture clavier sur toutes les modales/sheets mobiles** : `useFocusTrap` ajouté sur `MetaPreviewSheet`, `MacRemoteSheet`, `ActionSheet` (`my-list.tsx`, avec poignée de glissement + `useSheetDrag` + `Escape`) et `MobileMoreSheet` (avec `useSheetDrag`, poignée portrait, `Escape`, cibles `h-10`, safe-area droite en paysage) ; poignée de `MobileTogetherSheet` convertie de `<div role="button">` en `<button type="button">`.
- **Recherche mobile (`src/mobile/search.tsx`)** : correction du retour à la ligne de « Recherches récentes » sur une seule ligne (`min-w-0 truncate` + action compacte `min-h-10`) et ajout du raccourci `Escape`.
- **Réglages mobiles (`src/mobile/settings-list.tsx`)** : affichage de la version en pied de page (`VAYRA · v0.9.42`), carte Profil/Compte incluse dans la recherche, état vide explicite avec bouton « Effacer » (`No matching settings`), bouton Effacer porté à `h-10 w-10`.
- **Cibles tactiles & retours haptiques (`play-picker.tsx`, `addons.tsx`, `detail.tsx`, `discover.tsx`, `sports.tsx`, `home.tsx`, `my-list.tsx`)** : puces de filtre portées à `h-10` (`40dp`), bouton menu ligne Ma liste porté à `h-12 w-12` (`48dp`), état vide ajouté sur `MobileDiscover`, retours haptiques cohérents sur bascules de liste, onglets, filtres, double-tap ±10 s et glissements de fermeture.

---

## 3. Vérifications et provenance

### Vérifié (sources, tests automatiques et build natif)
- `pnpm test:design` : **14/14** contrôles passés.
- `pnpm exec tsc -b` : **0 erreur**.
- `pnpm lint` (`eslint --max-warnings 0` + `lint:silent-errors`) : **0 avertissement**, **267/267** contrôles d'erreurs silencieuses.
- `pnpm test` (Node 26, `NODE_OPTIONS="--no-experimental-webstorage"`) : **231/231 fichiers, 1 291/1 291 tests passés** (incluant les nouveaux tests pour ExoPlayer Fill/Stretch/luminosité, insets 4 côtés + IME, geste luminosité bord gauche, et `role="region"` sur le menu mobile).
- `vite build && pnpm perf:budget` : **6/6 budgets respectés** (`793.6 KiB / 840 KiB` gzip).
- Compilation Gradle (`:app:processUniversalDebugResources` + `:app:compileUniversalDebugKotlin`) : **BUILD SUCCESSFUL**.
- Build APK release signé `aarch64` (`pnpm tauri android build --apk --target aarch64`, R8/ProGuard actif) :
  - Fichier : `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk` (`95 Mo`)
  - SHA-256 : `e6ba38803a22755de28423bcac81b2eda78e5f104ed0a2678a121944f2eb098b`
  - Signature : vérifiée via `apksigner verify` (V2 Signer `CN=Harbor`).

### Non vérifié (à contrôler sur appareil physique ou émulateur)
- Rendu visuel en direct, gestes tactiles réels (luminosité/volume, Auto-PiP Android 12+, débranchement casque, haptique `VayraHaptics`) et parcours TalkBack sur téléphone Android ou émulateur : **non vérifié** dans cette session (aucun appareil ADB ni AVD démarré).
