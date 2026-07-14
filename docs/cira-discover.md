# CIRA Discover — produit complet, sécurité et exploitation

**État** : implémenté sur `main` le 14 juillet 2026  
**Périmètre** : relations CIRA privées, sans annuaire ni graphe social public

## Expérience livrée

CIRA Discover permet à un compte VAYRA authentifié et admis dans la bêta de :

- envoyer une demande à un handle saisi exactement, sans résultat de recherche ;
- créer un QR privé temporaire, le copier, le partager et le révoquer ;
- photographier un QR sur Android/mobile ou importer une image PNG, JPEG ou
  WebP sur desktop et web ;
- coller un lien ou un code comme solution de secours accessible ;
- consulter uniquement le nom, le handle et l'avatar local de la personne qui
  invite, puis accepter ou refuser ;
- consulter et révoquer ses invitations encore actives, sans historique social.

Aucun annuaire, recherche partielle, auto-complétion, suggestion, import de
contacts, analytics ou journal d'invitations n'est introduit.

## Flux et contrat de confidentialité

```text
Créateur authentifié
  → RPC cira_create_invitation (secret clair retourné une seule fois)
  → QR de https://vayra.eybo.tech/cira/invite#t=<secret>
  → photo/import décodé localement
  → vayra://cira/invite#t=<secret> ou saisie manuelle
  → aperçu minimal par RPC
  → acceptation ou refus transactionnel
  → suppression immédiate de l'invitation terminale
```

Le code possède 100 bits d'entropie Crockford et la forme
`CIRA-XXXX-XXXX-XXXX-XXXX-XXXX`. Seul son SHA-256 normalisé est stocké dans
Supabase. La durée par défaut est de 15 minutes, le plafond serveur de
30 minutes, et la première décision consomme le secret. Le créateur peut le
révoquer à tout moment.

Le secret ne transite jamais dans une query string. La page HTTPS le lit dans
un fragment unique `#t=`, le retire immédiatement de l'URL et de l'historique,
ne fait aucun appel réseau et interdit cache, referrer, indexation et framing.
L'application ne le place ni dans `localStorage`, ni dans `sessionStorage`, ni
dans une table d'historique.

## Handle exact sans oracle d'existence

Le client normalise uniquement la casse et le `@` initial. La RPC accepte le
format `^[a-z0-9][a-z0-9_]{2,23}$`, puis renvoie le même accusé générique pour :

- un handle existant ;
- un handle inconnu ;
- son propre handle ;
- une personne bloquée dans l'un ou l'autre sens ;
- une relation déjà existante.

Un reçu aveugle privé au demandeur expire après 24 heures. Aucun profil n'est
affiché avant une acceptation ou avant la possession d'un secret d'invitation.
La limite est de 20 demandes directes par 10 minutes et 10 tentatives de
résolution d'invitation par 5 minutes.

## QR et plateformes

| Plateforme | Génération | Acquisition | Décodage | Secours |
|---|---|---|---|---|
| Desktop Tauri | canvas local | import de fichier | local, mémoire courte | lien ou code |
| Android Tauri | canvas local | appareil photo système ou galerie | local, mémoire courte | lien ou code |
| Web | canvas local | caméra système mobile ou fichier | local, mémoire courte | lien ou code |

Le décodage refuse les fichiers de plus de 8 Mio, les formats autres que PNG,
JPEG et WebP, ainsi que les images de plus de 24 mégapixels. L'image est
réduite à 2048 pixels de côté au maximum, le bitmap est fermé et le canvas
temporaire effacé. Une capture photo ponctuelle évite une permission caméra
persistante et une surface vidéo en arrière-plan.

## Menaces traitées

| Menace | Mesure |
|---|---|
| Énumération de handles | saisie exacte, reçu identique, aucun aperçu, rate limit |
| Contournement d'un blocage | contrôle transactionnel serveur dans les deux sens |
| Brute force du secret | 100 bits, hash au repos, rate limit de résolution |
| Replay | usage unique ; terminal supprimé après décision/révocation/expiration |
| Phishing ou QR étranger | origine, chemin, scheme et fragment strictement validés |
| Token en logs/référent | fragment uniquement, `no-referrer`, effacement de l'historique |
| Capture d'écran | TTL court, usage unique, révocation visible |
| Image malveillante | formats, taille et pixels bornés ; aucun upload |
| Fuite sociale | aperçu limité ; aucun média, URL, historique, addon, IP ou appareil |

## Accessibilité

- boutons nommés et champs associés à des libellés accessibles ;
- résultat de scan et erreurs annoncés avec `aria-live` ;
- modal de décision avec `role="dialog"`, focus initial, piège de focus et
  fermeture par `Escape` ;
- parcours intégral au clavier et secours par saisie/collage ;
- QR accompagné d'un code textuel, il n'est jamais l'unique moyen d'agir ;
- interface traduite en anglais, français, allemand, espagnol, italien,
  portugais et arabe, y compris RTL.

## Fichiers structurants

- `supabase/migrations/20260714090000_cira_discover_hardening.sql` : cycle de
  vie terminal sans historique et RPC durcies ;
- `src/lib/cira/invite-code.ts` : contrat partagé code, HTTPS et deep link ;
- `src/lib/cira/discover.ts` : décodage QR/image local et borné ;
- `src/views/settings/cira-panel.tsx` : génération, partage, scan, import,
  handle exact et décision ;
- `site/public/cira/invite.html` et `site/vercel.json` : pont web privé ;
- `supabase/tests/06_invitations.sql` et les tests Vitest Discover : menaces,
  cycle de vie, round-trip QR et politique de la page web.

## Déploiement et recette manuelle

Ordre obligatoire : sauvegarder Supabase, appliquer la migration Discover,
déployer le site, puis livrer l'application. Les anciennes versions restent
compatibles avec le format de code ; elles ne dépendent pas des lignes
terminales désormais supprimées.

Recette à effectuer avec deux comptes et Android + desktop :

1. créer un QR, vérifier le compte à rebours, copier et partager ;
2. photographier le QR sur Android, puis importer sa capture sur desktop ;
3. vérifier que le navigateur ne conserve plus `#t=` après ouverture ;
4. afficher l'aperçu minimal, refuser, puis vérifier que le replay échoue ;
5. recommencer et accepter, vérifier la relation des deux côtés ;
6. révoquer un QR avant usage et vérifier son rejet ;
7. tester un QR expiré, un domaine ressemblant et un fragment supplémentaire ;
8. tester handle réel, inconnu, personnel et bloqué : message client identique ;
9. vérifier navigation clavier, focus, lecteur d'écran et arabe RTL ;
10. confirmer qu'aucun token ni image n'apparaît dans le réseau, le stockage
    web, l'historique, les logs Supabase ou un outil d'analytics.

Les tests automatisés ne remplacent pas cette recette multi-appareils. Aucun
test manuel n'est déclaré réussi tant qu'il n'a pas été exécuté sur les
binaires concernés.

## Journal de déploiement — 14 juillet 2026

- sauvegarde distante réalisée avant migration : schéma et données, puis
  redump du schéma après migration ; fichiers conservés hors du dépôt avec des
  permissions utilisateur uniquement et sommes SHA-256 vérifiées ;
- migration `20260714090000_cira_discover_hardening.sql` appliquée au projet
  Supabase lié après un dry-run confirmant qu'elle était l'unique migration
  absente ; historique local et distant ensuite aligné ;
- site statique déployé en production et promu sur
  `https://vayra.eybo.tech` ; `/cira/invite` répond en HTTP 200 avec CSP,
  `no-store`, `no-referrer`, anti-framing et anti-indexation actifs ;
- recette de production exécutée avec deux comptes temporaires admis à la
  bêta : profils, handle exact non énumérable, acceptation de relation,
  aperçu minimal, acceptation/refus/révocation d'invitation, rejet du replay
  et frontière de blocage ont réussi ;
- les deux comptes temporaires ont été supprimés et un contrôle administratif
  a confirmé qu'il n'en restait aucun ; les clés administratives temporaires
  ont été effacées après la recette.

La recette physique d'affichage, de caméra et de focus sur des binaires
Android et desktop reste une validation de release manuelle : elle ne peut pas
être remplacée honnêtement par la recette API de production.
