import { describe, expect, it } from "vitest";

import type { NormalizedResult } from "@/lib/prowlarr/normalize";
import { CLEARED_FILTERS } from "@/lib/search/params";
import {
  buildSearchFacets,
  deduplicateResults,
  filterResults,
  paginate,
  sortResults,
  withOwnSource,
} from "@/lib/search/view";

function result(overrides: Partial<NormalizedResult>): NormalizedResult {
  return {
    id: "id",
    title: "Resultado",
    indexerId: 1,
    indexerName: "1337x",
    size: 1000,
    seeders: 1,
    leechers: 1,
    publishedAt: "2026-01-01T00:00:00.000Z",
    categories: [{ id: 4000, name: "PC" }],
    quality: null,
    codec: null,
    grabs: null,
    files: null,
    imdbId: null,
    magnetUrl: null,
    infoUrl: null,
    infoHash: null,
    actionUrl: "http://prowlarr/1/download",
    ...overrides,
  };
}

const NO_FILTERS = { ...CLEARED_FILTERS };
const ids = (items: { id: string }[]) => items.map(({ id }) => id);

describe("deduplicateResults", () => {
  const hash = "a".repeat(40);

  it("agrupa por infoHash, escolhe mais seeders e não soma valores", () => {
    const merged = deduplicateResults([
      result({ id: "a", infoHash: hash, seeders: 5, indexerId: 1, indexerName: "1337x" }),
      result({ id: "b", infoHash: hash, seeders: 12, indexerId: 5, indexerName: "TPB" }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: "b", seeders: 12 });
    expect(merged[0].sources).toEqual([
      { indexerId: 5, indexerName: "TPB", seeders: 12 },
      { indexerId: 1, indexerName: "1337x", seeders: 5 },
    ]);
  });

  it("desempata pelos metadados mais completos", () => {
    const merged = deduplicateResults([
      result({ id: "a", infoHash: hash, seeders: 5, size: null }),
      result({ id: "b", infoHash: hash, seeders: 5, infoUrl: "https://example.invalid" }),
    ]);

    expect(merged[0].id).toBe("b");
  });

  it("não agrupa por título nem resultados sem infoHash", () => {
    const merged = deduplicateResults([result({ id: "a", title: "X" }), result({ id: "b", title: "X" })]);

    expect(merged).toHaveLength(2);
  });
});

describe("filterResults", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");
  const items = [
    result({
      id: "tv",
      title: "Série Ação 1080p x265",
      categories: [{ id: 5070, name: "TV/Anime" }],
      seeders: 20,
      size: 500,
      quality: "1080p",
      codec: "h265",
      publishedAt: "2026-11-01T12:00:00Z",
    }),
    result({
      id: "pc",
      title: "Programa CAM",
      categories: [{ id: 4000, name: "PC" }],
      seeders: 2,
      size: 5000,
      indexerId: 5,
      indexerName: "TPB",
      publishedAt: "2026-06-01T00:00:00Z",
    }),
    result({ id: "vazio", categories: [], seeders: null, size: null, publishedAt: null }),
  ].map(withOwnSource);
  const filter = (filters: Partial<typeof NO_FILTERS> | object) =>
    ids(filterResults(items, { ...NO_FILTERS, ...filters }, now));

  it("casa categoria pela família padronizada", () => {
    expect(filter({ categories: [5000] })).toEqual(["tv"]);
  });

  it("exclui dado ausente quando o filtro exige o campo", () => {
    expect(filter({ minSeeders: 1 })).toEqual(["tv", "pc"]);
    expect(filter({ minSize: 1000 })).toEqual(["pc"]);
    expect(filter({ maxSize: 1000 })).toEqual(["tv"]);
    expect(filter({ publishedAfter: "2025-01-01" })).toEqual(["tv", "pc"]);
    expect(filter({ publishedAfter: "2026-07-01" })).toEqual(["tv"]);
  });

  it("filtra por fonte, resolução e codec", () => {
    expect(filter({ sources: [5] })).toEqual(["pc"]);
    expect(filter({ qualities: ["1080p"] })).toEqual(["tv"]);
    expect(filter({ qualities: ["720p"] })).toEqual([]);
    expect(filter({ codecs: ["h265"] })).toEqual(["tv"]);
  });

  it("considera todas as fontes de um resultado agrupado", () => {
    const hash = "b".repeat(40);
    const merged = deduplicateResults([
      result({ id: "a", infoHash: hash, seeders: 9, indexerId: 1 }),
      result({ id: "b", infoHash: hash, seeders: 1, indexerId: 5 }),
    ]);

    expect(ids(filterResults(merged, { ...NO_FILTERS, sources: [5] }, now))).toEqual(["a"]);
  });

  it("aplica o período relativo à data atual", () => {
    expect(filter({ maxAgeDays: 7 })).toEqual(["tv"]);
    expect(filter({ maxAgeDays: 365 })).toEqual(["tv", "pc"]);
  });

  it("filtra texto do título sem diferenciar caixa ou acentos", () => {
    expect(filter({ titleIncludes: "acao SERIE" })).toEqual(["tv"]);
    expect(filter({ titleExcludes: "cam" })).toEqual(["tv", "vazio"]);
    expect(filter({ titleExcludes: "ação cam" })).toEqual(["vazio"]);
  });
});

describe("sortResults", () => {
  it("mantém valores ausentes no fim nas duas direções", () => {
    const items = [result({ id: "n", seeders: null }), result({ id: "a", seeders: 1 }), result({ id: "b", seeders: 2 })];

    expect(ids(sortResults(items, "seeders", "desc"))).toEqual(["b", "a", "n"]);
    expect(ids(sortResults(items, "seeders", "asc"))).toEqual(["a", "b", "n"]);
  });

  it("ordena títulos com regras de idioma e sem alterar a entrada", () => {
    const items = [result({ id: "b", title: "Água" }), result({ id: "a", title: "zebra" })];

    expect(ids(sortResults(items, "title", "asc"))).toEqual(["b", "a"]);
    expect(items[0].id).toBe("b");
  });

  it("prioriza o dia mais recente e usa seeders como segundo critério", () => {
    const items = [
      result({ id: "velho-popular", publishedAt: "2026-10-01T10:00:00Z", seeders: 5000 }),
      result({ id: "hoje-cedo-popular", publishedAt: "2026-11-02T01:00:00Z", seeders: 300 }),
      result({ id: "hoje-tarde-fraco", publishedAt: "2026-11-02T23:00:00Z", seeders: 2 }),
      result({ id: "sem-data", publishedAt: null, seeders: 9000 }),
    ];

    expect(ids(sortResults(items, "publishedAt", "desc"))).toEqual([
      "hoje-cedo-popular",
      "hoje-tarde-fraco",
      "velho-popular",
      "sem-data",
    ]);
  });

  it("mantém seeders como desempate também na ordem crescente de data", () => {
    const items = [
      result({ id: "fraco", publishedAt: "2026-01-01T01:00:00Z", seeders: 1 }),
      result({ id: "forte", publishedAt: "2026-01-01T02:00:00Z", seeders: 9 }),
    ];

    expect(ids(sortResults(items, "publishedAt", "asc"))).toEqual(["forte", "fraco"]);
  });

  it("desempata outras ordenações por data e depois seeders", () => {
    const items = [
      result({ id: "antigo", size: 10, publishedAt: "2025-01-01T00:00:00Z", seeders: 99 }),
      result({ id: "novo-fraco", size: 10, publishedAt: "2026-01-01T00:00:00Z", seeders: 1 }),
      result({ id: "novo-forte", size: 10, publishedAt: "2026-01-01T09:00:00Z", seeders: 7 }),
    ];

    expect(ids(sortResults(items, "size", "desc"))).toEqual(["novo-forte", "novo-fraco", "antigo"]);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 120 }, (_, index) => index);

  it("informa contagens reais e próxima página", () => {
    const { items: page, pagination } = paginate(items, 2, 50, 182);

    expect(page[0]).toBe(50);
    expect(pagination).toEqual({
      page: 2,
      pageSize: 50,
      upstreamCount: 182,
      filteredCount: 120,
      totalPages: 3,
      hasMore: true,
    });
  });

  it("limita a página ao total disponível", () => {
    expect(paginate(items, 99, 50, 120).pagination).toMatchObject({ page: 3, hasMore: false });
    expect(paginate([], 1, 50, 0).pagination).toMatchObject({ page: 1, totalPages: 1, hasMore: false });
  });
});

describe("buildSearchFacets", () => {
  const items = [
    result({
      id: "a",
      categories: [
        { id: 5070, name: "TV/Anime" },
        { id: 5040, name: "TV/HD" },
      ],
      quality: "1080p",
      codec: "h265",
    }),
    result({ id: "b", categories: [{ id: 5000, name: "TV" }], quality: "2160p", indexerId: 5, indexerName: "TPB" }),
    result({ id: "c", categories: [{ id: 4000, name: "PC" }], quality: "1080p" }),
  ].map(withOwnSource);

  it("agrega por família e conta cada resultado uma vez", () => {
    expect(buildSearchFacets(items, NO_FILTERS).categories).toEqual([
      { id: 5000, name: "TV", count: 2 },
      { id: 4000, name: "PC", count: 1 },
    ]);
  });

  it("traduz as categorias padronizadas", () => {
    const books = [result({ categories: [{ id: 7020, name: "Books/EBook" }] })].map(withOwnSource);

    expect(buildSearchFacets(books, NO_FILTERS).categories).toEqual([{ id: 7000, name: "Livros", count: 1 }]);
  });

  it("lista fontes, resoluções e codecs presentes, com resolução em ordem fixa", () => {
    const facets = buildSearchFacets(items, NO_FILTERS);

    expect(facets.sources).toEqual([
      { id: 1, name: "1337x", count: 2 },
      { id: 5, name: "TPB", count: 1 },
    ]);
    expect(facets.qualities).toEqual([
      { id: "2160p", name: "4K", count: 1 },
      { id: "1080p", name: "1080p", count: 2 },
    ]);
    expect(facets.codecs).toEqual([{ id: "h265", name: "H.265", count: 1 }]);
  });

  it("mantém as opções do grupo filtrado e aplica os demais filtros", () => {
    const facets = buildSearchFacets(items, { ...NO_FILTERS, sources: [5] });

    expect(facets.sources.map(({ id }) => id)).toEqual([1, 5]);
    expect(facets.qualities).toEqual([{ id: "2160p", name: "4K", count: 1 }]);
  });
});
