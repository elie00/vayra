import { describe, expect, it } from "vitest";
import {
  FR_NETWORK_ROWS,
  filterChannelsByRegion,
  resolveNetworks,
  rowsForRegion,
} from "./top-networks";
import type { IptvChannel } from "./types";

function channel(id: string, name: string, group: string | null): IptvChannel {
  return {
    id,
    tvgId: null,
    name,
    logo: null,
    group,
    url: `https://tv.example/${id}.m3u8`,
    catchupSource: null,
    durationSec: null,
    attrs: {},
  };
}

const FR_CHANNELS: IptvChannel[] = [
  channel("1", "FR | TF1 FHD", "FR | TNT"),
  channel("2", "TF1 Séries Films", "FR | TNT"),
  channel("3", "France 2 HD", "FR | TNT"),
  channel("4", "France 24", "FR | INFO"),
  channel("5", "ARTE", "FR | TNT"),
  channel("6", "M6 Music", "FR | MUSIQUE"),
  channel("7", "BFM TV", "FR | INFO"),
];

describe("French IPTV top networks", () => {
  it("returns the French rows for FR and no rows for unmapped regions", () => {
    expect(rowsForRegion("FR")).toBe(FR_NETWORK_ROWS);
    expect(rowsForRegion("fr")).toBe(FR_NETWORK_ROWS);
    expect(rowsForRegion("FRA")).toBe(FR_NETWORK_ROWS);
    expect(rowsForRegion("DE")).toEqual([]);
  });

  it("maps French channels to their network without cross-matching lookalikes", () => {
    const defs = FR_NETWORK_ROWS.flatMap((r) => r.networks);
    const byNetwork = new Map(
      resolveNetworks(FR_CHANNELS, defs).map((r) => [r.def.id, r.channel.id]),
    );
    expect(byNetwork.get("tf1")).toBe("1");
    expect(byNetwork.get("france-2")).toBe("3");
    expect(byNetwork.get("france-24")).toBe("4");
    expect(byNetwork.get("arte")).toBe("5");
    expect(byNetwork.get("bfm-tv")).toBe("7");
    expect(byNetwork.has("m6")).toBe(false);
  });

  it("still matches TF1 when the group name carries a plus or a films token", () => {
    const defs = FR_NETWORK_ROWS.flatMap((r) => r.networks);
    for (const group of ["FR | TNT+", "FRANCE | FILMS & SERIES"]) {
      const resolved = resolveNetworks([channel("1", "TF1 FHD", group)], defs);
      expect(resolved.find((r) => r.def.id === "tf1")?.channel.id).toBe("1");
    }
  });

  it("keeps only French groups when filtering by the FR region", () => {
    const mixed = [
      ...FR_CHANNELS,
      channel("8", "ITV", "UK | ENTERTAINMENT"),
      channel("9", "Das Erste", "GERMANY"),
    ];
    expect(filterChannelsByRegion(mixed, "FR").map((c) => c.id)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
    ]);
  });
});
