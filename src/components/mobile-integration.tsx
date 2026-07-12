import { useEffect, useRef } from "react";
import { isMobileTauri } from "@/lib/platform";
import { useView } from "@/lib/view";
import { useSearch } from "@/lib/search-context";
import { useTogether } from "@/lib/together/provider";
import { setNavDrawer, useNavDrawer } from "@/lib/nav-drawer";
import { getPlusOpen, setPlusOpen } from "@/mobile/shell";
import { flushCloudSync } from "@/views/player/hooks/use-stremio-sync";

declare global {
  interface Window {
    // The Android host calls this synchronously on the hardware/gesture Back
    // button and expects "handled" (it consumed the event) or "exit" (it should
    // background the app via moveTaskToBack).
    __HARBOR_BACK__?: () => "handled" | "exit";
  }
}

// Mobile-only glue for the native Android shell: a synchronous Back handler and
// a lifecycle/pagehide flush of watch progress. Renders nothing.
export function MobileIntegration() {
  const { player, canGoBack, goBack, topKind, setView } = useView();
  const { open: searchOpen, setOpen: setSearchOpen } = useSearch();
  const { modalOpen: togetherOpen, closeModal: closeTogether } = useTogether();
  const drawerOpen = useNavDrawer();

  // Mirror the latest state/actions into refs so the global handler can read
  // them synchronously without re-registering on every change.
  const stateRef = useRef({
    player: false,
    canGoBack: false,
    searchOpen: false,
    drawerOpen: false,
    togetherOpen: false,
    topKind: "home" as string,
  });
  stateRef.current = { player: !!player, canGoBack, searchOpen, drawerOpen, togetherOpen, topKind };
  const actionsRef = useRef({ goBack, setSearchOpen, setView, closeTogether });
  actionsRef.current = { goBack, setSearchOpen, setView, closeTogether };

  useEffect(() => {
    if (!isMobileTauri()) return;
    window.__HARBOR_BACK__ = () => {
      const s = stateRef.current;
      const a = actionsRef.current;
      // Priority: close the drawer, then any open overlay, then walk back in
      // VAYRA's own view history (which also closes the player). Top-level
      // views reached via the drawer have no history, so — per Android/Material
      // convention — Back goes to Home first; only Home itself exits the app.
      if (s.togetherOpen) {
        a.closeTogether();
        return "handled";
      }
      if (getPlusOpen()) {
        setPlusOpen(false);
        return "handled";
      }
      if (s.drawerOpen) {
        setNavDrawer(false);
        return "handled";
      }
      if (s.searchOpen) {
        a.setSearchOpen(false);
        return "handled";
      }
      if (s.player || s.canGoBack) {
        a.goBack();
        return "handled";
      }
      if (s.topKind !== "home") {
        a.setView("home");
        return "handled";
      }
      return "exit";
    };
    return () => {
      if (window.__HARBOR_BACK__) delete window.__HARBOR_BACK__;
    };
  }, []);

  useEffect(() => {
    if (!isMobileTauri()) return;
    // Same persistence the desktop runs on "vayra://app-closing": the exo
    // bridge re-emits the native background lifecycle as vayra:flush-persist,
    // and pagehide is a backup for the WebView being torn down.
    const flush = () => void flushCloudSync();
    window.addEventListener("vayra:flush-persist", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("vayra:flush-persist", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  return null;
}
