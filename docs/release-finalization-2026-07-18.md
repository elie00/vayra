# VAYRA — finalisation produit et distribution

Date : 18 juillet 2026  
Branche : `release/product-finalization`  
Version qualifiée par le code : `0.9.36`

## Verdict

Le produit, le backend social privé, le site public et les chaînes de build sont
prêts pour une **release candidate de bêta privée**. La publication publique des
installateurs desktop reste bloquée volontairement tant que les certificats
Apple Developer ID et Windows Authenticode ne sont pas fournis et que la recette
de lecture manuelle n'est pas signée sur chaque plateforme.

Aucun changement de cette passe ne touche au décodage vidéo, HDR, shaders, P2P,
cast ou protocole de lecture.

## Travaux finalisés

### Distribution et updater

- Le site Vercel inclut désormais tous ses assets publics et répond sur
  `https://vayra.eybo.tech`.
- Le canal updater pointe exclusivement vers
  `https://vayra.eybo.tech/updates/latest.json` avec une nouvelle clé publique
  VAYRA. La clé privée correspondante est hors dépôt et disponible dans GitHub
  Actions.
- Le gateway updater accepte uniquement les manifests dont les artefacts sont
  servis par `github.com/elie00/vayra/releases/download/`. Sans release signée,
  il retourne la version courante avec `platforms: {}`.
- Le workflow `desktop-release.yml` prépare une release GitHub brouillon,
  construit les trois plateformes, exige les secrets de signature, notarise
  macOS, vérifie Authenticode sous Windows, atteste les artefacts, génère
  `latest.json` puis ne publie que sur demande explicite.
- Le workflow `android-release.yml` fabrique APK et AAB multi-ABI, vérifie leurs
  signatures, produit les sommes SHA-256 et les attestations de provenance.
- Le workflow Flatpak produit maintenant `VAYRA.flatpak` et un artefact nommé
  `vayra-flatpak-x86_64`.
- `pnpm release:check` contrôle les versions package/Tauri/Cargo/Android,
  l'identité VAYRA, le canal updater, la configuration de release et les URLs
  publiques.

### macOS

- `scripts/bundle-libmpv-macos.mjs` cible `VAYRA.app`, embarque libmpv et toutes
  ses dépendances transitives, retire les chemins Homebrew et re-signe l'app.
- La recette locale a embarqué 47 dylibs et validé `codesign --verify`.
- La CI de release utilise le hardened runtime, notarise l'app, agrafe le ticket,
  fabrique le DMG, le notarise puis signe le bundle updater.

### Compte et Supabase

- L'utilisateur peut supprimer lui-même son compte cloud depuis les réglages,
  après saisie de `DELETE VAYRA`.
- La RPC `cira_delete_account()` est transactionnelle, `SECURITY DEFINER`, sans
  paramètre d'identité et limitée à `auth.uid()`.
- La migration `20260718193000_cira_self_service_account_deletion.sql` a été
  appliquée au projet Supabase lié après sauvegarde locale du schéma et des
  données.
- Les 23 migrations locales et distantes sont alignées jusqu'à
  `20260718193000`.

### Site, support et documentation

- Les routes `/`, `/privacy`, `/terms`, `/support`, `/sitemap.xml`,
  `/cira/invite`, `/vara/invite`, `/updates/latest.json` et
  `/updates/versions.json` répondent en production.
- Les politiques publiques distinguent données locales, CIRA cloud, intention
  VEYA éphémère et LUMA locale.
- Le README ne dépend plus des captures Harbor, ne promet plus de binaires non
  publiés et décrit correctement VARA/VEYA.
- Les métadonnées GitHub utilisent le domaine canonique VAYRA. Issues et
  Discussions sont activés. L'environnement GitHub `release` existe.

## Micro-commits de la passe

| Commit | Objet |
|---|---|
| `bb5f87c` | inclure les assets publics dans les déploiements Vercel |
| `02b6b7c` | isoler le canal updater VAYRA |
| `1416247` | embarquer libmpv dans `VAYRA.app` |
| `88a8576` | suppression de compte cloud en libre-service |
| `511600e` | pages publiques privacy, terms et support |
| `49eaa43` | invariants automatisés de release |
| `8281b0c` | build Android signé |
| `78e8a8f` | artefact Flatpak nommé VAYRA |
| `a2aa4af` | gateway de manifests signés |
| `7ef7385` | suppression du conflit avec le fallback statique |
| `1122444` | orchestration de la distribution desktop signée |
| `de06edf` | alignement des promesses publiques du README |

## Validations réellement exécutées

| Commande ou recette | Résultat |
|---|---|
| `pnpm exec tsc -b` | PASS |
| `pnpm lint` | PASS, zéro warning ESLint |
| `pnpm test` | PASS, 46 fichiers et 405 tests |
| `pnpm build` avec rustup stable + WASM | PASS |
| `cargo check --manifest-path src-tauri/Cargo.toml` | PASS |
| `cargo test --manifest-path vayra-core/Cargo.toml --all-targets` | PASS, 56 tests |
| `pnpm release:check` | PASS pour VAYRA 0.9.36 |
| `git diff --check` | PASS |
| suite SQL CIRA/VARA locale | PASS, 23/23 |
| `supabase migration list --linked` | PASS, local = distant |
| build local Vercel production | PASS |
| déploiement Vercel production | PASS |
| recette HTTP des routes publiques | PASS |
| script d'intégration libmpv macOS | PASS, 47 dylibs et signature ad hoc valide |
| CI frontend GitHub | PASS |
| CI Rust/Tauri GitHub | PASS |
| CI base CIRA GitHub | PASS |

Le build Vite signale encore des avertissements de découpage de chunks et le
`eval` fourni par `lottie-web`. Ils ne font pas échouer le build et doivent être
mesurés avant un refactor de performance.

## Prérequis externes restant avant distribution publique

1. Fournir un certificat **Apple Developer ID Application** et les secrets de
   notarisation `APPLE_*` au dépôt GitHub.
2. Fournir un certificat **Windows Authenticode** et les secrets
   `WINDOWS_CERTIFICATE*`.
3. Exécuter la recette de lecture réelle sur macOS Apple Silicon, Windows x64,
   Linux x64 et Android : source réseau, fichier local, audio/sous-titres,
   fullscreen, reprise LUMA, VARA/VEYA et cast sur appareil disponible.
4. Confirmer la délivrabilité de `privacy@eybo.tech`.
5. Faire valider l'identité juridique, les mentions et les conditions avant une
   diffusion commerciale ou grand public.
6. Renseigner seulement les identifiants OAuth/licences réellement détenus pour
   les proxies optionnels AniList, MAL, Trakt, TVDB et feedback. Les variables
   Vercel existent mais restent vides ; les endpoints historiques fonctionnels
   ne doivent pas être coupés avant leur remplacement qualifié.
7. Créer et publier le tag `v0.9.36` uniquement après succès des workflows
   signés et de la recette manuelle. Aucune release GitHub n'est publiée au
   moment de ce rapport.

## Recette de publication

1. Fusionner cette branche dans `main` après CI verte.
2. Déclencher `android-release` sur `main` et vérifier APK/AAB sur un appareil.
3. Ajouter les certificats desktop manquants.
4. Déclencher `desktop-release` avec `release_tag=v0.9.36` et `publish=false`.
5. Télécharger les artefacts du brouillon et signer la recette de lecture.
6. Relancer avec `publish=true` seulement si les artefacts et la recette sont
   identiques et valides.
7. Vérifier que le gateway public retourne `0.9.36` avec les trois plateformes,
   puis tester l'absence de mise à jour sur 0.9.36 et une mise à jour depuis la
   release VAYRA précédente lorsqu'elle existera.
