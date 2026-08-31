import type { PlatformCapabilities } from "@/lib/platform-capabilities";
import type { Tab } from "./shared";

/** Tabs that lean on something the runtime may not have. Scanning folders for
 *  the Local tab goes through the backend, which a browser has no equivalent
 *  for, so the tab could only ever fail there. */
const TAB_REQUIRES: Partial<Record<Tab, keyof PlatformCapabilities>> = {
  local: "localFiles",
};

export function tabAvailable(tab: Tab, capabilities: PlatformCapabilities): boolean {
  const need = TAB_REQUIRES[tab];
  return !need || capabilities[need];
}
