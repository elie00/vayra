# Compte rendu — VAYRA Private Beta Launch

Date du bilan : 16 juillet 2026  
Branche livrée : `main`  
Dernier commit fonctionnel audité : `3244f3c`

## Résultat

Le parcours complet de lancement de la bêta privée VAYRA est implémenté. Un
compte invité peut renouveler son accès, configurer son identité CIRA, établir
une relation intentionnelle, créer ou rejoindre un groupe privé, comprendre le
fonctionnement local des contenus, puis créer ou rejoindre sa première VARA.

Le périmètre livré est une version complète du parcours de lancement, pas un
MVP. Aucune nouvelle fonction sociale, migration Supabase ou modification du
player, du cast, de Stremio, de LUMA ou des protocoles VARA/VEYA n'a été ajoutée.

## Travaux réalisés

### Accès à la bêta

- Ajout de `refreshAccess()` dans `VayraAccountProvider`.
- Renouvellement explicite de la session Supabase avec
  `supabase.auth.refreshSession()`.
- Ajout du bouton **Actualiser l'accès bêta** dans l'état CIRA restreint.
- Conservation stricte du gate existant
  `user.app_metadata.cira_beta === true`.
- Aucun token n'est demandé, copié ou injecté manuellement.

### Onboarding privé

- Ajout d'un guide modal progressif après l'onboarding général.
- Présentation en langage courant avant le vocabulaire CIRA, VARA et VEYA.
- Étapes couvertes : profil, relation acceptée, groupe actif, briefing de
  confidentialité et première VARA ouverte.
- Guide dismissible avec `Échap`, navigation clavier et focus piégé.
- Checklist persistante et réouverture depuis Réglages > CIRA.

### Persistance locale

La progression utilise uniquement :

```ts
{
  version: 1;
  dismissed: boolean;
  roomBriefingSeen: boolean;
  roomOpened: boolean;
  completed: boolean;
}
```

- Aucun média, titre, URL, source, addon, historique ou état du player.
- Les états profil/relation/groupe sont dérivés de CIRA et non dupliqués.
- Récupération sûre en cas de valeur absente, corrompue ou de version future.
- Suppression des drapeaux locaux à la déconnexion ou au changement de compte.

### Aide et récupération

Un catalogue d'aide couvre :

- contenu à ouvrir localement par chaque participant ;
- lecture non synchronisée ;
- perte de connexion ;
- transfert d'hôte VEYA ;
- room expirée ou fermée ;
- perte d'accès après retrait ou blocage ;
- groupe archivé.

Les erreurs VARA proposent une action concrète sans révéler si la cause exacte
est un blocage, un retrait ou une modification de groupe.

### Confidentialité des rapports

- Suppression de la collecte automatique de l'appareil, OS, user-agent,
  viewport, locale et intégrations configurées.
- Redaction des URLs, deep links, magnets, info-hash, JWT, codes d'invitation,
  IP et chemins locaux.
- Diagnostic limité à la version, au canal bêta et aux erreurs nettoyées.
- Tampon conservé uniquement en mémoire, limité et effaçable immédiatement.
- Copie locale volontaire disponible pour inspection.
- Aucun diagnostic joint automatiquement au formulaire complet ou au
  signalement depuis l'écran d'erreur.
- Confirmation obligatoire avant l'envoi d'une capture ou d'un enregistrement.
- Noms de pièces jointes remplacés par des noms génériques avant l'envoi.

### Internationalisation et accessibilité

- Nouveau catalogue `private-beta` chargé dans les sept locales existantes.
- Parité de clés et placeholders vérifiée par tests.
- Français spécialisé pour le parcours complet.
- Fallback anglais conservé pour les traductions secondaires non spécialisées,
  conformément au fonctionnement i18n existant.
- Propriétés logiques compatibles RTL, libellés lecteur d'écran, focus modal et
  commandes clavier.

### Exploitation

- Procédure d'ajout et de retrait du flag `cira_beta`.
- Renouvellement et révocation de session documentés.
- Procédure d'incident privacy/access/room.
- Rollback client atomique documenté.
- Suppression d'un compte de test et vérification de cascade CIRA documentées.
- Matrice de recette desktop, Android et web.

## Commits réalisés et poussés

| Commit | Objet |
|---|---|
| `1ba96f2` | `fix(privacy): make beta diagnostics explicitly safe` |
| `103365e` | `feat(beta): refresh invited account access` |
| `4a7a212` | `feat(beta): track privacy-safe launch progress` |
| `00ee699` | `feat(beta): guide the first private watch room` |
| `39b98db` | `feat(beta): add private room recovery guidance` |
| `f3e5c8e` | `feat(i18n): register private beta launch copy` |
| `283fe27` | `fix(privacy): keep beta diagnostics local` |
| `932b821` | `fix(privacy): clear beta progress on sign-out` |
| `1659569` | `docs(beta): add launch and operator runbooks` |
| `3244f3c` | `fix(privacy): detach diagnostics from error reports` |

## Fichiers principaux

- `src/components/private-beta-launch-modal.tsx`
- `src/lib/private-beta-launch.ts`
- `src/lib/private-beta-launch-provider.tsx`
- `src/lib/private-beta-help.ts`
- `src/lib/vayra-account.tsx`
- `src/lib/bug-report.ts`
- `src/views/settings/private-beta-guide-card.tsx`
- `src/views/settings/private-beta-help-card.tsx`
- `src/views/settings/cira-panel.tsx`
- `src/views/settings/vara-rooms-card.tsx`
- `src/views/settings/bug-report-panel.tsx`
- `src/lib/i18n/locales/private-beta.ts`

## Validations réellement exécutées

| Commande | Résultat |
|---|---|
| `pnpm lint` | Succès, aucune alerte ESLint |
| `pnpm test` | Succès, 46 fichiers et 405 tests passés |
| `pnpm build` avec Rust Homebrew | Échec avant compilation : cible WASM absente du sysroot Homebrew |
| `PATH="$HOME/.cargo/bin:$PATH" pnpm build` | Succès, WASM, TypeScript et build Vite produits |
| `git diff --check` | Succès |
| comparaison `origin/main...main` | `0 0`, branche synchronisée |

Les avertissements Vite relatifs aux imports mixtes, à `lottie-web` et à la
taille de certains chunks préexistaient et n'ont pas bloqué le build.

## Invariants préservés

- Aucun contenu regardé ou historique envoyé à CIRA ou VARA.
- Aucune URL de stream, source, addon, info-hash, progression, IP, information
  d'appareil, chemin local ou session Stremio dans le guide ou le diagnostic.
- LUMA reste local et indépendant.
- CIRA reste sans annuaire, import de contacts, chat, feed, followers, likes,
  commentaires ou recommandations.
- Aucun changement de logique player, mpv, ExoPlayer, HTML5, cast ou P2P.
- Aucun changement de migration, RLS, Realtime, endpoint ou secret.

## Verdict et limites restantes

Verdict logiciel : **PASS AVEC LIMITES**.

L'implémentation et les validations automatisées sont terminées. Les preuves
externes suivantes restent nécessaires avant l'élargissement de la bêta :

1. recette réelle avec deux comptes sur desktop ;
2. recette réelle Android, notamment caméra, lifecycle et reconnexion ;
3. contrôle web preview et stockage navigateur indisponible ;
4. confirmation de la politique de conservation du service historique de
   rapports manuels.

Une fuite privacy, un accès conservé après révocation avec un JWT neuf, un
contournement de blocage/RLS ou une régression player fait immédiatement passer
la release à **BLOQUÉ**.

## Documents de référence

- `docs/private-beta-launch.md` : architecture produit, cycle de vie, catalogue
  d'erreurs, diagnostic, plateformes et matrice de recette.
- `docs/private-beta-operator-runbook.md` : activation/retrait bêta, JWT,
  incidents, rollback et suppression des comptes de test.
