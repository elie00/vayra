declare module "*harbor-core/pkg/harbor_core.js" {
  import type { Rejection } from "@/lib/streams/trust";
  import type { RankedPicker } from "@/lib/streams/types";

  export default function init(moduleOrPath?: WebAssembly.Module | RequestInfo | URL): Promise<void>;

  export function runPipelineParsed(
    streams: unknown[],
    trustOptions: unknown,
    scoreOptions: unknown,
  ): { picker: RankedPicker; rejected: Rejection[] };
}
