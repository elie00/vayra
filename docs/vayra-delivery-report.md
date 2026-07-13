# VAYRA — compte rendu consolidé des travaux

**Produit :** VAYRA — *A product by EYBO*<br>
**Période couverte :** 11–13 juillet 2026<br>
**Monorepo :** [`elie00/vayra`](https://github.com/elie00/vayra)<br>
**Site :** dossier `site/` du monorepo, déployé sur [`vayra.eybo.tech`](https://vayra.eybo.tech/)<br>
**Preview Vercel :** [`vayra-site.vercel.app`](https://vayra-site.vercel.app/)<br>
**Branche de référence :** `main`

## 1. Objet du document

Ce document rassemble les travaux réalisés sur VAYRA : stabilisation
multiplateforme, cast, i18n, rebranding, identité technique, VARA/VEYA,
authentification par email, performances, direction Mineral Monochrome, site
public et opérations GitHub/Vercel.

Il complète les rapports spécialisés déjà présents :

- [`vayra-reconstruction-report.md`](./vayra-reconstruction-report.md) ;
- [`branding-compatibility.md`](./branding-compatibility.md) ;
- [`vayra-visual-identity.md`](./vayra-visual-identity.md) ;
- [`vayra-email-auth.md`](./vayra-email-auth.md) ;
- [`vara-veya-implementation-report.md`](./vara-veya-implementation-report.md).

## 2. Synthèse exécutive

Le fork Harbor a été transformé en produit autonome VAYRA avec :

- une marque visible VAYRA et la signature **A product by EYBO** ;
- le vocabulaire produit **VARA**, **VEYA**, **CIRA** et **LUMA** ;
- une identité visuelle finale **Mineral Monochrome** sans orange, violet ou
  bleu de marque ;
- des assets vectoriels déterministes issus du concept 3 validé ;
- une identité technique VAYRA accompagnée de mécanismes de compatibilité et de
  migration ;
- une authentification VAYRA par email via Supabase, indépendante de la session
  Stremio ;
- un prototype local VARA/VEYA avec broker autonome et logique de
  synchronisation testée ;
- un cast plus robuste, plus précis et moins coûteux ;
- une couverture i18n étendue et 277 chaînes auparavant codées en dur rendues
  traduisibles ;
- des optimisations du pipeline de recherche et de résolution des streams ;
- un site vitrine monochrome, responsive et déployé sur Vercel ;
- un dépôt GitHub renommé de `elie00/harbor` vers `elie00/vayra`.

## 3. État Git et déploiement au 13 juillet 2026

| Élément | État constaté |
| --- | --- |
| Dépôt principal | `https://github.com/elie00/vayra.git` |
| Ancienne URL | `elie00/harbor` redirige en HTTP 301 vers `elie00/vayra` |
| Branche de référence | `main`, avec identité, auth email, Mineral Monochrome et site consolidés |
| Site | dossier `site/` du même dépôt, Root Directory Vercel `site` |
| Production Vercel | `https://vayra.eybo.tech/`, réponse HTTP 200 au dernier contrôle |
| Preview Vercel | `https://vayra-site.vercel.app/`, conservée pour les validations techniques |
| Tags VAYRA | `vayra-brand-v1`, `vayra-identity-v1`, `vara-veya-proto-v1` |

**Point important :** les travaux d’authentification et de design Mineral
Monochrome sont contenus dans `main`. Les branches historiques restent des
références de travail et ne doivent pas être fusionnées à nouveau sans audit.

## 4. Travaux réalisés par domaine

### 4.1 Autonomie du fork et sécurité de base

- Suppression de la dépendance opérationnelle au dépôt Harbor d’origine ; seul
  le remote `origin` du fork autonome est utilisé.
- Durcissement des credentials et de l’installation des addons (`0843079`).
- Ajout de tests couvrant reprise de lecture, Together et IPTV (`714a176`).
- Suppression des avertissements de dépendances React Hooks (`30ec6de`).
- Renforcement de la CI native, Android, WASM et des téléchargements d’outils
  (`740585d`).
- Lazy loading de la home et réduction du poids des artworks (`f6f4b21`).
- Exécution du core via WASM sur le Web (`89496e9`).

### 4.2 Six chantiers roadmap

Six chantiers roadmap ont été réalisés, inspectés, corrigés, commités séparément
et validés :

| Chantier | Résultat | Commits représentatifs |
| --- | --- | --- |
| Traductions françaises | Locale française complète et enregistrée | `4897537` |
| Galerie de thèmes | Thèmes intégrés et données de galerie testées | `8af97bc` |
| Cast matrix | Matrice de capacités étendue | `109d8ea`, `c1c6eaa` |
| Android Keystore | Secrets Android placés derrière le Keystore | `867fc24` |
| Scopes filesystem | Capabilities des fenêtres auxiliaires limitées | `9b19d2c` |
| Together mobile | Sheet mobile de session collaborative | `1821965` |

### 4.3 Cast : robustesse, matériel et performances

Le cast a fait l’objet d’une passe approfondie sans modification du décodage
vidéo, du HDR, des shaders ou du moteur P2P.

- Détection Roku ajustée par modèle (`c1c6eaa`).
- Détection sûre du matériel Google TV (`6f31391`).
- Suppression de faux blocages AirPlay (`daa21d9`).
- Récepteurs IPv6 distincts correctement préservés (`6952623`).
- Détection de téléviseurs DLNA 4K modernes (`962c5d0`).
- Profils appareils honorés pour la sortie HLS (`367e9ee`).
- Libération de la session proxy/HLS et de FFmpeg à l’arrêt (`94f865b`).
- Conservation du profil de transcodage propre à l’appareil (`cb5d924`).
- Polling de statut sérialisé (`5f897a6`).
- Connexion Chromecast réutilisée entre les polls (`fa8578f`).
- Rendu de position isolé du reste du player (`f38fb92`).
- Réduction des probes DLNA Samsung inutiles (`f497d95`).

**Validation restante :** un test manuel sur Chromecast, Roku, Google TV et
téléviseur Samsung réel reste nécessaire ; aucun matériel de cast n’est présent
en CI.

### 4.4 Internationalisation

- Français complet puis français défini comme langue par défaut.
- Ajout de l’espagnol, de l’allemand et de l’italien avec tests de parité :
  `f7d6b7e`, `cd17c5f`, `2325dd1`.
- Correction du sélecteur de langue auparavant limité à certaines locales.
- Couverture française complétée sur toutes les chaînes UI (`aa03e49`).
- Sweep de 277 chaînes codées en dur, intégrées au système `t()` et traduites en
  français (`ed0ecbc`).
- Intégration du worktree i18n dans la branche monochrome (`a186428`).
- Correction de la dépendance React Hook introduite par le sweep (`3e25d8f`).

### 4.5 Android, Windows, Linux, macOS et packaging

- Ajout des stubs Android manquants pour les commandes Tauri desktop
  (`7276544`).
- Correction de `pnpm/action-setup` (`c7908ea`).
- Retrait de macOS Intel de la matrice (`a5def07`).
- Vérification SHA-256 portable sous Windows (`77653dc`).
- Suppression du sidecar `mpv.exe` déclaré mais absent (`c5c7881`).
- Implémentation Windows de `force_show_foreground` (`41149b4`).
- Métadonnées de bundle Linux/Windows/macOS complétées (`d15f49f`).
- Icônes VAYRA de plateforme générées depuis la source approuvée (`8113610`).
- Icône macOS squircle native (`706b0f0`).
- Artefacts CI renommés `vayra-*` (`67e54d8`).

Les notes historiques indiquent une CI verte Windows, Linux et macOS Apple
Silicon. Windows et Linux restent à valider uniquement via GitHub Actions.

### 4.6 Rebranding visible Harbor → VAYRA

La première passe a été livrée en quatre commits atomiques :

1. `d93f408` — `docs(brand): establish VAYRA identity and fork attribution` ;
2. `b8e26c7` — `feat(brand): replace visible Harbor copy with VAYRA` ;
3. `04905e7` — `feat(brand): apply VARA VEYA CIRA LUMA user-facing terminology` ;
4. `0c1bdf3` — `docs(brand): document retained Harbor compatibility boundaries`.

La passe de complétion a ensuite couvert :

- concept 3 et assets VAYRA (`3d32403`) ;
- intégration du mark aux surfaces de démarrage (`2cf34bc`) ;
- copy player, cast et play picker (`ce26b32`) ;
- intégrations et navigation (`39ae04b`) ;
- documentation et installeur (`b341d50`) ;
- dette visible Harbor et exceptions (`442bcdd`) ;
- icônes, nom produit et titres (`8113610`, `e8b9bb1`) ;
- wordmark VAYRA compact dans la sidebar (`6272d0b`).

Le tag `vayra-brand-v1` pointe la fusion de cette passe visible (`137b013`).

### 4.7 Reconstruction de l’identité technique

Une seconde vague a migré l’identité interne avec compatibilité :

| Surface | Migration | Commit |
| --- | --- | --- |
| Attributs DOM | `data-harbor-*` → `data-vayra-*` | `b84c3da` |
| Événements | `harbor:*` / `harbor://*` → `vayra:*` | `74cee9d` |
| API globale | `window.vayra`, alias `window.harbor` conservé | `5072f44` |
| Fenêtres Tauri | labels `harbor-*` → `vayra-*` | `62a59a7` |
| IPC | commandes `harbor_*` → `vayra_*` | `ab95c4c` |
| Core WASM | `harbor-core` → `vayra-core` | `508cf54` |
| Deep links | ajout de `vayra://`, lecture legacy maintenue | `9c3d948` |
| Bundle | `app.harbor` → `app.vayra` + migrations | `c9d065c` |
| Formats | `.vayrastyle` / `.vayrx`, lecture legacy | `f731103` |

Le tag `vayra-identity-v1` pointe la fusion (`ad3f0aa`). Les licences,
attributions, anciens formats lisibles et alias nécessaires sont documentés
dans [`branding-compatibility.md`](./branding-compatibility.md).

### 4.8 VARA et VEYA

Le prototype local a été livré en sept micro-commits :

- launcher de deux instances avec `VAYRA_DATA_DIR` (`2042752`) ;
- contrat et logique pure de synchronisation (`1316305`) ;
- broker autonome `vayra-vara-broker` (`7e32a64`) ;
- client Rust socket ↔ événements Tauri (`0e4e9a6`) ;
- `LocalSyncTransport`, fake et conformance (`24b8b34`) ;
- réconciliateur VEYA protégé par l’état de room (`2703447`) ;
- états UI VARA et pill de statut (`547b718`).

La branche/tag de référence est `feat/vara-veya` / `vara-veya-proto-v1`
(`191c45e`). Le chemin solo est couvert par des tests et le player, libmpv, cast,
HDR et Stremio n’ont pas été modifiés par ce prototype.

**Validation restante :** test manuel à deux processus pour play, pause, seek,
arrivée tardive et absence de boucle.

### 4.9 Authentification VAYRA par email et Stremio

La décision produit finale conserve deux connexions indépendantes :

- compte VAYRA par lien email passwordless ;
- connexion Stremio facultative pour bibliothèque, progression et addons.

Travaux livrés sur la branche monochrome :

- callback email (`33efa11`) ;
- sessions stockées de manière sécurisée (`fd8c0b0`) ;
- interface email ou Stremio (`625724d`) ;
- documentation de configuration (`905575b`) ;
- isolation du verifier PKCE (`386e87b`) ;
- connexion au projet Supabase de production (`ad1ce5c`) ;
- chargement paresseux du client Supabase (`74924c6`) ;
- emails de production VAYRA puis Mineral Monochrome (`e58f431`, `df09477`).

Configuration documentée : Email actif, confirmation obligatoire, providers
sociaux désactivés, callback `vayra://auth/callback`, SMTP Resend sur
`mail.eybo.tech`. Aucun secret `service_role` ou SMTP n’est stocké dans le repo.

### 4.10 Performances du pipeline de streams

Le lot B1–B8 a été intégré à `main` :

- concurrence contrôlée entre les meilleurs debrids et annulation des perdants ;
- timeout addons lents avec phase rapide non bloquante ;
- cache TTL et requêtes inflight pour les contrôles de cache ;
- marquage progressif par debrid ;
- singleton WASM et réduction des rerankings ;
- cutoff UI non destructif avec résultats tardifs ;
- plafond metadata réduit, retry pair frais et seed DHT concurrent ;
- loader fermé sur la première frame réellement rendue.

Commits représentatifs : `d99c5a9`, `d6e1666`, `a844bd2`, `ce6c814`,
`475ccdd`, `4666ae7`, `8acc7ad`, `4c980ab`, fusion `70d8b08`.

### 4.11 Direction Mineral Monochrome

La direction violette/bleue intermédiaire a été abandonnée au profit d’un
système monochrome premium :

- adoption de l’identité (`89df88f`) ;
- régénération des artworks de plateforme (`4df8e10`) ;
- defaults UI monochromes (`2375a3d`) ;
- defaults de création de thèmes (`13b153b`) ;
- emails monochromes (`df09477`) ;
- documentation du système (`c56b436`).

Palette canonique :

| Rôle | Valeur |
| --- | --- |
| Mineral black | `#0A0B0D` |
| Ivory | `#F4F2ED` |
| Titanium | `#A8AAAD` |
| Graphite | `#4B4D50` |

Les couleurs sémantiques nécessaires, les artworks externes et les thèmes
choisis par l’utilisateur restent autorisés. La marque VAYRA elle-même n’utilise
plus d’orange, violet ou bleu.

### 4.12 Site vitrine VAYRA

Le site initial et ses fonctions serverless ont été repris dans un dépôt Git
autonome, puis entièrement redessinés :

- baseline versionnée (`1f57e01`) ;
- landing Mineral Monochrome responsive (`32de090`) ;
- correction Vercel via `public/` (`fd01835`) ;
- mark canonique identique à celui de l’app (`0ca6e9d`) ;
- invalidation du cache du mark (`26bb99f`) ;
- liens mis à jour vers `elie00/vayra` (`2724d22`).

Le site inclut une hiérarchie éditoriale, VARA/VEYA/LUMA, CIRA annoncé comme
« En préparation », des liens de téléchargement, l’attribution du fork et une
animation légère compatible `prefers-reduced-motion`.

Les chemins `/`, `/styles.css`, `/motion.js`, `/favicon.svg`, les manifests
d’updates et les endpoints serverless contrôlés ont répondu en HTTP 200 après
déploiement.

### 4.13 GitHub et nom du dépôt

- Renommage GitHub : `elie00/harbor` → `elie00/vayra`.
- Remote local mis à jour vers `https://github.com/elie00/vayra.git`.
- Ancienne URL conservée par la redirection GitHub.
- Documentation applicative actualisée (`a405d81`).
- Site, scripts d’updates et documentation d’infrastructure actualisés
  (`2724d22`).

## 5. Conflits et intégrations traités

- Résolution des conflits de la PR Harbor historique #744 (`ece70bf`) puis
  synchronisation ultérieure avec `main` (`82b8fc4`).
- Restauration du câblage des commandes Tauri après merge (`c493c78`).
- Fusion des derniers travaux fonctionnels de `main` dans la branche Mineral
  Monochrome (`613ce33`).
- Lors des conflits visuels, les modifications fonctionnelles ont été gardées
  et les tokens Mineral Monochrome ont été retenus.
- Intégration de `fix/i18n-hardcoded` (`a186428`) et correction lint associée
  (`3e25d8f`).
- Aucun marqueur `<<<<<<<`, `=======` ou `>>>>>>>` n’est présent dans les
  fichiers suivis de la branche active.

## 6. Validations réellement observées

### Application — dernière passe locale

| Commande | Résultat |
| --- | --- |
| `pnpm exec tsc -b` | succès |
| `pnpm lint` | succès |
| `pnpm test -- --runInBand` | 26 fichiers, 153 tests réussis |
| `cargo check --manifest-path src-tauri/Cargo.toml` | succès |
| `PATH="$HOME/.cargo/bin:$PATH" pnpm build` | succès |
| `git diff --check` | succès |

Le premier `pnpm build` lancé avec le Rust Homebrew a échoué faute de cible WASM.
La même commande avec la toolchain rustup dans le `PATH` a réussi. Ce point est
un détail d’environnement local, pas une régression du code.

### Site

| Contrôle | Résultat |
| --- | --- |
| `node --check public/motion.js` | succès |
| `xmllint --noout public/favicon.svg` | succès |
| comparaison géométrique du mark app/site | correspondance exacte |
| `git diff --check` | succès |
| QA visuelle desktop et mobile | succès |
| production Vercel | `Ready`, HTTP 200 |

### Validations historiques documentées

Les rapports antérieurs consignent des builds CI Windows, Linux, macOS Apple
Silicon et Android. Ils ne doivent pas être confondus avec une nouvelle exécution
faite au moment de la rédaction de ce document.

## 7. Fichiers et zones structurantes

| Zone | Emplacement principal |
| --- | --- |
| Assets VAYRA | `src/assets/brand/vayra/` |
| Identité visuelle | `docs/vayra-visual-identity.md` |
| Compatibilité/migrations | `docs/branding-compatibility.md` |
| Auth email | `docs/vayra-email-auth.md`, `supabase/templates/` |
| VARA/VEYA | `vara-broker/`, `src/lib/together/sync/`, `src-tauri/src/vara_client.rs` |
| Cast | `src-tauri/src/cast.rs`, `src/lib/player/cast-interp.ts`, UI cast/player |
| Traductions | `src/lib/i18n/locales/` |
| Site | `site/public/`, fonctions `site/api/`, configuration `site/vercel.json` |
| CI | `.github/workflows/` |

## 8. Limites et travaux encore nécessaires

1. **CI Rust :** le job `src-tauri` doit préparer le sidecar yt-dlp attendu par
   la configuration Tauri avant d'exécuter Clippy et les tests.
2. **Cast réel :** Chromecast, Roku, Google TV et Samsung doivent être testés sur
   matériel.
3. **VARA/VEYA :** le scénario manuel deux processus reste obligatoire avant de
   considérer le prototype comme validé de bout en bout.
4. **Email callback :** tester le lien reçu jusqu’au retour dans une application
   packagée sur chaque plateforme.
5. **Migration utilisateur :** l’ancien `localStorage` lié au bundle Harbor ne
   migre pas automatiquement ; le chemin supporté reste export `.harbx` puis
   restauration.
6. **Endpoints historiques :** certaines références `harbor.site`, emails de
   support et contrats réseau sont encore conservés tant que l’infrastructure de
   remplacement n’est pas entièrement disponible.
7. **Player :** aucune modification future de libmpv, HDR, shaders, décodage ou
   P2P ne doit être fusionnée sans test de lecture manuel documenté.
8. **Fichiers locaux non suivis :** `.claude/`,
   `docs/vara-veya-architecture.md`, les assets Android générés et
   `tauri.properties` sont volontairement restés hors des commits de la branche
   courante.

## 9. Conclusion

Les travaux réalisés ont fait passer le projet d’un fork Harbor à un produit
VAYRA autonome, cohérent visuellement et techniquement, doté d’une base
collaborative, d’une authentification propre, d’un pipeline de lecture plus
réactif et d’une présence publique déployée.

La priorité suivante est de rétablir une CI Rust verte sur `main`, puis
d’exécuter les validations
manuelles impossibles en CI : matériel de cast, lecture multiplateforme,
VARA/VEYA à deux instances et callback email dans les builds packagés.
