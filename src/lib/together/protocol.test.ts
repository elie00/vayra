import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateRoomCode,
  normalizeRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from "./protocol";

afterEach(() => vi.unstubAllGlobals());

describe("Together room protocol", () => {
  it("normalizes pasted room codes to the wire format", () => {
    expect(normalizeRoomCode(" ab-cd 23!?zz ")).toBe("ABCD23");
    expect(normalizeRoomCode("éà room_42")).toBe("ROOM42");
  });

  it("generates a fixed-length code using only the unambiguous alphabet", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (buffer: Uint32Array) => {
        buffer.set([0, 1, 31, 32, 33, 63]);
        return buffer;
      },
    });

    const code = generateRoomCode();
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
    expect(code).toBe(
      [0, 1, 31, 32, 33, 63]
        .map((value) => ROOM_CODE_ALPHABET[value % ROOM_CODE_ALPHABET.length])
        .join(""),
    );
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
  });
});
