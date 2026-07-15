import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useCira } from "@/lib/cira/provider";
import { useOnboarding } from "@/lib/onboarding";
import { useVara } from "@/lib/vara/provider";
import { useVayraAccount } from "@/lib/vayra-account";
import {
  DEFAULT_PRIVATE_BETA_LAUNCH_STATE,
  parsePrivateBetaLaunchState,
  privateBetaLaunchComplete,
  privateBetaLaunchStorageKey,
  type PrivateBetaLaunchProgress,
  type PrivateBetaLaunchState,
} from "./private-beta-launch";

type PrivateBetaLaunchValue = {
  eligible: boolean;
  open: boolean;
  state: PrivateBetaLaunchState;
  progress: PrivateBetaLaunchProgress;
  completedCount: number;
  openGuide: () => void;
  dismissGuide: () => void;
  markRoomBriefingSeen: () => void;
  resetGuide: () => void;
};

const PrivateBetaLaunchContext = createContext<PrivateBetaLaunchValue | null>(null);

function readState(userId: string | null): PrivateBetaLaunchState {
  if (!userId || typeof window === "undefined") return DEFAULT_PRIVATE_BETA_LAUNCH_STATE;
  try {
    return parsePrivateBetaLaunchState(localStorage.getItem(privateBetaLaunchStorageKey(userId)));
  } catch {
    return DEFAULT_PRIVATE_BETA_LAUNCH_STATE;
  }
}

export function PrivateBetaLaunchProvider({ children }: { children: ReactNode }) {
  const { onboarded } = useOnboarding();
  const { user } = useVayraAccount();
  const { status, me, relationships, groups } = useCira();
  const { activeRoom } = useVara();
  const userId = user?.id ?? null;
  const eligible = status === "ready" && user?.app_metadata?.cira_beta === true;
  const [state, setState] = useState<PrivateBetaLaunchState>(() => readState(userId));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setState(readState(userId));
    setOpen(false);
  }, [userId]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    try {
      localStorage.setItem(privateBetaLaunchStorageKey(userId), JSON.stringify(state));
    } catch {
      // A blocked local store must never prevent access to the beta.
    }
  }, [state, userId]);

  const progress = useMemo<PrivateBetaLaunchProgress>(() => ({
    profile: me !== null,
    relationship: relationships.some((relationship) => relationship.status === "accepted"),
    group: groups.some((group) => group.archivedAt === null),
    roomBriefing: state.roomBriefingSeen,
    roomOpened: state.roomOpened || activeRoom !== null,
  }), [activeRoom, groups, me, relationships, state.roomBriefingSeen, state.roomOpened]);

  const isComplete = privateBetaLaunchComplete(progress);

  useEffect(() => {
    if (activeRoom && !state.roomOpened) {
      setState((current) => ({ ...current, roomOpened: true }));
    }
  }, [activeRoom, state.roomOpened]);

  useEffect(() => {
    if (isComplete && !state.completed) {
      setState((current) => ({ ...current, completed: true, dismissed: false }));
      setOpen(false);
    }
  }, [isComplete, state.completed]);

  useEffect(() => {
    if (eligible && onboarded && !state.dismissed && !state.completed) setOpen(true);
  }, [eligible, onboarded, state.completed, state.dismissed]);

  const openGuide = useCallback(() => {
    setState((current) => ({ ...current, dismissed: false }));
    setOpen(true);
  }, []);
  const dismissGuide = useCallback(() => {
    setState((current) => ({ ...current, dismissed: true }));
    setOpen(false);
  }, []);
  const markRoomBriefingSeen = useCallback(() => {
    setState((current) => ({ ...current, roomBriefingSeen: true }));
  }, []);
  const resetGuide = useCallback(() => {
    setState(DEFAULT_PRIVATE_BETA_LAUNCH_STATE);
    setOpen(true);
  }, []);

  const value = useMemo<PrivateBetaLaunchValue>(() => ({
    eligible,
    open,
    state,
    progress,
    completedCount: Object.values(progress).filter(Boolean).length,
    openGuide,
    dismissGuide,
    markRoomBriefingSeen,
    resetGuide,
  }), [dismissGuide, eligible, markRoomBriefingSeen, open, openGuide, progress, resetGuide, state]);

  return (
    <PrivateBetaLaunchContext.Provider value={value}>
      {children}
    </PrivateBetaLaunchContext.Provider>
  );
}

export function usePrivateBetaLaunch(): PrivateBetaLaunchValue {
  const value = useContext(PrivateBetaLaunchContext);
  if (!value) throw new Error("usePrivateBetaLaunch outside PrivateBetaLaunchProvider");
  return value;
}
