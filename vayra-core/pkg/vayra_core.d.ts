/* tslint:disable */
/* eslint-disable */

export function _start(): void;

/**
 * Filter a slice of `ParsedStream`s through the trust gate.
 * Returns `{ keep: ParsedStream[], rejected: { stream, reason }[] }`.
 */
export function applyTrust(streams: any, opts: any): any;

/**
 * Compute corpus-wide stats (median size, p90 size, etc.) needed to score individual streams.
 */
export function computeCorpusStats(streams: any, opts: any): any;

/**
 * Parse a single raw addon `Stream` into a fully-resolved `ParsedStream`.
 * JS shape on input: { addonId, addonName, name?, title?, description?, url?, infoHash?, fileIdx?, behaviorHints?, ... }
 * JS shape on output: ParsedStream (extends Stream + parsing fields).
 */
export function parseStream(stream: any): any;

/**
 * Parse many streams in one call. Cheaper than N individual calls (one FFI hop instead of N).
 */
export function parseStreams(streams: any): any;

/**
 * Run trust, scoring and ranking for streams already parsed/enriched by the UI.
 *
 * The frontend uses this entry point after anime metadata and debrid cache flags
 * have been applied. Re-parsing those values as raw streams would discard that
 * enrichment, so the native Tauri command and the browser WASM path deliberately
 * share this parsed-stream boundary.
 */
export function runPipelineParsed(streams: any, trust_opts: any, score_opts: any): any;

/**
 * One-shot pipeline: parse + trust + score + rank + pick. The expected workflow for most callers.
 * `streams` is a `Stream[]` (raw, unparsed), `trust` and `score` are options objects.
 * Returns `{ picker: RankedPicker, rejected: Rejection[] }`.
 */
export function runPipelinePure(streams: any, trust_opts: any, score_opts: any): any;

/**
 * Score one parsed stream given options + corpus stats. Returns `ScoredStream`.
 */
export function scoreStream(parsed: any, opts: any, corpus: any): any;

export function vayra_core_version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly _start: () => void;
    readonly applyTrust: (a: number, b: number, c: number) => void;
    readonly computeCorpusStats: (a: number, b: number, c: number) => void;
    readonly parseStream: (a: number, b: number) => void;
    readonly parseStreams: (a: number, b: number) => void;
    readonly runPipelineParsed: (a: number, b: number, c: number, d: number) => void;
    readonly runPipelinePure: (a: number, b: number, c: number, d: number) => void;
    readonly scoreStream: (a: number, b: number, c: number, d: number) => void;
    readonly vayra_core_version: (a: number) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
