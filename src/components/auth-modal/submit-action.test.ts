import { describe, expect, it } from "vitest";
import { authSubmitAction } from "./submit-action";

describe("authSubmitAction", () => {
  it("sends the link before anything has been sent", () => {
    expect(authSubmitAction(false, "")).toBe("send");
  });

  it("verifies a complete code instead of sending a new link", () => {
    // Sending one here would invalidate the code just typed.
    expect(authSubmitAction(true, "123456")).toBe("verify");
  });

  it("resends while the code is still incomplete", () => {
    expect(authSubmitAction(true, "")).toBe("send");
    expect(authSubmitAction(true, "12345")).toBe("send");
  });

  it("ignores whatever is not a digit", () => {
    expect(authSubmitAction(true, "12 34-56")).toBe("verify");
    expect(authSubmitAction(true, "12345a")).toBe("send");
  });

  it("never verifies before a code could exist", () => {
    expect(authSubmitAction(false, "123456")).toBe("send");
  });
})
