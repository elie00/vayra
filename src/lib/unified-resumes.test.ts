import { expect, it } from "vitest";
import { unifiedResumes } from "./unified-resumes";
import type { LumaResumeEntry } from "./luma/types";
const local: LumaResumeEntry = { id: "a", ref: { kind: "catalog", metaId: "tt1", mediaType: "series" }, presentation: { title: "Dark Matter" }, positionMs: 100, durationMs: 1000, updatedAt: 500 };
it("keeps one newest resume per title across local file and catalog history", () => {
  const entries = [local, { ...local, id: "b", ref: { kind: "local-library" as const, entryId: "file", mediaType: "series" as const }, updatedAt: 600 }];
  expect(unifiedResumes(entries, []).map((r) => r.kind === "local" && r.entry.id)).toEqual(["b"]);
  expect(entries).toHaveLength(2);
});
it("merges connected and local history without confusing films and series", () => {
  const item = { _id: "tt2", name: "Dark Matter", type: "series", removed: false, temp: false, _ctime: "", _mtime: "1970-01-01T00:00:01Z" };
  expect(unifiedResumes([local], [item])).toHaveLength(1);
  expect(unifiedResumes([local], [item])[0].kind).toBe("connected");
  expect(unifiedResumes([local], [{ ...item, type: "movie" }])).toHaveLength(2);
});
