import fs from "node:fs";

import {
  initSync,
  parseStream,
  runPipelineParsed,
} from "../harbor-core/pkg/harbor_core.js";

initSync({
  module: fs.readFileSync(new URL("../harbor-core/pkg/harbor_core_bg.wasm", import.meta.url)),
});

const parsed = parseStream({
  addonId: "wasm-smoke",
  addonName: "WASM smoke test",
  title: "Example.Movie.2024.1080p.WEB-DL.x264-GROUP",
  url: "https://example.invalid/movie.mp4",
});
const result = runPipelineParsed([parsed], { disabled: true }, {});

if (result?.picker?.all?.[0]?.resolution !== "1080p") {
  throw new Error("harbor-core WASM returned an incompatible JavaScript object shape");
}

console.log("harbor-core WASM smoke test passed");
