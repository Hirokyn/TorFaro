import { describe, expect, it } from "vitest";

import {
  DEFAULT_SEARCH_STATE,
  parseSearchState,
  rawSearchParams,
  searchRequestSchema,
  serializeSearchState,
  shouldSearch,
  upstreamSearchKey,
} from "@/lib/search/params";

function parseRequest(query: string) {
  return searchRequestSchema.safeParse(rawSearchParams(new URLSearchParams(query)));
}

describe("searchRequestSchema", () => {
  it("aplica padrões e normaliza o termo", () => {
    const parsed = parseRequest("q=%20ubuntu%20");

    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ q: "ubuntu", sort: "publishedAt", order: "desc", page: 1, pageSize: 25 });
  });

  it("aceita os filtros locais novos", () => {
    const parsed = parseRequest(
      "q=ubuntu&sources=5,1&qualities=1080p&qualities=2160p&codecs=h265&maxAgeDays=7&titleIncludes=web&titleExcludes=cam",
    );

    expect(parsed.data).toMatchObject({
      sources: [1, 5],
      qualities: ["2160p", "1080p"],
      codecs: ["h265"],
      maxAgeDays: 7,
      titleIncludes: "web",
      titleExcludes: "cam",
    });
  });

  it("aceita termo vazio, usado na lista de recentes", () => {
    expect(parseRequest("").data?.q).toBe("");
  });

  it("aceita indexadores repetidos ou CSV na API interna", () => {
    expect(parseRequest("q=ubuntu&indexerIds=5&indexerIds=1").data?.indexerIds).toEqual([1, 5]);
    expect(parseRequest("q=ubuntu&indexerIds=5,1,1").data?.indexerIds).toEqual([1, 5]);
  });

  it.each([
    ["q=a", "termo curto"],
    [`q=${"a".repeat(201)}`, "termo longo"],
    ["q=ubuntu&pageSize=30", "pageSize fora da lista"],
    ["q=ubuntu&sort=grabs", "ordenação desconhecida"],
    ["q=ubuntu&indexerIds=abc", "indexador inválido"],
    ["q=ubuntu&page=0", "página inválida"],
    ["q=ubuntu&minSize=10&maxSize=5", "faixa de tamanho invertida"],
    ["q=ubuntu&publishedAfter=ontem", "data inválida"],
    ["q=ubuntu&qualities=8k", "resolução desconhecida"],
    ["q=ubuntu&codecs=mpeg2", "codec desconhecido"],
    ["q=ubuntu&maxAgeDays=3", "período fora da lista"],
    [`q=ubuntu&titleIncludes=${"a".repeat(101)}`, "texto longo"],
  ])("rejeita %s (%s)", (query) => {
    expect(parseRequest(query).success).toBe(false);
  });

  it("trata parâmetro vazio como ausente", () => {
    expect(parseRequest("q=ubuntu&minSeeders=").data?.minSeeders).toBeUndefined();
  });
});

describe("estado da URL", () => {
  it("preserva termo e filtros em ida e volta", () => {
    const state = {
      ...DEFAULT_SEARCH_STATE,
      q: "ubuntu",
      indexerIds: [1, 5],
      categories: [4000],
      sources: [5],
      qualities: ["1080p" as const],
      codecs: ["h265" as const],
      titleIncludes: "web dl",
      titleExcludes: "cam",
      maxAgeDays: 30 as const,
      minSeeders: 3,
      sort: "size" as const,
      order: "asc" as const,
      page: 2,
      pageSize: 100 as const,
      deduplicate: true,
    };

    const serialized = serializeSearchState(state);

    expect(serialized.getAll("indexerIds")).toEqual(["1", "5"]);
    expect(parseSearchState(serialized)).toEqual(state);
  });

  it("só pede a lista sem termo quando o usuário escolheu uma guia", () => {
    expect(shouldSearch({ q: "", browse: false })).toBe(false);
    expect(shouldSearch({ q: "", browse: true })).toBe(true);
    expect(shouldSearch({ q: "ubuntu", browse: false })).toBe(true);
    expect(shouldSearch({ q: "a", browse: false })).toBe(false);
    expect(parseSearchState(new URLSearchParams("browse=true")).browse).toBe(true);
  });

  it("omite valores padrão", () => {
    expect(serializeSearchState({ ...DEFAULT_SEARCH_STATE, q: "ubuntu" }).toString()).toBe("q=ubuntu");
  });

  it("ignora campos inválidos sem descartar os válidos", () => {
    const state = parseSearchState(new URLSearchParams("q=ubuntu&sort=x&page=abc&minSeeders=2"));

    expect(state).toMatchObject({ q: "ubuntu", sort: "publishedAt", page: 1, minSeeders: 2 });
  });

  it("a chave upstream depende só do termo e dos indexadores", () => {
    expect(upstreamSearchKey({ q: "  Ubuntu   LTS ", indexerIds: [5, 1] })).toBe("ubuntu lts|1,5");
  });
});
