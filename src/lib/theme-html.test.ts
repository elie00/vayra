// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { bindThemeNavigation, sanitizeThemeHtml } from "./theme-html";

it("removes active imported content while preserving safe custom navigation", () => {
  const html = sanitizeThemeHtml(`<script>danger()</script><iframe srcdoc="bad"></iframe><img src="x" onerror="danger()"><button onclick="window.vayra.navigate('movies')">Movies</button><button onclick="window.vayra.navigate('home'); danger()">Bad</button>`);
  const container = document.createElement("div"); container.innerHTML = html;
  expect(container.querySelector("script,iframe,[onerror],[onclick]")).toBeNull();
  expect(container.querySelector("button")?.getAttribute("data-vayra-nav")).toBe("movies");
  expect(container.querySelectorAll("button")[1].hasAttribute("data-vayra-nav")).toBe(false);
  const navigate = vi.fn();
  Object.assign(window, { vayra: { navigate } });
  const unbind = bindThemeNavigation(container);
  container.querySelector("button")!.click();
  expect(navigate).toHaveBeenCalledExactlyOnceWith("movies");
  container.querySelectorAll("button")[1].click();
  expect(navigate).toHaveBeenCalledTimes(1);
  unbind(); container.querySelector("button")!.click();
  expect(navigate).toHaveBeenCalledTimes(1);
  delete (window as unknown as { vayra?: unknown }).vayra;
});

it("does not dispatch an invalid route or duplicate a locally authored inline handler", () => {
  const container = document.createElement("div");
  container.innerHTML = `<button data-vayra-nav="invalid">Bad</button><button data-vayra-nav="home" onclick="void 0">Local</button>`;
  const navigate = vi.fn(); Object.assign(window, { vayra: { navigate } });
  const unbind = bindThemeNavigation(container);
  for (const button of container.querySelectorAll("button")) button.click();
  expect(navigate).not.toHaveBeenCalled();
  unbind(); delete (window as unknown as { vayra?: unknown }).vayra;
});
