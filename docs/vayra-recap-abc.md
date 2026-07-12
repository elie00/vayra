# Récap — VAYRA : icônes, copy réseau, validation CI (A / B / C)

Branche : `brand/completion` · Produit : **VAYRA** · Signature : *A product by EYBO*

Cette passe complète le rebrand visible en traitant les trois derniers points
identifiés après le travail de rebrand : les icônes de plateforme (A), la
validation CI multiplateforme (B) et les chaînes « Harbor » limites (C).

## A — Icônes de plateforme VAYRA ✅

Commit `8113610` — `feat(brand): generate VAYRA platform icons from approved source`

- Les **50 icônes** de plateforme régénérées depuis `src/assets/brand/vayra/vayra-icon-source-1024.png` via `pnpm tauri icon` :
  - desktop : `32/64/128/128@2x.png`, `icon.png`, `icon.ico`, `icon.icns`, Square logos Windows Store ;
  - iOS : jeu complet `AppIcon-*` ;
  - Android : `ic_launcher` / `ic_launcher_round` / `ic_launcher_foreground` en `mdpi → xxxhdpi`.
- Contrôle visuel effectué : l'icône affiche bien la marque VAYRA (deux rubans formant un « V » en espace négatif, dégradé violet → bleu sur obsidienne).
- **Effet** : l'icône du dock/barre des tâches, la fenêtre, l'installeur Windows et le lanceur Android n'affichent plus le visuel Harbor.
- Aucun code ni identifiant modifié.
- Suivi possible (polish) : l'icône macOS est un carré sombre plein ; une variante squircle native pourrait être produite plus tard.

## C — Chaînes « Harbor » limites : produit-visible vs identité réseau ✅

Commit `e8b9bb1` — `feat(brand): use VAYRA for the product-facing app name and AI title`

Décision : changer ce qui est **produit-visible**, garder l'**identité de transport réseau**.

| Occurrence | Fichier | Décision | Raison |
|---|---|---|---|
| `appName=Harbor` (login Stremio) | `src/lib/stremio-auth.ts:20` | → **VAYRA** | Visible dans l'écran de consentement du navigateur pendant la connexion Stremio |
| `X-Title: "Harbor"` | `src/lib/ai-episode-search.ts:33` | → **VAYRA** | Libellé produit envoyé à l'API IA (visible dans le tableau de bord OpenRouter) |
| `X-Title: "Harbor"` | `src/lib/subtitles/translate.ts:108` | → **VAYRA** | idem |
| `headers["X-Title"] = "Harbor"` | `src/lib/ai-search.ts:44` | → **VAYRA** | idem |
| `User-Agent … Harbor` | `src/lib/anime-fillers.ts:8` | **gardé** | Identité de transport réseau, non visible ; changer risque des quirks côté services tiers |
| `AGENT = "Harbor"` (debrid) | `src/lib/debrid/alldebrid.ts:16` | **gardé** | idem |

Validé : `pnpm exec tsc -b` ✅, ESLint strict ✅.

Hors périmètre de cette passe (déjà décidé côté Codex, conservé pour compat données) :
le dossier de captures `Pictures/Harbor` et le fallback de nom de fichier restent inchangés.

## B — Validation CI multiplateforme ⏳

Run : https://github.com/elie00/harbor/actions/runs/29196190859 (workflow `tauri-build.yml` sur `brand/completion`)

But : confirmer que le rebrand (copy Rust de Codex + icônes + copy réseau) compile et
s'empaquette sur les 3 plateformes.

| Plateforme | Artefact attendu | Résultat |
|---|---|---|
| macOS Apple Silicon | `.dmg` | ✅ réussi |
| Windows | `.msi` | ⏳ en cours |
| Linux x86_64 | `.deb` + `.AppImage` | ⏳ en cours |

*(Ce tableau sera mis à jour avec le résultat final dès la fin du run.)*

## État git

- Branche `brand/completion` poussée sur `origin`, au commit `e8b9bb1`.
- `main` et `mobile-android` intactes à `c1c2906` (non modifiées).
- Identifiants techniques toujours préservés : `app.harbor`, `harbor://`, keyring,
  `harbor-core`, `window.harbor`, classes CSS, formats `.harborstyle`/`.harbx`.
