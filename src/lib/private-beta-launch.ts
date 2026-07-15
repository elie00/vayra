export const PRIVATE_BETA_LAUNCH_VERSION = 1 as const;

export type PrivateBetaLaunchState = {
  version: typeof PRIVATE_BETA_LAUNCH_VERSION;
  dismissed: boolean;
  roomBriefingSeen: boolean;
  roomOpened: boolean;
  completed: boolean;
};

export type PrivateBetaLaunchProgress = {
  profile: boolean;
  relationship: boolean;
  group: boolean;
  roomBriefing: boolean;
  roomOpened: boolean;
};

export const DEFAULT_PRIVATE_BETA_LAUNCH_STATE: PrivateBetaLaunchState = {
  version: PRIVATE_BETA_LAUNCH_VERSION,
  dismissed: false,
  roomBriefingSeen: false,
  roomOpened: false,
  completed: false,
};

export function parsePrivateBetaLaunchState(raw: string | null): PrivateBetaLaunchState {
  if (!raw) return DEFAULT_PRIVATE_BETA_LAUNCH_STATE;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value.version !== PRIVATE_BETA_LAUNCH_VERSION) {
      return DEFAULT_PRIVATE_BETA_LAUNCH_STATE;
    }
    return {
      version: PRIVATE_BETA_LAUNCH_VERSION,
      dismissed: value.dismissed === true,
      roomBriefingSeen: value.roomBriefingSeen === true,
      roomOpened: value.roomOpened === true,
      completed: value.completed === true,
    };
  } catch {
    return DEFAULT_PRIVATE_BETA_LAUNCH_STATE;
  }
}

export function privateBetaLaunchComplete(progress: PrivateBetaLaunchProgress): boolean {
  return Object.values(progress).every(Boolean);
}

export function privateBetaLaunchStorageKey(userId: string): string {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  return `vayra.private-beta-launch.v1:${safeUserId}`;
}
