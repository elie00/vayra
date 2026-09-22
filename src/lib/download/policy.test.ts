import { expect, it } from "vitest";
import { remainingBudget, sanitizeDownloadPolicy } from "./policy";
it("bounds invalid concurrency and storage preferences", () => {
  expect(sanitizeDownloadPolicy({ concurrent: 999, quotaGiB: -1 })).toEqual({ concurrent: 5, quotaGiB: 0 });
  expect(sanitizeDownloadPolicy({ concurrent: NaN, quotaGiB: Infinity })).toEqual({ concurrent: 3, quotaGiB: 0 });
});
it("reserves in-flight bytes so parallel downloads cannot spend the same budget", () => {
  expect(remainingBudget({ concurrent: 3, quotaGiB: 1 }, [100], [200])).toBe(1024 ** 3 - 300);
  expect(remainingBudget({ concurrent: 1, quotaGiB: 1 }, [2 * 1024 ** 3], [])).toBe(0);
  expect(remainingBudget({ concurrent: 1, quotaGiB: 0 }, [2 * 1024 ** 3], [])).toBeUndefined();
});
