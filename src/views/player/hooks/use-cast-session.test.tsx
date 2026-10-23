// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { CastDeviceInfo, CastSubStyle } from "@/lib/cast";

const cast = vi.hoisted(() => ({
  castLoad: vi.fn(),
  castStop: vi.fn(async () => {}),
  castStatus: vi.fn(async () => null),
  castPause: vi.fn(async () => {}),
  castPlay: vi.fn(async () => {}),
  castSeek: vi.fn(async () => {}),
}));
vi.mock("@/lib/cast", () => cast);

import { useCastSession } from "./use-cast-session";

type Session = ReturnType<typeof useCastSession>;

const tv = { id: "tv", name: "Samsung QN97AA 65 TV", kind: "dlna", host: "192.168.1.131", port: 0, control_url: "http://tv/ctl" } as unknown as CastDeviceInfo;
const style = (font_size: number): CastSubStyle => ({
  font_size,
  font_color: "#FFFFFF",
  border_color: "#000000",
  border_size: 3,
  margin_y: 8,
  align_x: "center",
});

function mount() {
  const ref: { current: Session | null } = { current: null };
  function Probe() {
    ref.current = useCastSession();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
  return { ref, unmount: () => act(() => root.unmount()) };
}

async function castWithSubs(session: Session) {
  await session.pickCastDevice(tv, {
    url: "http://127.0.0.1/stream/0",
    title: "Film",
    startTimeSec: 1856,
    subtitle: { kind: "embedded", src_index: 0, off: false },
    subStyle: style(45),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

it("reloads the cast from the TV position with the new subtitle style, once", async () => {
  cast.castLoad.mockResolvedValue({ ok: true, error: null });
  const { ref, unmount } = mount();
  await act(() => castWithSubs(ref.current!));
  expect(ref.current!.castSubStyleKey).toBe(JSON.stringify(style(45)));

  await act(() => ref.current!.restyleCast(style(32)));
  await act(() => ref.current!.restyleCast(style(32)));

  expect(cast.castLoad).toHaveBeenCalledTimes(2);
  expect(cast.castLoad).toHaveBeenLastCalledWith(
    expect.objectContaining({ host: "192.168.1.131", subStyle: style(32), startTimeSec: 1856 }),
  );
  expect(ref.current!.castSubStyleKey).toBe(JSON.stringify(style(32)));
  unmount();
});

it("does not reload a cast that burns no subtitles", async () => {
  cast.castLoad.mockResolvedValue({ ok: true, error: null });
  const { ref, unmount } = mount();
  await act(() => ref.current!.pickCastDevice(tv, { url: "http://127.0.0.1/stream/0", title: "Film" }));

  await act(() => ref.current!.restyleCast(style(32)));

  expect(cast.castLoad).toHaveBeenCalledTimes(1);
  expect(ref.current!.castSubStyleKey).toBeNull();
  unmount();
});

it("stops the reloaded stream when the cast was stopped meanwhile", async () => {
  cast.castLoad.mockResolvedValueOnce({ ok: true, error: null });
  const { ref, unmount } = mount();
  await act(() => castWithSubs(ref.current!));
  let finishReload: (r: { ok: boolean; error: string | null }) => void = () => {};
  cast.castLoad.mockReturnValueOnce(new Promise((resolve) => (finishReload = resolve)));

  let reload: Promise<void> = Promise.resolve();
  act(() => {
    reload = ref.current!.restyleCast(style(32));
  });
  await act(() => ref.current!.stopCast());
  await act(async () => {
    finishReload({ ok: true, error: null });
    await reload;
  });

  expect(cast.castStop).toHaveBeenCalledTimes(2);
  unmount();
});
