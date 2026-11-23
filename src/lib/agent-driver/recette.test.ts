import { describe, expect, it } from "vitest";
// @ts-expect-error The scenario helpers are a Node-only ES module.
import { expectationPlan, includesName, parseScenario } from "../../../scripts/lib/recette.mjs";

const SCENARIO = `# Navigation par les onglets
@cible android desktop

launch
# a note, not the title
tap "Ma liste"
expect current "Ma liste"
@android swipe "Détails et plus" down 400
expect noerrors
`;

describe("scenario files", () => {
  it("reads the title, the targets and one step per line", () => {
    const s = parseScenario(SCENARIO, "nav.recette");
    expect(s.title).toBe("Navigation par les onglets");
    expect(s.targets).toEqual(["android", "desktop"]);
    expect(s.steps.map((x: { where: string; op: string; only: string | null }) => [x.where, x.op, x.only])).toEqual([
      ["host", "launch", null],
      ["app", "tap", null],
      ["expect", "current", null],
      ["host", "swipe", "android"],
      ["expect", "noerrors", null],
    ]);
    expect(s.steps[1].at).toBe("nav.recette:6");
  });

  it("refuses what it cannot run, with the line", () => {
    expect(() => parseScenario("@cible android\nclick Menu", "a.recette")).toThrow('a.recette:2: unknown operation "click"');
    expect(() => parseScenario("@cible android\nexpect shown Menu", "a.recette")).toThrow(/unknown expectation "shown"/);
    expect(() => parseScenario("@cible android\nexpect value Rechercher", "a.recette")).toThrow(/usage: expect value <field> <text>/);
    expect(() => parseScenario("@cible windows\nlaunch", "a.recette")).toThrow(/@cible takes android and\/or desktop/);
    expect(() => parseScenario("launch", "a.recette")).toThrow(/missing "@cible/);
  });
});

describe("expectations", () => {
  it("matches names case and accents aside", () => {
    expect(includesName(["Paramètres"], "parametres")).toBe(true);
    expect(includesName(["Menu"], "Ma liste")).toBe(false);
  });

  it("judges the state the app reports", () => {
    const current = expectationPlan("current", ["Ma liste"]);
    expect(current.op).toBe("state");
    expect(current.check({ current: ["Ma liste"], dialogs: [] })).toBeNull();
    expect(current.check({ current: ["Accueil"], dialogs: [] })).toBe('current is [Accueil], not "Ma liste"');
    expect(expectationPlan("nodialog", []).check({ current: [], dialogs: ["Menu"] })).toBe("dialogs still open: [Menu]");
  });

  it("checks that a dialog closed and that a control is disabled", () => {
    const closed = expectationPlan("closed", ["Dune"]);
    expect(closed.check({ current: [], dialogs: ["Rechercher"] })).toBeNull();
    expect(closed.check({ current: [], dialogs: ["Dune"] })).toBe('"Dune" is still open');
    const disabled = expectationPlan("disabled", ["Envoyer"]);
    expect(disabled.check({ name: "Envoyer", state: { disabled: true } })).toBeNull();
    expect(disabled.check({ name: "Envoyer" })).toBe('"Envoyer" is enabled');
  });

  it("checks that a toggle or a choice is on or off", () => {
    const on = expectationPlan("on", ["Instantané"]);
    expect(on.op).toBe("wait");
    expect(on.check({ name: "Instantané", state: { pressed: true } })).toBeNull();
    expect(on.check({ name: "Instantané", state: { checked: true } })).toBeNull();
    expect(on.check({ name: "Instantané", state: { selected: true } })).toBeNull();
    expect(on.check({ name: "Instantané", state: { pressed: false } })).toBe('"Instantané" is off');
    expect(on.check({ name: "Instantané" })).toBe('"Instantané" exposes no on/off state');
    const off = expectationPlan("off", ["Haut"]);
    expect(off.check({ name: "Haut", state: { checked: false } })).toBeNull();
    expect(off.check({ name: "Haut", state: { pressed: true } })).toBe('"Haut" is on');
    expect(off.check({ name: "Haut" })).toBe('"Haut" exposes no on/off state');
    expect(on.check({ name: "Instantané", state: { selected: false, pressed: true } })).toBeNull();
    expect(() => parseScenario("@cible desktop\nexpect on", "s")).toThrow("usage: expect on <name>");
  });

  it("checks a field's value and the app's errors", () => {
    const value = expectationPlan("value", ["Rechercher", "dune", "part"]);
    expect(value.op).toBe("value");
    expect(value.args).toEqual(["Rechercher"]);
    expect(value.check({ state: { value: "dune part" } })).toBeNull();
    expect(value.check({ state: { value: "" } })).toBe('"Rechercher" holds "", not "dune part"');
    expect(expectationPlan("noerrors", []).check([{ level: "warn", text: "w" }])).toBeNull();
    expect(expectationPlan("noerrors", []).check([{ level: "error", text: "boom" }])).toBe("1 error(s), last: boom");
  });
});
