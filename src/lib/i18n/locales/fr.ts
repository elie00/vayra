import addons from "./fr/addons";
import awards from "./fr/awards";
import catalog from "./fr/catalog";
import chrome from "./fr/chrome";
import common from "./fr/common";
import detail from "./fr/detail";
import discover from "./fr/discover";
import downloads from "./fr/downloads";
import library from "./fr/library";
import lists from "./fr/lists";
import live from "./fr/live";
import masthead from "./fr/masthead";
import misc from "./fr/misc";
import player from "./fr/player";
import rails from "./fr/rails";
import spotlights from "./fr/spotlights";
import sync from "./fr/sync";
import together from "./fr/together";
import { ciraFr } from "./cira";
import coverage from "./fr/coverage";
import sweep from "./fr/sweep";
import sweep2 from "./fr/sweep2";

const fr: Record<string, string> = {
  ...ciraFr,
  ...coverage,
  ...sweep,
  ...sweep2,
  ...chrome,
  ...common,
  ...catalog,
  ...detail,
  ...player,
  ...live,
  ...library,
  ...sync,
  ...lists,
  ...downloads,
  ...together,
  ...rails,
  ...masthead,
  ...discover,
  ...spotlights,
  ...misc,
  ...awards,
  ...addons,
  "nav.catalogs": "Catalogues",
  "nav.kids": "Enfants",
  "AniList Comments": "Commentaires AniList",
  "Connect your AniList account to see forum threads and comments.": "Connectez votre compte AniList pour voir les discussions et commentaires.",
  "Could not find this title on AniList.": "Ce titre est introuvable sur AniList.",
  "New thread": "Nouvelle discussion",
  "Back to threads": "Retour aux discussions",
  "Thread title": "Titre de la discussion",
  "Thread body (optional)": "Contenu de la discussion (facultatif)",
  "Create thread": "Créer la discussion",
  "Failed to create thread": "Impossible de créer la discussion",
  "Open on AniList": "Ouvrir sur AniList",
  "This thread is locked.": "Cette discussion est verrouillée.",
  "No threads for this title yet.": "Aucune discussion pour ce titre.",
  "Be the first to start a discussion.": "Soyez la première personne à lancer une discussion.",
  "Load more threads": "Charger plus de discussions",
  "No comments yet": "Aucun commentaire",
  "Loading more": "Chargement",
  "Failed to post comment": "Impossible de publier le commentaire",
  "Show AniList comments": "Afficher les commentaires AniList",
  "Show forum threads and comments from AniList on anime detail pages.": "Afficher les discussions et commentaires AniList sur les pages des anime.",
  "Comments on anime pages are blurred until you reveal them, even if they are not tagged as spoilers.": "Les commentaires des pages anime restent floutés jusqu’à leur révélation, même sans balise spoiler.",
};

export default fr;
