# VAYRA Private Beta Launch — produit, sécurité et recette

État de référence : branche `main`, à partir de `932b821`.

Ce document décrit le parcours complet de lancement privé de VAYRA. Il ne crée
aucune nouvelle fonction sociale, ne change aucune table Supabase et ne modifie
ni le player, ni le cast, ni Stremio, ni les protocoles VARA/VEYA.

## 1. Cartographie réelle

| Surface | Fichiers et symboles | État après ce chantier |
|---|---|---|
| Auth email | `src/lib/vayra-account.tsx`, `VayraAccountProvider` | session Supabase PKCE existante ; `refreshAccess()` renouvelle explicitement le JWT après activation opérateur |
| Gate bêta | `src/lib/cira/provider.tsx`, `src/lib/vara/provider.tsx` | accès uniquement si `user.app_metadata.cira_beta === true` |
| Onboarding général | `src/components/onboarding.tsx`, `src/lib/onboarding.tsx` | inchangé ; le guide bêta attend sa fin |
| Guide bêta | `src/components/private-beta-launch-modal.tsx` | parcours progressif, clavier, focus piégé, dismissible et rouvrable |
| Progression locale | `src/lib/private-beta-launch.ts`, `src/lib/private-beta-launch-provider.tsx` | cinq booléens versionnés, isolés par compte et supprimés à la déconnexion |
| Réouverture | `src/views/settings/private-beta-guide-card.tsx` | checklist et reprise depuis Réglages > CIRA |
| Profil/relation/QR | `src/views/settings/cira-panel.tsx` | réutilisation intégrale du profil, handle exact et CIRA Discover existants |
| Groupes | `src/views/settings/cira-groups-card.tsx` | création ou adhésion existante ; un groupe archivé ne valide pas l’étape |
| Watch Room | `src/views/settings/vara-rooms-card.tsx` | prérequis local explicite, création/join et transfert d’hôte existants |
| Aide | `src/lib/private-beta-help.ts`, `src/views/settings/private-beta-help-card.tsx` | sept scénarios de récupération sans oracle de blocage |
| Feedback | `src/views/settings/bug-report-panel.tsx` | envoi volontaire ; pièces jointes soumises à confirmation explicite |
| Diagnostic | `src/lib/bug-report.ts`, `diagnostics-card.tsx` | local uniquement, redacted, copiable et effaçable ; jamais joint automatiquement |
| i18n | `src/lib/i18n/locales/private-beta.ts` | catalogue dédié dans les sept locales, parité et placeholders testés ; l’anglais reste le fallback officiel des traductions non encore spécialisées |

## 2. Parcours bêta complet

1. L’utilisateur crée son compte VAYRA par email et ouvre son lien magique.
2. L’opérateur active `cira_beta` pour l’UUID exact du compte.
3. L’utilisateur clique **Actualiser l’accès bêta** ; aucun token n’est copié ou
   collé manuellement.
4. Après l’onboarding général, le guide privé s’ouvre. Il explique en langage
   courant la confidentialité avant le vocabulaire CIRA/VARA/VEYA.
5. L’utilisateur crée son profil CIRA et son handle unique.
6. Il ajoute une personne connue par handle exact ou QR temporaire, puis obtient
   une relation acceptée.
7. Il crée ou rejoint un groupe privé actif.
8. Il confirme le briefing : chaque participant ouvre son propre contenu ; VAYRA
   ne partage aucune source et VEYA ne synchronise que l’intention de lecture.
9. Il crée ou rejoint une VARA. La première room active termine le guide.
10. À la sortie, il peut quitter la room, transférer l’hôte avant de partir ou
    fermer la room s’il en est propriétaire. À son retour, le guide et l’aide
    restent disponibles dans Réglages > CIRA.

## 3. État et persistance de l’onboarding

Clé : `vayra.private-beta-launch.v1:<user-id-sanitized>`.

Valeur autorisée :

```ts
{
  version: 1;
  dismissed: boolean;
  roomBriefingSeen: boolean;
  roomOpened: boolean;
  completed: boolean;
}
```

Les états `profile`, `relationship` et `group` sont toujours dérivés de CIRA ;
ils ne sont pas dupliqués localement. Une valeur corrompue ou de version future
retombe sur l’état initial. Le stockage n’accepte aucun champ additionnel. Il
est supprimé lors d’une déconnexion ou d’un changement de compte.

Conditions d’affichage : compte connecté, flag bêta présent, CIRA `ready`,
onboarding général terminé, guide ni terminé ni écarté. La fermeture par le
bouton ou `Échap` le masque jusqu’à une réouverture volontaire depuis CIRA.

## 4. Catalogue d’erreurs utilisateur

| Situation | Cause probable | Formulation/action | Données interdites |
|---|---|---|---|
| Accès bêta absent | JWT ancien ou compte non activé | actualiser l’accès ; indiquer seulement « pas encore activé » | token, email dans les logs |
| Room pleine | limite atteinte | libérer une place ou créer une autre room | liste de sources/appareils |
| Lien expiré/révoqué | TTL ou révocation | demander un nouveau lien court | ancien token |
| Room fermée/expirée | TTL/close | créer une nouvelle room | identifiant/topic dans le diagnostic |
| Accès perdu | retrait, blocage ou changement de groupe | retourner dans CIRA sans révéler la cause | oracle de blocage |
| Conflit local | session locale historique active | la quitter avant la VARA distante | contenu/source de la session |
| Hôte actif | lease VEYA valide | attendre ou transférer le contrôle | état média détaillé |
| Transfert impossible | membre/lease devenu obsolète | actualiser la room et choisir un membre actif | topic Realtime |
| Groupe archivé | groupe gelé | restaurer par owner/admin ou utiliser une VARA directe | activité du groupe |
| Réseau | connectivité momentanée | rétablir, quitter/rentrer si état figé | IP, appareil, opérateur réseau |

Le catalogue complet et testable est dans `src/lib/private-beta-help.ts`.

## 5. Diagnostic volontaire privacy-safe

### Autorisé

- version VAYRA ;
- chaîne fixe `private-beta` ;
- au maximum vingt messages d’erreur déjà nettoyés.

### Interdit et redacted

Contenu regardé, progression, bibliothèque, URL HTTP/WebSocket/deep-link,
source, addon, info-hash, magnet, JWT, code d’invitation, IP, chemin local,
appareil, user-agent, viewport, locale, session Stremio et compte d’intégration.

### Cycle de vie

- le tampon brut est uniquement en mémoire, limité à 50 entrées ;
- l’aperçu exporte au maximum les 20 dernières entrées sans timestamp ;
- aucune écriture disque et aucun upload automatique ;
- **Copier le diagnostic local** est une exportation volontaire et inspectable ;
- **Effacer le diagnostic local** vide immédiatement le tampon ;
- la fermeture de l’application termine naturellement sa rétention.

Le rapport libre et les pièces jointes utilisent toujours l’infrastructure de
support historique, hors de ce dépôt. L’utilisateur doit confirmer avoir revu
chaque pièce jointe. La recette de release est bloquée si la politique de
rétention de ce service n’est pas connue ; le diagnostic local, lui, n’en dépend
plus puisqu’il n’est jamais joint automatiquement.

## 6. Décisions par plateforme

| Plateforme | Décision | Recette requise |
|---|---|---|
| Desktop Tauri | flux complet ; session email dans le keyring ; guide modal | focus/Échap/Tab, deep link email, QR import, création et join VARA |
| Android | flux complet ; permissions caméra déjà gérées par CIRA Discover | refus/acceptation caméra, QR photo, retour arrière, rotation, reprise réseau |
| Web | session Supabase web et import QR ; pas d’hypothèse sur caméra native | URL preview, stockage bloqué, clavier, responsive et suppression du fragment |

Le guide utilise des propriétés CSS logiques et les catalogues RTL existants.
`prefers-reduced-motion` continue d’être gouverné par les styles globaux ; aucune
nouvelle animation obligatoire n’a été ajoutée.

## 7. Matrice de tests et recette réelle

- compte non activé : état restreint, refresh sans oracle ;
- activation : refresh JWT puis passage à CIRA sans reconnexion forcée ;
- valeur locale absente/corrompue/future : récupération sans crash ;
- profil, relation et groupe : chaque étape se valide seulement sur l’état réel ;
- groupe archivé : étape groupe non validée ;
- briefing : aucun média/source n’est enregistré ;
- première VARA : étape validée à l’ouverture, pas à la simple invitation ;
- déconnexion : clé de progression supprimée ;
- room pleine, expirée, retirée/bloquée, groupe archivé : action utile sans fuite ;
- diagnostic : opt-in de copie, redaction, effacement, zéro upload implicite ;
- desktop : clavier, lecteur d’écran, deep link, deux comptes ;
- Android : caméra refusée/acceptée, QR, lifecycle et reconnexion ;
- web : preview, import image, stockage indisponible, responsive ;
- régression : Stremio reste indépendant ; LUMA, player, cast, P2P et protocoles inchangés.

## 8. Décision de périmètre

Le périmètre livré est une **v1 complète de lancement bêta privée**, pas un MVP :
activation, première relation, groupe, première room, aide de récupération,
feedback/diagnostic privacy-safe, i18n, accessibilité, exploitation et recette.
Les fonctions sociales exclues restent explicitement hors produit.

Verdict logiciel : **PASS AVEC LIMITES** jusqu’à la recette réelle à deux
comptes sur desktop et Android et la confirmation opérateur de la rétention du
service de rapports manuels. Tout échec privacy, gate JWT ou accès après retrait
fait passer le verdict à **BLOQUÉ**.
