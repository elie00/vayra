# VAYRA — site

Landing publique de **VAYRA** (*A product by EYBO*), destinée à remplacer la
homepage de `harbor.site`. Site **statique** (HTML/CSS, zéro build), déployable
gratuitement sur Vercel.

## Contenu
- `index.html` — landing (hero, fonctions, VARA/VEYA, téléchargements)
- `styles.css` — style (palette Obsidian / Veyra Violet / Orbit Blue / Ivory)
- `favicon.svg` — marque VAYRA
- `vercel.json` — config statique (clean URLs, en-têtes de sécurité)

## Déploiement Vercel
Rien à builder (site statique). Deux options :

1. **Import GitHub** (compte Vercel connecté à GitHub) : importer ce dépôt sur
   vercel.com → déploiement automatique à chaque push.
2. **CLI** : `vercel login` (une fois), puis `vercel deploy --prod`.

## Portée
Ce site remplace la **face publique** (homepage/téléchargements) de `harbor.site`.
Il **ne réplique pas** les services backend de `harbor.site` (serveur d'updates,
proxies OAuth Trakt/MAL/AniList, proxies média TVDB/IMDb, relay WebSocket
`pub.harbor.site`, theme store) : ceux-ci nécessitent un backend avec secrets et
des connexions persistantes, hors périmètre d'un hébergement statique.
