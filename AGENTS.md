# VAYRA — travail dans ce dépôt

La priorité actuelle est l’application macOS personnelle installée sur le Mac
de l’utilisateur. La version web et la diffusion publique restent hors périmètre
sauf demande explicite. Préserver les changements locaux étrangers au lot.

## Design et audit UI/UX

Pour concevoir, modifier ou auditer une interface ou un parcours, utiliser le
skill local [checklist-design](.agents/skills/checklist-design/SKILL.md), puis la
[boucle de vérification](docs/DESIGN_VERIFICATION_LOOP.md). Il est versionné et
autonome : aucun fichier du projet Pilot ni dossier Claude global n’est requis.

Une demande d’audit autorise l’analyse et un rapport, pas la correction
automatique des fonctions du produit. Distinguer validation des sources, tests
automatiques et essais dans `/Applications/VAYRA.app`. Ne pas supprimer de
téléchargements, modifier des comptes ou exposer des secrets pour une recette.

## Commits et pull requests

Les commits et les descriptions de PR ne créditent aucun assistant IA : pas de
ligne `Co-Authored-By: Claude…` ni de mention « Generated with Claude Code », sur
macOS comme sur Windows. `.claude/settings.json` coupe cette attribution dans
Claude Code, le hook `.githooks/commit-msg` (activé par `pnpm install`) retire ces
lignes, et le contrôle CI `commit-policy` refuse une PR qui en contient encore.
