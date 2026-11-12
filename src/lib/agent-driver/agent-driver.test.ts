// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { accessibleName, agentTree, locate } from "./a11y";
import { run } from "./ops";

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

  it("types into a field so an input listener sees it", async () => {
    html(`<input aria-label="Rechercher">`);
    const seen: string[] = [];
    document.querySelector("input")!.addEventListener("input", (e) => seen.push((e.target as HTMLInputElement).value));
    await run("type", ["Rechercher", "dune", "part", "two"]);
    expect(seen).toEqual(["dune part two"]);
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
