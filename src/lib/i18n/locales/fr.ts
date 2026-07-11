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

const fr: Record<string, string> = {
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
};

export default fr;
