# Analyse du projet VAYRA — 3 octobre 2026

## Périmètre et état examiné

Audit du dépôt local et observation non intrusive de l’application macOS personnelle. HEAD `bf1459d9`, branche `feat/android-meta-preview-sheet`, versions package/Tauri/app installée `0.9.42`. L’état de travail contient des modifications Android, de `pick-card.tsx`, de `mobile-integration.tsx` et de `HANDOFF.md`, ainsi que des fichiers non suivis. Ils ont été conservés. Les tests portent sur cet état local, pas uniquement sur HEAD.

Aucune correction produit, installation, publication, modification de compte ou manipulation de téléchargement. Web et diffusion publique exclus. Lecture des références locales Checklist Design : composants, chargement, intégrations, recherche, filtres et enregistrement. Le corpus est un guide ; sa conformité complète n’est pas revendiquée.

## Appréciation

Le projet dispose d’une architecture et de garde-fous substantiels. Le risque principal pour l’usage personnel est désormais la continuité des parcours entre sources externes, résolution torrent/debrid, lecteur natif et téléchargement. Le succès des tests simulés ne suffit pas à qualifier ces transitions dans WebKit/libmpv ou face à un réseau intermittent.

### Architecture

- `src/` : React 19, TypeScript, Vite et Tailwind ; navigation, découverte, addons, réglages, lecture et téléchargements. Les principales vues sont chargées à la demande. `src/App.tsx:852` définit un contrat exhaustif de montage des vues.
- `src-tauri/` : Tauri 2 et Rust ; libmpv, moteur torrent, stockage sécurisé, fichiers locaux, proxy, transcodage et cast. FFmpeg, ffprobe et yt-dlp sont des ressources natives du paquet.
- `vayra-core/` : moteur Rust de classement, disponible en natif et WASM avec repli TypeScript.
- LUMA : continuité/file personnelle ; CIRA : relations et cercles ; VARA/VEYA : salles et synchronisation. Leur qualification multi-appareils est distincte de cet audit Mac.
- `vara-broker/`, Supabase et `site/` ajoutent des frontières réseau et de déploiement. Ils n’ont pas été qualifiés ici.

Les frontières sont identifiables, mais l’orchestration reste dense : `App.tsx` compte 1 139 lignes, `src-tauri/src/lib.rs` 903 et `torrent_engine.rs` 832. Ces tailles sont des signaux de maintenabilité, pas des défauts prouvés.

## Preuves actuelles

| Contrôle | Résultat |
|---|---|
| `pnpm exec tsc -b` | Réussi |
| `pnpm test` | 155 fichiers, 989 tests réussis |
| `pnpm lint` | Réussi ; 270 rejets Promise vides sur un budget de 271 |
| `pnpm test:design` | 14/14 contrôles ; 122 cibles non sémantiques, 36 autofocus, 163 transition-all |
| `cargo test --lib` dans `src-tauri` | 75 tests réussis, 1 ignoré (essai réseau réel) |
| App installée | Version 0.9.42 vérifiée dans Info.plist ; arbre d’accessibilité du lecteur observé |
| Build natif, CI distante, audit dépendances actuel | Non vérifiés |
| Cast, reprise prolongée, intégrité fichier, comptes multiples | Non réalisés |

L’application était en lecture de MobLand. L’arbre d’accessibilité expose Retour, Pause, changement de source, audio, sous-titres, téléchargement, PiP et plein écran avec des noms français. Aucun contrôle n’a été activé pour préserver la session. Cela ne prouve ni la langue effective de la piste ni une lecture prolongée ni la correspondance du binaire avec HEAD.

## Matrice UI/UX

| Checklist / contrat | État | Preuve et limite |
|---|---|---|
| Navigation et commandes | Couvert pour les contrats examinés | Montage exhaustif et tests ; noms accessibles du lecteur observés |
| Focus et mouvement réduit | Partiel | Contrats statiques passants ; 122 cibles div/span avec onClick à examiner individuellement ; focus réel non testé |
| Cartes et images absentes | Partiel | PickCard est un bouton et gère une image de repli ; dimensions et textes longs non vérifiés visuellement |
| Chargement des vues | Partiel | Import différé mais plusieurs Suspense sans indicateur ; voir écart 3 |
| Sous-titres avant lecture | Partiel | Chargement, défilement et bouton de lancement présents ; validation Entrée globale absente |
| Intégrations et secrets | Partiel | Trousseau et migration testés ; repli vers stockage local en cas d’échec |
| Recherche, filtres et états vides | Non vérifié intégralement | Aucune recette native réalisée pendant la lecture ; pas de conformité générale déduite des tests |
| Téléchargements et récupération | Partiel | Tests de politique, persistance, lecture hors ligne et rétention présents ; recette réseau prolongée non réalisée |
| Français | Partiel | Commandes observées en français ; parité de catalogues testée par la suite, qualité de tous les textes non examinée |

## Écarts et lots proposés

### 1. Protection des secrets dégradée lors d’un échec du trousseau

Source : `src/lib/settings/secret-vault.ts:88`, `:101`, `:192`. Après un échec d’écriture, le code restaure les secrets dans les blobs localStorage et désactive le coffre. Ce repli évite une perte de configuration, mais réduit la protection au repos. Le diagnostic actuel passe par console.warn ; aucun incident courant du trousseau n’a été constaté ici et aucun secret réel n’a été lu.

Priorité P1 de conception : rendre cet état visible et décider explicitement du compromis de persistance. Critère : sur fixture avec écriture refusée, l’utilisateur est informé, les valeurs restent récupérables et aucun journal ne contient de secret.

### 2. Entrée ne confirme pas globalement la sélection de sous-titres

Source : `src/views/play-picker/subtitle-select-step.tsx:42` et `:168`. Le gestionnaire clavier global traite uniquement Échap. Entrée sur un bouton focalisé conserve son comportement natif, mais Entrée depuis une option ne déclenche pas globalement le lancement demandé dans le parcours.

Priorité P2 : ajouter une confirmation respectant composition IME, répétition, modificateurs et chargement. Critère : sélectionner une piste au clavier puis Entrée lance une seule fois avec cette piste ; Échap annule ; composition et chargement ne déclenchent pas de lecture. Défilement présent dans le code ; recette à hauteur minimale 960 × 600 encore nécessaire.

### 3. Absence d’indicateur pendant le chargement initial de plusieurs vues

Source : `src/App.tsx:860` et les Suspense voisins utilisent `fallback={null}`. Si le module n’est pas encore chargé, son contenu n’est pas rendu pendant l’import. L’apparition d’un blanc perceptible dans le binaire installé n’a pas été reproduite.

Priorité P2 : prévoir un état discret si le chargement dépasse un seuil perceptible. Critère : import retardé sur fixture, indicateur accessible et restauration correcte du contenu/focus ; pas de clignotement sur navigation chaude.

### 4. Les budgets de dette empêchent la hausse, sans résorber la dette

Sources : `scripts/check-design.mjs:139`, `:168` et `scripts/check-silent-errors.mjs`. Les chiffres passants ne prouvent pas 122 défauts clavier ou 270 erreurs utilisateur : chaque occurrence doit être contextualisée. Ils révèlent toutefois une couverture partielle des interactions et du traitement d’erreur.

Priorité P2 progressive : traiter d’abord les actions de lecture, de téléchargement et de configuration. Critère : chaque action critique est accessible au clavier et son échec visible ; les budgets diminuent avec des tests portant sur le comportement.

## Suite recommandée

1. Qualifier dans l’app Mac les transitions source → première image → pistes françaises → progression soutenue, puis téléchargement → pause → reprise → lecture locale, avec médias de test isolés.
2. Corriger séparément le repli du coffre et la confirmation de sous-titres après autorisation d’implémentation.
3. Réduire progressivement la dette d’accessibilité et d’erreurs sur les parcours critiques, sans refonte esthétique générale.
4. Rafraîchir les informations d’installation et de signature de HANDOFF lors du prochain build : le texte courant reste daté de septembre et mentionne une expiration au 2 octobre. Cela ne constitue pas une vérification de l’identité actuellement disponible.

Le présent audit conclut à un socle frontend vérifié localement, avec une qualification native et réseau encore partielle. Il ne conclut pas à l’absence de régressions ni à la disponibilité des sources tierces.
