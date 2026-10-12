import DOMPurify from "dompurify";

const VIEWS = new Set(["home", "settings", "anime", "discover", "catalogs", "addons", "calendar", "movies", "shows", "kids", "library", "live", "vod", "downloads", "wrapped", "sports", "stats"]);

/** Preserve only the documented navigation command, never arbitrary inline JS. */
export function sanitizeThemeHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const button of template.content.querySelectorAll("button[onclick]")) {
    const match = button.getAttribute("onclick")?.match(/^\s*window\.(?:vayra|harbor)\.navigate\(\s*(['"])([a-z]+)\1\s*\)\s*;?\s*$/);
    if (match && VIEWS.has(match[2])) button.setAttribute("data-vayra-nav", match[2]);
  }
  return DOMPurify.sanitize(template.innerHTML, {
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "base"],
    FORBID_ATTR: ["srcdoc"],
  });
}

export function bindThemeNavigation(container: HTMLElement): () => void {
  const onClick = (event: MouseEvent) => {
    const button = event.target instanceof Element ? event.target.closest("button[data-vayra-nav]") : null;
    const view = button?.getAttribute("data-vayra-nav");
    if (!button || button.hasAttribute("onclick") || !container.contains(button) || !view || !VIEWS.has(view)) return;
    const api = (window as unknown as { vayra?: { navigate?: (view: string) => void } }).vayra;
    api?.navigate?.(view);
  };
  container.addEventListener("click", onClick);
  return () => container.removeEventListener("click", onClick);
}
