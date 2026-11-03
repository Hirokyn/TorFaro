import { describe, expect, it } from "vitest";

import {
  discardPlaceholderDates,
  isProwlarrDownloadUrl,
  normalizeCategories,
  normalizeIndexers,
  normalizeResult,
  safeInfoUrl,
  safeMagnetUrl,
} from "@/lib/prowlarr/normalize";
import { searchResultSchema } from "@/lib/prowlarr/types";

import { API_KEY, downloadUrl, PROWLARR_URL, upstreamResult } from "./helpers";

function normalize(overrides: Record<string, unknown> = {}) {
  return normalizeResult(searchResultSchema.parse(upstreamResult(overrides)), PROWLARR_URL);
}

const MAGNET = "magnet:?xt=urn:btih:2c6b6858d61da9543d4231a71db4b1c9264b0685&dn=ubuntu";

describe("normalizeResult", () => {
  it("normaliza os campos e mantém a URL de download somente em actionUrl", () => {
    const result = normalize();

    expect(result).toMatchObject({
      title: "Ubuntu 24.04",
      indexerName: "1337x",
      seeders: 9,
      categories: [{ id: 4000, name: "PC" }],
      magnetUrl: null,
      actionUrl: downloadUrl(1),
    });

    const { actionUrl, ...publicFields } = result!;
    expect(actionUrl).toContain(API_KEY);
    expect(JSON.stringify(publicFields)).not.toContain(API_KEY);
  });

  it("trata magnetUrl que aponta para o Prowlarr como ação protegida", () => {
    const result = normalize({ downloadUrl: undefined, magnetUrl: downloadUrl(5, "tpb") });

    expect(result?.magnetUrl).toBeNull();
    expect(result?.actionUrl).toBe(downloadUrl(5, "tpb"));
  });

  it("aceita magnet real em magnetUrl", () => {
    const result = normalize({ downloadUrl: undefined, magnetUrl: MAGNET });

    expect(result?.magnetUrl).toBe(MAGNET);
    expect(result?.actionUrl).toBeNull();
  });

  it("monta o magnet pelo infohash quando a fonte não traz link", () => {
    const hash = "a".repeat(40);
    const result = normalize({ downloadUrl: undefined, title: "Ubuntu & Debian", infoHash: hash });

    expect(result?.actionUrl).toBeNull();
    expect(result?.magnetUrl).toBe(`magnet:?xt=urn:btih:${hash}&dn=Ubuntu%20%26%20Debian`);
    expect(safeMagnetUrl(result?.magnetUrl)).toBe(result?.magnetUrl);
  });

  it("prefere o link do Prowlarr, que traz trackers, ao magnet montado", () => {
    expect(normalize({ infoHash: "a".repeat(40) })?.magnetUrl).toBeNull();
  });

  it("descarta download fora do Prowlarr configurado", () => {
    expect(normalize({ downloadUrl: "https://tracker.invalid/1/download?x=1" })?.actionUrl).toBeNull();
  });

  it("converte data mínima do .NET e tamanho zero em ausência de dado", () => {
    const result = normalize({ publishDate: "0001-01-01T00:00:00Z", size: 0 });

    expect(result?.publishedAt).toBeNull();
    expect(result?.size).toBeNull();
  });

  it("ignora infoHash inválido e normaliza o válido", () => {
    expect(normalize({ infoHash: "xyz" })?.infoHash).toBeNull();
    expect(normalize({ infoHash: "A".repeat(40) })?.infoHash).toBe("a".repeat(40));
  });

  it("decodifica entidades HTML vindas do indexador", () => {
    expect(normalize({ title: "Linux &amp; Scripting &#39;2024&#39;" })?.title).toBe("Linux & Scripting '2024'");
  });

  it.each([
    ["Show.S01E01.2160p.WEB-DL.DDP5.1.H.265-GRP", "2160p", "h265"],
    ["Movie (2024) 4K HDR x265", "2160p", "h265"],
    ["Show_S01_1080p_x264_GRP", "1080p", "h264"],
    ["Movie 720p BluRay AVC", "720p", "h264"],
    ["Old Movie 480p DVDRip AV1", "sd", "av1"],
    ["[Group] Anime - 05 (1080p HEVC)", "1080p", "h265"],
    ["Ubuntu 24.04 desktop amd64", null, null],
    ["Ubuntu Linux Bible 11E", null, null],
  ])("extrai resolução e codec de %s", (title, quality, codec) => {
    expect(normalize({ title })).toMatchObject({ quality, codec });
  });

  it("mantém downloads, arquivos e IMDb, tratando zero como ausência nos dois últimos", () => {
    expect(normalize({ grabs: 2340, files: 7, imdbId: 133093 })).toMatchObject({ grabs: 2340, files: 7, imdbId: 133093 });
    expect(normalize({ grabs: 0, files: 0, imdbId: 0 })).toMatchObject({ grabs: 0, files: null, imdbId: null });
    expect(normalize()).toMatchObject({ grabs: null, files: null, imdbId: null });
  });

  it("descarta resultado sem título", () => {
    expect(normalize({ title: "   " })).toBeNull();
  });
});

describe("discardPlaceholderDates", () => {
  const now = Date.parse("2026-11-02T15:22:24Z");
  const stamp = "2026-11-02T15:22:24.000Z";
  const build = (indexerId: number, publishedAt: string | null) => {
    const base = normalize()!;
    return { ...base, id: `${indexerId}-${Math.random()}`, indexerId, publishedAt };
  };

  it("remove a data quando todos os resultados da fonte têm o horário da busca", () => {
    const results = Array.from({ length: 5 }, () => build(11, stamp));

    expect(discardPlaceholderDates(results, now).every(({ publishedAt }) => publishedAt === null)).toBe(true);
  });

  it("preserva datas reais de fontes com lançamentos recentes", () => {
    const results = [
      ...Array.from({ length: 4 }, () => build(11, stamp)),
      build(11, "2026-11-02T14:00:00.000Z"),
    ];

    expect(discardPlaceholderDates(results, now)).toEqual(results);
  });

  it("não afeta fonte com poucos resultados nem data igual antiga", () => {
    const few = [build(1, stamp), build(1, stamp)];
    const old = Array.from({ length: 6 }, () => build(2, "2025-01-01T00:00:00.000Z"));

    expect(discardPlaceholderDates([...few, ...old], now)).toEqual([...few, ...old]);
  });

  it("avalia cada fonte separadamente", () => {
    const fake = Array.from({ length: 5 }, () => build(11, stamp));
    const real = build(3, stamp);

    const output = discardPlaceholderDates([...fake, real], now);

    expect(output.filter(({ publishedAt }) => publishedAt === null)).toHaveLength(5);
    expect(output.at(-1)?.publishedAt).toBe(stamp);
  });
});

describe("validação de URLs", () => {
  it.each([
    "javascript:alert(1)",
    "data:text/html,x",
    "http://example.invalid/x",
    "magnet:?dn=sem-hash",
    "magnet:javascript",
  ])("recusa %s como magnet", (value) => {
    expect(safeMagnetUrl(value)).toBeNull();
  });

  it("aceita somente http e https em infoUrl", () => {
    expect(safeInfoUrl("https://example.invalid/item", PROWLARR_URL)).toBe("https://example.invalid/item");
    expect(safeInfoUrl("javascript:alert(1)", PROWLARR_URL)).toBeNull();
    expect(safeInfoUrl("ftp://example.invalid/item", PROWLARR_URL)).toBeNull();
  });

  it("nunca publica infoUrl que aponte para o Prowlarr ou carregue apikey", () => {
    expect(safeInfoUrl(`${PROWLARR_URL}/1/details`, PROWLARR_URL)).toBeNull();
    expect(safeInfoUrl("https://example.invalid/?ApiKey=x", PROWLARR_URL)).toBeNull();
  });

  it("restringe host, porta e caminho do download", () => {
    expect(isProwlarrDownloadUrl(downloadUrl(1), PROWLARR_URL)).toBe(true);
    expect(isProwlarrDownloadUrl("http://prowlarr.internal:8080/1/download", PROWLARR_URL)).toBe(false);
    expect(isProwlarrDownloadUrl("http://other.internal:9696/1/download", PROWLARR_URL)).toBe(false);
    expect(isProwlarrDownloadUrl(`${PROWLARR_URL}/api/v1/system/status`, PROWLARR_URL)).toBe(false);
    expect(isProwlarrDownloadUrl(`${PROWLARR_URL}/1/download/../../api`, PROWLARR_URL)).toBe(false);
  });
});

describe("normalizeCategories", () => {
  it("remove categorias próprias do tracker e duplicadas", () => {
    expect(
      normalizeCategories([
        { id: 5000, name: "TV" },
        { id: 100028, name: "Anime/Anime" },
        { id: 5000, name: "TV" },
        { id: 2000, name: null },
      ]),
    ).toEqual([{ id: 5000, name: "TV" }]);
  });
});

describe("normalizeIndexers", () => {
  const indexers = [
    { id: 8, name: "Internet Archive", enable: true, protocol: "torrent" },
    { id: 1, name: "1337x", enable: true, protocol: "torrent" },
    { id: 9, name: "Desligado", enable: false, protocol: "torrent" },
  ];
  const now = Date.parse("2026-11-02T04:00:00Z");

  it("considera ausência no status como sem falha e omite desabilitados", () => {
    const result = normalizeIndexers(indexers, [], now);

    expect(result.map(({ id }) => id)).toEqual([1, 8]);
    expect(result.every(({ available }) => available)).toBe(true);
  });

  it("marca indisponível apenas enquanto disabledTill está no futuro", () => {
    const future = normalizeIndexers(indexers, [{ indexerId: 8, disabledTill: "2026-11-02T07:48:32Z" }], now);
    const past = normalizeIndexers(indexers, [{ indexerId: 8, disabledTill: "2026-11-01T07:48:32Z" }], now);

    expect(future[1]).toMatchObject({ available: false, disabledUntil: "2026-11-02T07:48:32Z" });
    expect(past[1]).toMatchObject({ available: true, disabledUntil: null });
  });
});
