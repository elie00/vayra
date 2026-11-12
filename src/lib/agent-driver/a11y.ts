/**
 * What an agent sees of the screen: the controls and landmarks a person could
 * act on, by role and accessible name, as a screen reader would list them.
 * Nothing here knows about VAYRA's components.
 */

export type AgentNode = {
  /** Position in this tree; `tap #12` targets it until the screen changes. */
  index: number;
  role: string;
  name: string;
  /** Viewport rectangle in CSS pixels. */
  rect: { x: number; y: number; w: number; h: number };
  state?: Partial<Record<"current" | "expanded" | "pressed" | "checked" | "disabled" | "selected", boolean>> & { value?: string };
  /** True when a tap at its centre would land on it now. */
  reachable: boolean;
  /** Below or beside the screen, with nothing known on top: a scroll brings it in. */
  offscreen?: boolean;
};

const SELECTOR = [
  "button", "a[href]", "input", "select", "textarea", "summary",
  "[role]", "[tabindex]:not([tabindex='-1'])", "h1", "h2", "h3", "[aria-current]", "nav", "dialog",
].join(",");

const IMPLICIT_ROLE: Record<string, string> = {
  BUTTON: "button", A: "link", SELECT: "combobox", TEXTAREA: "textbox", SUMMARY: "button",
  H1: "heading", H2: "heading", H3: "heading", NAV: "navigation", DIALOG: "dialog",
};

function roleOf(el: Element): string {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit.split(/\s+/)[0];
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox") return "checkbox";
    if (el.type === "radio") return "radio";
    if (el.type === "range") return "slider";
    if (el.type === "search") return "searchbox";
    return "textbox";
  }
  return IMPLICIT_ROLE[el.tagName] ?? "generic";
}

const ACTIONABLE = new Set([
  "button", "link", "tab", "menuitem", "option", "checkbox", "radio", "switch",
  "textbox", "searchbox", "combobox", "slider", "spinbutton",
]);

/** What `type` aims at when a name is shared with a button. */
export const TEXT_FIELDS: ReadonlySet<string> = new Set(["textbox", "searchbox", "combobox"]);

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** The accessible name, simplified: aria-labelledby, aria-label, a label, then the text. */
export function accessibleName(el: Element): string {
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy.split(/\s+/).map((id) => el.ownerDocument.getElementById(id)?.textContent ?? "").join(" ");
    if (clean(text)) return clean(text);
  }
  const aria = clean(el.getAttribute("aria-label"));
  if (aria) return aria;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    const label = el.labels?.[0]?.textContent;
    if (clean(label)) return clean(label);
    if ("placeholder" in el && clean(el.placeholder)) return clean(el.placeholder);
  }
  const alt = el.querySelector("img[alt]")?.getAttribute("alt");
  return clean(el.textContent) || clean(alt) || clean(el.getAttribute("title"));
}

function hidden(el: Element): boolean {
  if (el.closest("[aria-hidden='true'], [inert], [hidden]")) return true;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  return style?.visibility === "hidden" || style?.display === "none";
}

function stateOf(el: Element): AgentNode["state"] {
  const state: NonNullable<AgentNode["state"]> = {};
  const flag = (attr: string) => {
    const v = el.getAttribute(attr);
    return v === null ? undefined : v !== "false";
  };
  const current = flag("aria-current");
  if (current !== undefined) state.current = current;
  const expanded = flag("aria-expanded");
  if (expanded !== undefined) state.expanded = expanded;
  const pressed = flag("aria-pressed");
  if (pressed !== undefined) state.pressed = pressed;
  const selected = flag("aria-selected");
  if (selected !== undefined) state.selected = selected;
  const checked = el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio") ? el.checked : flag("aria-checked");
  if (checked !== undefined) state.checked = checked;
  if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") state.disabled = true;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) state.value = el.value;
  return Object.keys(state).length > 0 ? state : undefined;
}

function offscreen(el: Element, rect: DOMRect): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  return x < 0 || y < 0 || x > view.innerWidth || y > view.innerHeight;
}

/** True when a tap at the element's centre would land on it: on screen, with nothing on top. */
export function reachable(el: Element, rect: DOMRect = el.getBoundingClientRect()): boolean {
  const doc = el.ownerDocument;
  if (typeof doc.elementFromPoint !== "function") return true;
  const top = doc.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  // Off screen, there is nothing under the point: a person would scroll first.
  return top !== null && (top === el || el.contains(top) || top.contains(el));
}

type Entry = { node: AgentNode; element: Element };

// The one walk behind both the tree and the lookup, so an index means the same
// element in each. A document without layout (jsdom) keeps zero-sized nodes.
function walk(root: ParentNode): Entry[] {
  const doc = root instanceof Document ? root : (root as Node).ownerDocument!;
  const hasLayout = doc.documentElement.getBoundingClientRect().width > 0;
  const out: Entry[] = [];
  const seen = new Set<Element>();
  for (const el of Array.from(root.querySelectorAll(SELECTOR))) {
    if (seen.has(el) || hidden(el)) continue;
    const role = roleOf(el);
    if (role === "presentation" || role === "none" || role === "generic") continue;
    const rect = el.getBoundingClientRect();
    if (hasLayout && (rect.width === 0 || rect.height === 0)) continue;
    const name = accessibleName(el);
    if (!name && role !== "dialog" && role !== "textbox" && role !== "searchbox") continue;
    seen.add(el);
    out.push({
      element: el,
      node: {
        index: out.length,
        role,
        name,
        rect: { x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) },
        state: stateOf(el),
        reachable: hasLayout ? reachable(el, rect) : true,
        ...(hasLayout && offscreen(el, rect) ? { offscreen: true } : {}),
      },
    });
  }
  return out;
}

/** The visible, named controls and landmarks, in document order. */
export function agentTree(root: ParentNode = document): AgentNode[] {
  return walk(root).map((e) => e.node);
}

export type Located = Entry;

/**
 * Finds one control by `#index`, exact name, or a unique part of a name, case
 * and accents aside. Prefers controls a tap would actually reach. Refuses an
 * ambiguous query and lists the candidates, rather than guessing.
 */
export function locate(query: string, root: ParentNode = document, prefer?: ReadonlySet<string>): Located {
  const entries = walk(root);
  const indexed = /^#(\d+)$/.exec(query.trim());
  if (indexed) {
    const entry = entries[Number(indexed[1])];
    if (!entry) throw new Error(`no node ${query}; the tree has ${entries.length}`);
    return entry;
  }
  const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const q = fold(query.trim());
  const exact = entries.filter((e) => fold(e.node.name) === q);
  const partial = exact.length > 0 ? exact : entries.filter((e) => fold(e.node.name).includes(q));
  // Reachable now, else one a scroll would bring in, before one that something covers.
  const reachableOnes = partial.some((e) => e.node.reachable)
    ? partial.filter((e) => e.node.reachable)
    : partial.some((e) => e.node.offscreen)
      ? partial.filter((e) => e.node.offscreen)
      : partial;
  // A control beats a heading or a live announcement that repeats its name.
  const keep = (list: Entry[], roles: ReadonlySet<string>) => (list.some((e) => roles.has(e.node.role)) ? list.filter((e) => roles.has(e.node.role)) : list);
  const candidates = keep(keep(reachableOnes, ACTIONABLE), prefer ?? ACTIONABLE);
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) throw new Error(`nothing named "${query}" on screen`);
  const list = candidates.slice(0, 8).map((e) => `#${e.node.index} ${e.node.role} "${e.node.name}"`).join(", ");
  throw new Error(`"${query}" matches ${candidates.length}: ${list}; use #index or a longer name`);
}
