// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { accessibleName, agentTree, locate } from "./a11y";
import { run, trackTimers } from "./ops";

afterEach(() => {
  document.body.innerHTML = "";
});

function html(markup: string) {
  document.body.innerHTML = markup;
}

describe("agentTree", () => {
  it("lists named controls by role, with their state", () => {
    html(`
      <nav aria-label="Primary">
        <button aria-current="page"><svg></svg><span>Accueil</span></button>
        <button aria-expanded="false">Menu</button>
      </nav>
      <input type="search" placeholder="Titres, personnes" value="dune">
      <div role="dialog" aria-label="Dune"><a href="/x">Détails</a></div>
      <div>plain text is not a control</div>`);
    const tree = agentTree();
    expect(tree.map((n) => [n.role, n.name])).toEqual([
      ["navigation", "Primary"],
      ["button", "Accueil"],
      ["button", "Menu"],
      ["searchbox", "Titres, personnes"],
      ["dialog", "Dune"],
      ["link", "Détails"],
    ]);
    expect(tree[1].state).toEqual({ current: true });
    expect(tree[2].state).toEqual({ expanded: false });
    expect(tree[3].state).toEqual({ value: "dune" });
  });

  it("leaves out what is hidden from people", () => {
    html(`<button aria-hidden="true">Ghost</button><div inert><button>Behind</button></div><button hidden>Off</button><button>Seen</button>`);
    expect(agentTree().map((n) => n.name)).toEqual(["Seen"]);
  });

  it("names a control by aria-label first, then its label, then its text", () => {
    html(`<button aria-label="Fermer">×</button><label for="q">Recherche</label><input id="q">`);
    expect(accessibleName(document.querySelector("button")!)).toBe("Fermer");
    expect(accessibleName(document.querySelector("input")!)).toBe("Recherche");
  });
});

describe("locate", () => {
  it("finds a control by exact name, case and accents aside", () => {
    html(`<button>Paramètres</button><button>Paramètres avancés</button>`);
    expect(locate("parametres").node.name).toBe("Paramètres");
  });

  it("finds a unique part of a name", () => {
    html(`<button>Envoyer le rapport de bug</button>`);
    expect(locate("rapport").node.name).toBe("Envoyer le rapport de bug");
  });

  it("refuses an ambiguous name and lists the candidates", () => {
    html(`<button>Dune</button><button>Dune: Part Two</button><button>Dune World</button>`);
    expect(() => locate("dune:")).not.toThrow();
    html(`<button>Dune World</button><button>Dune Warriors</button>`);
    expect(() => locate("dune w")).toThrow(/matches 2: #0 button "Dune World", #1 button "Dune Warriors"/);
  });

  it("prefers a control to a heading or an announcement with the same name", () => {
    html(`<p role="status">Accueil</p><h2>Accueil</h2><button>Accueil</button>`);
    expect(locate("Accueil").node.role).toBe("button");
  });

  it("says when nothing matches", () => {
    html(`<button>Menu</button>`);
    expect(() => locate("Réglages")).toThrow('nothing named "Réglages" on screen');
  });

  it("finds a node by its index in the tree", () => {
    html(`<button>A</button><button>B</button>`);
    expect(locate("#1").node.name).toBe("B");
    expect(() => locate("#5")).toThrow("no node #5; the tree has 2");
  });
});

describe("run", () => {
  it("taps a control by name", async () => {
    html(`<button>Menu</button>`);
    const onClick = vi.fn();
    document.querySelector("button")!.addEventListener("click", onClick);
    await run("tap", ["Menu"]);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("refuses to tap a disabled control, which would do nothing", async () => {
    html(`<button disabled>Envoyer le rapport de bug</button>`);
    await expect(run("tap", ["Envoyer"])).rejects.toThrow('#0 "Envoyer le rapport de bug" is disabled');
  });

  it("types into a field so an input listener sees it", async () => {
    html(`<input aria-label="Rechercher">`);
    const seen: string[] = [];
    document.querySelector("input")!.addEventListener("input", (e) => seen.push((e.target as HTMLInputElement).value));
    await run("type", ["Rechercher", "dune", "part", "two"]);
    expect(seen).toEqual(["dune part two"]);
  });

  it("types into the field when a button shares its name", async () => {
    html(`<button>Rechercher</button><input type="search" aria-label="Rechercher">`);
    await run("type", ["Rechercher", "dune"]);
    expect(document.querySelector("input")!.value).toBe("dune");
  });

  it("waits for a control to leave the screen", async () => {
    html(`<button>Fermer</button>`);
    setTimeout(() => (document.body.innerHTML = ""), 150);
    await expect(run("gone", ["Fermer", "2000"])).resolves.toEqual({ gone: "Fermer" });
  });

  it("says when a control stays on screen", async () => {
    html(`<button>Fermer</button>`);
    await expect(run("gone", ["Fermer", "200"])).rejects.toThrow('"Fermer" is still on screen after 200 ms');
  });

  it("types into the field even when a panel has the exact name and the field a longer one", async () => {
    html(`<div role="dialog" aria-label="Rechercher"><input placeholder="Rechercher films, séries"></div>`);
    await run("type", ["Rechercher", "dune"]);
    expect(document.querySelector("input")!.value).toBe("dune");
  });

  it("reads the field's value when a button shares its name", async () => {
    html(`<button>Rechercher</button><input type="search" aria-label="Rechercher" value="dune">`);
    await expect(run("value", ["Rechercher"])).resolves.toMatchObject({ role: "searchbox", state: { value: "dune" } });
  });

  it("waits for a short timer the app set, like a sheet closing after its animation", async () => {
    trackTimers();
    html(`<div role="dialog" aria-label="Assistant"><button>Passer</button></div>`);
    setTimeout(() => (document.body.innerHTML = ""), 400);
    const result = (await run("settle", [])) as { settled: boolean; ms: number };
    expect(result.settled).toBe(true);
    expect(document.querySelector("[role='dialog']")).toBeNull();
  });

  it("settles once nothing changes", async () => {
    html(`<button>A</button>`);
    const result = (await run("settle", [])) as { settled: boolean };
    expect(result.settled).toBe(true);
  });

  it("refuses an unknown operation and lists the known ones", async () => {
    await expect(run("swipe", [])).rejects.toThrow(/unknown operation "swipe"; use tree, tap/);
  });
});

describe("locate with layout", () => {
  it("prefers a control a scroll would reach to one something covers", () => {
    html(`<button id="behind">Paramètres</button><button id="below">Paramètres</button><div id="sheet"></div>`);
    const at = (el: Element, top: number) => {
      el.getBoundingClientRect = () => ({ left: 10, top, width: 100, height: 40, right: 110, bottom: top + 40, x: 10, y: top, toJSON: () => ({}) }) as DOMRect;
    };
    at(document.documentElement, 0);
    document.documentElement.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 800, right: 400, bottom: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    at(document.getElementById("behind")!, 300);
    at(document.getElementById("below")!, 2000);
    const sheet = document.getElementById("sheet")!;
    // Whatever is on screen at the point is the sheet, covering the first button.
    document.elementFromPoint = () => sheet;
    vi.stubGlobal("innerWidth", 400);
    vi.stubGlobal("innerHeight", 800);
    const found = locate("Paramètres");
    expect(found.element.id).toBe("below");
    expect(found.node.offscreen).toBe(true);
    // The document element outlives the test: give it back its own layout.
    Reflect.deleteProperty(document.documentElement, "getBoundingClientRect");
    Reflect.deleteProperty(document, "elementFromPoint");
    vi.unstubAllGlobals();
  });
});
