import { describe, expect, it } from "vitest";
import { parseM3u } from "./m3u";

const P = "src1";

describe("parseM3u", () => {
  it("reads a plain entry", () => {
    const m3u = `#EXTM3U
#EXTINF:-1 tvg-id="tf1.fr" tvg-logo="http://logo/tf1.png" group-title="Généralistes",TF1
http://host/tf1.m3u8`;
    const [ch] = parseM3u(m3u, P);
    expect(ch).toMatchObject({
      tvgId: "tf1.fr",
      name: "TF1",
      logo: "http://logo/tf1.png",
      group: "Généralistes",
      url: "http://host/tf1.m3u8",
    });
  });

  it("keeps a title that contains commas", () => {
    const m3u = `#EXTINF:-1 tvg-id="x",France 3, Régions
http://host/a`;
    expect(parseM3u(m3u, P)[0].name).toBe("France 3, Régions");
  });

  it("keeps an attribute value that contains spaces", () => {
    const m3u = `#EXTINF:-1 tvg-name="France 2 HD" group-title="Chaînes nationales",F2
http://host/b`;
    const [ch] = parseM3u(m3u, P);
    expect(ch.name).toBe("France 2 HD");
    expect(ch.group).toBe("Chaînes nationales");
  });

  it("applies #EXTGRP to the entries that follow it", () => {
    const m3u = `#EXTGRP:Sport
#EXTINF:-1,Canal A
http://host/a
#EXTINF:-1,Canal B
http://host/b`;
    expect(parseM3u(m3u, P).map((c) => c.group)).toEqual(["Sport", "Sport"]);
  });

  it("drops separator rows that are not channels", () => {
    const m3u = `#EXTINF:-1,══════════
http://host/sep
#EXTINF:-1,TF1
http://host/tf1`;
    expect(parseM3u(m3u, P).map((c) => c.name)).toEqual(["TF1"]);
  });

  it("gives every channel a distinct id, duplicates included", () => {
    const m3u = `#EXTINF:-1 tvg-id="same",A
http://host/a
#EXTINF:-1 tvg-id="same",B
http://host/b`;
    const ids = parseM3u(m3u, P).map((c) => c.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("takes a bare URL line as its own channel", () => {
    expect(parseM3u("http://host/naked", P)).toHaveLength(1);
  });

  it("survives CRLF and a byte-order mark", () => {
    const m3u = "﻿#EXTM3U\r\n#EXTINF:-1,TF1\r\nhttp://host/tf1\r\n";
    expect(parseM3u(m3u, P)[0].name).toBe("TF1");
  });

  it("carries the catchup source through", () => {
    const m3u = `#EXTINF:-1 catchup-source="http://host/c?t={utc}",TF1
http://host/tf1`;
    expect(parseM3u(m3u, P)[0].catchupSource).toBe("http://host/c?t={utc}");
  });

  it("reads the user agent VLC options carry", () => {
    const m3u = `#EXTINF:-1,TF1
#EXTVLCOPT:http-user-agent=MyPlayer/1.0
http://host/tf1`;
    expect(parseM3u(m3u, P)[0].attrs["vlcopt-user-agent"]).toBe("MyPlayer/1.0");
  });
});
