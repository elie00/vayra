import catalog from "./fr/catalog";
import chrome from "./fr/chrome";
import common from "./fr/common";
import desktop from "./fr/desktop";
import detail from "./fr/detail";
import { downloadSafety } from "./fr/download-safety";
import macUx from "./fr/mac-ux";
import masthead from "./fr/masthead";
import rails from "./fr/rails";
import { searchRecovery } from "./fr/search-recovery";
import { privateBetaFr } from "./private-beta";

// Core French dictionary needed for instant first paint (chrome, home, search, detail, desktop UX).
// Secondary dictionaries (settings, player, live, CIRA, coverage/sweeps) hydrate right after in fr-extended.
const frCore: Record<string, string> = {
  ...privateBetaFr,
  ...chrome,
  ...common,
  ...catalog,
  ...detail,
  ...rails,
  ...masthead,
  ...desktop,
  ...macUx,
  ...downloadSafety,
  ...searchRecovery,
  "nav.catalogs": "Catalogues",
  "nav.kids": "Enfants",
};

export default frCore;
