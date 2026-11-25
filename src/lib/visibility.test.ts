// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { observe } from "./visibility";

describe("visibility observe()", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("supports multiple subscribers on the same element without clobbering", () => {
    let fire!: (entries: Array<{ target: Element; isIntersecting: boolean }>) => void;
    const unobserve = vi.fn();
    const observeSpy = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: (entries: Array<{ target: Element; isIntersecting: boolean }>) => void) {
          fire = cb;
        }
        observe(el: Element) {
          observeSpy(el);
        }
        unobserve(el: Element) {
          unobserve(el);
        }
        disconnect() {}
      },
    );

    const el = document.createElement("div");
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const off1 = observe(el, cb1);
    const off2 = observe(el, cb2);
    expect(observeSpy).toHaveBeenCalledTimes(1);

    fire([{ target: el, isIntersecting: true }]);
    expect(cb1).toHaveBeenCalledWith(true);
    expect(cb2).toHaveBeenCalledWith(true);

    off1();
    expect(unobserve).not.toHaveBeenCalled();

    fire([{ target: el, isIntersecting: false }]);
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenLastCalledWith(false);

    off2();
    expect(unobserve).toHaveBeenCalledWith(el);
  });
});
