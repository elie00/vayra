# VAYRA — site

Landing publique de **VAYRA** (*A product by EYBO*) et fonctions serverless qui
préparent le remplacement progressif des services `harbor.site`. La landing est
statique (HTML/CSS/JS, zéro build) et l'ensemble est déployé sur Vercel.

## Contenu
- `public/index.html` — landing (hero, expérience, VARA/VEYA, téléchargements)
- `public/styles.css` — direction Mineral Monochrome
- `public/motion.js` — révélations légères avec mode mouvement réduit
- `public/favicon.svg` — marque VAYRA monochrome
- `api/` — fonctions serverless OAuth, métadonnées et feedback
- `vercel.json` — config statique (clean URLs, en-têtes de sécurité)

## Déploiement Vercel
Rien à builder pour la landing. Vercel sert `public/` et déploie séparément les
fonctions placées sous `api/`. Deux options :

1. **Import GitHub** (compte Vercel connecté à GitHub) : importer ce dépôt sur
   vercel.com → déploiement automatique à chaque push.
2. **CLI** : `vercel login` (une fois), puis `vercel deploy --prod`.

## Portée
Le site fournit la face publique et plusieurs remplacements serverless documentés
dans `VAYRA-INFRA-SETUP.md`. Les endpoints dépendant de secrets restent inertes
tant que leur configuration Vercel n'est pas terminée. Le relay WebSocket VARA
reste auto-hébergé par l'utilisateur et n'est pas servi par ce projet.
