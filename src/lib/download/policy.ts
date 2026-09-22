export type DownloadPolicy = { concurrent: number; quotaGiB: number };
export const DEFAULT_DOWNLOAD_POLICY: DownloadPolicy = { concurrent: 3, quotaGiB: 0 };
export function sanitizeDownloadPolicy(value: Partial<DownloadPolicy>): DownloadPolicy {
  return {
    concurrent: Number.isFinite(value.concurrent) ? Math.max(1, Math.min(5, Math.round(value.concurrent!))) : 3,
    quotaGiB: Number.isFinite(value.quotaGiB) ? Math.max(0, Math.min(100000, Math.round(value.quotaGiB!))) : 0,
  };
}
export function remainingBudget(policy: DownloadPolicy, received: number[], reserved: number[]): number | undefined {
  if (!policy.quotaGiB) return undefined;
  return Math.max(0, policy.quotaGiB * 1024 ** 3 - [...received, ...reserved].reduce((sum, n) => sum + Math.max(0, n), 0));
}
