import { expect, it, vi } from "vitest";

vi.mock("@/lib/addon-store", () => ({ installFromUrl: vi.fn(), loadInstalled: () => [] }));
vi.mock("@/lib/connect/link", () => ({ useLinkStatus: vi.fn() }));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));

const { missingAddons } = await import("./mac-addons-import");

it("offers only the Mac's addons this phone lacks, by install address", () => {
  const mac = [
    { name: "Torrentio", transportUrl: "https://torrentio.example/manifest.json" },
    { name: "Cinemeta", transportUrl: "https://v3-cinemeta.example/manifest.json" },
  ];
  expect(missingAddons(mac, new Set(["https://v3-cinemeta.example/manifest.json"]))).toEqual([mac[0]]);
});
