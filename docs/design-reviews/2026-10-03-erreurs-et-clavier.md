# Téléchargements et langues — 3 octobre 2026

## Périmètre

Deuxième lot d’amélioration autorisé, ciblant macOS personnel. État local issu de `bf1459d9`, branche `feat/android-meta-preview-sheet`. Changements précédents et Android conservés. Références locales checklist-design : boutons, champs, divulgation d’aide et retour d’erreur ; boucle `docs/DESIGN_VERIFICATION_LOOP.md` appliquée. Aucun compte, fichier média ou téléchargement réel modifié.

## Défauts et changements

1. `src/lib/download/downloads-store.ts`, `revealDownload` : l’échec de l’ouverture du dossier était avalé. Il émet désormais un retour global d’erreur traduit dans les six langues. Le téléchargement reste inchangé ; l’exception native brute n’est pas exposée. Le test simule un refus de l’outil système, vérifie le message, l’absence de mutation et une nouvelle tentative réussie.
2. `src/views/settings/streaming-panel.tsx`, `LanguagesPicker` : la recherche n’avait qu’un placeholder et les langues sélectionnées portaient le nom de la langue sans annoncer leur retrait. Le champ dispose d’un nom accessible explicite et d’un type recherche ; les boutons de retrait annoncent leur action. Ajouter/retirer une langue replace le focus dans la recherche, car la puce activée change de liste ou disparaît. Test de comportement sur retrait de Français avec maintien d’Anglais et restauration du focus.
3. `src/views/play-picker/cached-tip.tsx` : l’état ouvert de l’aide n’était pas exposé. Le bouton annonce maintenant `aria-expanded` et référence le texte par `aria-controls`.

## Matrice

| Checklist | État | Preuve |
|---|---|---|
| Retour d’erreur sur une action disque | Couvert en simulation | Refus d’ouverture, message public sans détails privés, téléchargement inchangé et nouvelle tentative |
| Champ de recherche de langues | Couvert en source | Nom accessible, type search, boutons non submit |
| Retrait de langue et focus | Couvert en simulation | Sélection restante transmise et focus sur recherche |
| Aide dépliable | Couvert en source | Identifiant lié et état d’expansion |
| Présentation et clavier WebKit | Non vérifié | Session MobLand ouverte dans l’app installée ; aucune navigation ou fermeture |

Les tests simulés et contrats statiques ne qualifient pas Finder ni les dimensions natives. Recette restante : ouvrir Téléchargements puis Afficher dans le dossier, vérifier le retour d’erreur sur fixture isolée, ajouter/retirer une langue et poursuivre la recherche au clavier. Aucune mise en panne du dossier personnel ne doit servir à la recette.

Validation finale : TypeScript, 157 fichiers / 995 tests, lint, 14/14 contrôles design et tous les budgets de bundle réussis. Le chargement initial lié mesure 818,6 Kio gzip pour un plafond de 840 Kio. Les budgets de dette restent inchangés ; les améliorations ici portent sur des comportements non mesurés par ces compteurs.

`pnpm tauri:build:macos` réussi sur l’état final : 47 bibliothèques embarquées et vérification codesign stricte réussie. Paquet `src-tauri/target/release/bundle/macos/VAYRA.app`, signature ad hoc. Les fichiers WASM régénérés ont été remis à leur état initial après le build. `/Applications/VAYRA.app` n’a pas été remplacée, afin de préserver la session vidéo observée. Installation et recette native restent non réalisées.
