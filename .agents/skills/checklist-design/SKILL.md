---
name: checklist-design
description: "Cadre et audite les écrans, composants et parcours UI/UX de VAYRA avec Checklist Design. Utiliser pour une demande de design, de revue d’interface ou de parcours, et pour vérifier les changements UI avant livraison. Priorité à l’app macOS installée ; ne transforme pas un audit en autorisation de modifier le produit."
---

# Checklist Design — VAYRA

## Références et sélection

Le corpus local vient du skill Claude `checklist-design`, figé au 8 août 2026.
Les textes et leurs URL sources sont conservés dans `references/`. Les règles
ci-dessous adaptent leur usage à VAYRA, sans importer les exigences de Pilot.

1. Lire `references/index.md`, puis les fichiers de catégorie nécessaires :
   `design-system.md` pour les composants ; `web-app.md` pour recherche, réglages,
   comptes, intégrations et états vides ; `flows.md` pour filtres, erreurs et
   enregistrement. Les catégories web décrivent aussi les composants React de
   Tauri : les utiliser ne remet pas la version web en chantier.
2. Charger `mobile.md` ou `website.md` uniquement si le périmètre utilisateur le
   demande. Ne pas appliquer mécaniquement facturation, administration, paiement,
   collecte analytique ou fonctionnalités sociales à une app média personnelle.
3. Lire `docs/DESIGN_VERIFICATION_LOOP.md` depuis la racine du dépôt. Examiner les
   revues voisines dans `docs/design-reviews/` comme historique, pas comme preuve
   actuelle de conformité.

## Contrats VAYRA

- Respecter le périmètre macOS personnel. Aucune publication web ou modification
  de compte, connexion tierce, bibliothèque ou téléchargement réel pour un audit.
- Conserver le fond uniforme et l’absence de séparation verticale de la barre
  latérale ; ne pas réintroduire de tuile active décorative. Garder les animations
  de navigation demandées et leur variante de mouvement réduit.
- Préserver un focus clavier visible, les raccourcis macOS et le plein écran en
  quittant une vidéo. Ne pas confondre plein écran de fenêtre et plein écran média.
- Vérifier français, typographie, textes longs, absence d’image et chargement
  différé. Une même famille de cartes doit garder son gabarit et ses espacements.
- Pour les téléchargements : distinguer attente, actif, pause, interruption,
  erreur et terminé ; ne pas confondre fichier listé, fichier validé et transfert
  réellement testé. Les tests simulés ne prouvent pas une reprise réseau prolongée.
- Pour les add-ons : un chemin évident d’installation/configuration ; distinguer
  VAYRA local, compte VAYRA et liaison Stremio facultative.

## Audit ou implémentation

Dans un audit, analyser et consigner sans corriger les fonctions du produit.
Dans une implémentation autorisée, réutiliser les composants et tokens existants,
traiter les états secondaires et vérifier les parcours affectés après correction.
Ne pas imposer un nouveau style esthétique au seul motif du corpus.

Comparer chaque item sélectionné au code, aux tests et au rendu disponible.
Restituer **couvert**, **partiel** ou **manquant**, avec une mention **non vérifié**
quand la preuve manque plutôt que d’inventer un défaut. Pour chaque écart réel :
scénario, impact, fichier et ligne, correction proposée et critère de vérification.
Prioriser perte de données / action impossible avant inconfort et cosmétique.

Consigner le périmètre, les exclusions et les résultats dans une revue datée
`docs/design-reviews/YYYY-MM-DD-<sujet>.md`. Séparer sources, tests automatisés et
contrôles de l’app installée. Rapporter les limites de l’outil d’interface ; ne
pas assimiler une erreur d’automatisation à un plantage de VAYRA.
