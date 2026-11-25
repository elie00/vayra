import { ciraFr } from "./cira";
import { lumaFr } from "./luma";
import { addonSafety } from "./fr/addon-safety";
import addons from "./fr/addons";
import appearance from "./fr/appearance";
import awards from "./fr/awards";
import { backupSafety } from "./fr/backup-safety";
import coverage from "./fr/coverage";
import discover from "./fr/discover";
import downloads from "./fr/downloads";
import library from "./fr/library";
import lists from "./fr/lists";
import live from "./fr/live";
import misc from "./fr/misc";
import player from "./fr/player";
import settingsNavigation from "./fr/settings-navigation";
import spotlights from "./fr/spotlights";
import sweep from "./fr/sweep";
import sweep2 from "./fr/sweep2";
import sweep3 from "./fr/sweep3";
import sync from "./fr/sync";
import together from "./fr/together";

// Secondary French dictionary hydrated asynchronously after first paint.
const frExtended: Record<string, string> = {
  ...ciraFr,
  ...lumaFr,
  ...coverage,
  ...sweep,
  ...sweep2,
  ...sweep3,
  ...player,
  ...live,
  ...library,
  ...sync,
  ...lists,
  ...downloads,
  ...together,
  ...discover,
  ...spotlights,
  ...misc,
  ...awards,
  ...addons,
  ...appearance,
  ...settingsNavigation,
  ...backupSafety,
  ...addonSafety,
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
  "This link cannot be opened here. Use a direct video URL such as a link ending in .mp4.": "Ce lien ne peut pas être ouvert ici. Utilisez un lien direct vers une vidéo, par exemple un lien se terminant par .mp4.",
  "Geist Serif for titles, Geist for text.": "Geist Serif pour les titres et Geist pour le texte.",
  "Best choice": "Meilleur choix",
  "Open elsewhere": "Ouvrir ailleurs",
  "Others": "Autres",
  "Manage addons": "Gérer les extensions",
  "Languages: {list}": "Langues : {list}",
  "No streams match these filters.": "Aucun flux ne correspond à ces filtres.",
};

export default frExtended;
