import fs from "node:fs";

import {
  initSync,
  parseStream,
  runPipelineParsed,
} from "../vayra-core/pkg/vayra_core.js";

initSync({
  module: fs.readFileSync(new URL("../vayra-core/pkg/vayra_core_bg.wasm", import.meta.url)),
});

const parsed = parseStream({
  addonId: "wasm-smoke",
  addonName: "WASM smoke test",
  title: "Example.Movie.2024.1080p.WEB-DL.x264-GROUP",
  url: "https://example.invalid/movie.mp4",
});
const result = runPipelineParsed([parsed], { disabled: true }, {});

if (result?.picker?.all?.[0]?.resolution !== "1080p") {
  throw new Error("vayra-core WASM returned an incompatible JavaScript object shape");
}

console.log("vayra-core WASM smoke test passed");
