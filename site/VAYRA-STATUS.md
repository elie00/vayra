# VAYRA — État global & feuille de route

*Recap transversal : app + site/backend + domaine + prochaines actions.*
*Produit : VAYRA · A product by EYBO.*

---

## 1. Application (monorepo `elie00/vayra`, branche `main`)

| Chantier | État |
|---|---|
| **Identité Harbor → VAYRA** | ✅ Reconstruction complète : bundle `app.vayra`, package Android, keyring migré (dual-read), crate `vayra-core`, commandes IPC `vayra_*`, events `vayra://*`, formats `.vayra*`. Compat Harbor conservée là où nécessaire. |
| **VARA + VEYA** (prototype) | ✅ Room privée + synchro de lecture : broker autonome `vayra-vara-broker` (socket), client Rust, réconciliateur `inRoom`. Validé E2E (probe socket 8/8), 2-process réel, ~150 tests + observation GUI. |
| **i18n** | ✅ **Français par défaut** + couverture complète (1738 traductions, 0 zone anglaise). Switcher dans les paramètres. |
| **Perf chargement** | ✅ 8 correctifs B1→B8 : résolution debrid parallèle (~90s→~15s), singleton WASM, cache `cacheCheck`, rendu progressif, coupure 30s non-destructive, first-frame, P2P. |
| **Palette** | ✅ Direction finale Mineral Monochrome, sans orange, violet ou bleu de marque. |

## 2. Site & backend (`site/` dans le monorepo → Vercel)

**Domaine public officiel : https://vayra.eybo.tech**

**Preview technique Vercel : https://vayra-site.vercel.app**

### ✅ LIVE (aucun secret)
- Landing VAYRA (hero, VARA/VEYA, téléchargements)
- `/updates/ad-segments.json`, `/api/hero/anime.json`, `/themes/api/themes`, `/discord/*`
- `/api/imdb/*` (GraphQL keyless) — *reste : peaufiner le parsing d'id*

### 🔒 Déployés mais INERTES (renvoient `501` jusqu'aux secrets)
| Service | Env Vercel requis | Portail |
|---|---|---|
| Trakt | `TRAKT_CLIENT_ID` / `TRAKT_CLIENT_SECRET` | trakt.tv/oauth/applications |
| MAL | `MAL_CLIENT_ID` / `MAL_CLIENT_SECRET` (+ `MAL_REDIRECT_URI`) | myanimelist.net/apiconfig |
| AniList | `ANILIST_CLIENT_ID` / `ANILIST_CLIENT_SECRET` | anilist.co/settings/developer |
| TVDB | `TVDB_API_KEY` | thetvdb.com/dashboard/account/apikey |
| Feedback | `FEEDBACK_WEBHOOK_URL` (Discord/Slack) | — |

Détails : `VAYRA-INFRA-SETUP.md` + `docs/setup-*.md`.

## 3. Domaine public — `vayra.eybo.tech`

- Domaine canonique confirmé : **`https://vayra.eybo.tech`**.
- La preview **`https://vayra-site.vercel.app`** reste utilisable pour les
  validations techniques, mais ne constitue pas l'URL publique canonique.
- Email auth en place sur `main` : `mail.eybo.tech` (Resend) + **Supabase**. Callback natif conservé : `vayra://auth/callback`.
- Les liens d'invitation de l'application utilisent déjà
  **`https://vayra.eybo.tech`**. Leur traitement par la landing reste une
  intégration distincte à spécifier sans modifier le callback natif.

## 4. Cas particuliers
- **Relay watch-party** : aucun backend à monter — l'app déploie déjà **ton** relay sur **ton** Cloudflare (token dans les réglages). `pub.harbor.site` = simple défaut.
- **Updater** : manifeste `/updates/latest.json` (template) + script prêts, **mais** signer exige la clé privée minisign → décision : clé existante ou **nouvelle paire VAYRA**.
- **Endpoints app** : toujours pointés sur `harbor.site` — **ne pas repointer** avant que chaque service soit configuré + le domaine `eybo.tech` mappé sur Vercel.

---

## 5. Prochaines actions — qui fait quoi

### Toi (Elie) — plus tard
1. Créer les **4 apps dev** (Trakt, MAL, AniList) + **clé TVDB** → secrets.
2. Trancher pour l'**updater** (clé existante vs nouvelle paire).

### Moi — sur ton go
- Spécifier puis valider le parcours web des liens d'invitation sur
  `vayra.eybo.tech` sans modifier `vayra://auth/callback`.
- Corriger le parsing IMDb.
- Brancher les env Vercel + repointer les endpoints app une fois les services servis.
- Valider le callback email dans une application packagée sur chaque plateforme.

---

*Mémoire projet à jour : `vayra-infra-backend.md`, `vayra-identity-reconstruction.md`.*
