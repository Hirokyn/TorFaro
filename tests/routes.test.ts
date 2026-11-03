import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as health } from "@/app/api/health/route";
import { GET as indexers } from "@/app/api/indexers/route";
import { GET as detailsRoute } from "@/app/api/results/[token]/details/route";
import { GET as magnet } from "@/app/api/results/[token]/magnet/route";
import { GET as torrent } from "@/app/api/results/[token]/torrent/route";
import { GET as search } from "@/app/api/search/route";
import { ACTION_TOKEN_TTL_MS } from "@/lib/actions/tokens";
import type { SearchResponse } from "@/lib/contracts";
import { resetServerState } from "@/lib/server-state";
import { SEARCH_CACHE_TTL_MS } from "@/lib/search/service";

import {
  API_KEY,
  appRequest,
  clientAddress,
  downloadUrl,
  PROWLARR_URL,
  requestsTo,
  searchRoutes,
  stubAppEnv,
  stubProwlarr,
  upstreamResult,
} from "./helpers";

const MAGNET = "magnet:?xt=urn:btih:2c6b6858d61da9543d4231a71db4b1c9264b0685&dn=ubuntu";

async function runSearch(path: string, client = clientAddress()) {
  const response = await search(appRequest(path, client));
  return { response, body: (await response.json()) as SearchResponse };
}

function tokenContext(token: string) {
  return { params: Promise.resolve({ token }) };
}

function bytes(text: string) {
  return new TextEncoder().encode(text);
}

async function firstToken(client: string) {
  const { body } = await runSearch("/api/search?q=ubuntu", client);
  return body.results[0].torrentActionToken!;
}

beforeEach(() => {
  stubAppEnv();
  resetServerState();
});

describe("GET /api/health", () => {
  it("informa a versão sem expor host ou chave", async () => {
    stubProwlarr([{ match: /system\/status$/, respond: () => Response.json({ version: "2.5.2.5491" }) }]);

    const response = await health();
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toMatchObject({
      status: "connected",
      prowlarr: { reachable: true, version: "2.5.2.5491" },
    });
    expect(text).not.toContain("prowlarr.internal");
    expect(text).not.toContain(API_KEY);
  });

  it("segue respondendo 200 quando o Prowlarr está fora", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(`fetch failed ${PROWLARR_URL}`)));

    const response = await health();
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toMatchObject({ status: "disconnected", prowlarr: { version: null } });
    expect(text).not.toContain("prowlarr.internal");
  });
});

describe("GET /api/indexers", () => {
  it("normaliza indexadores e estado", async () => {
    stubProwlarr(
      searchRoutes([], { statuses: [{ indexerId: 8, disabledTill: "2999-01-01T00:00:00Z" }] }),
    );

    const response = await indexers(appRequest("/api/indexers"));
    const body = await response.json();

    expect(body.indexers).toEqual([
      expect.objectContaining({ id: 1, available: true, disabledUntil: null }),
      expect.objectContaining({ id: 8, available: false, disabledUntil: "2999-01-01T00:00:00Z" }),
    ]);
  });

  it("sanitiza a falha upstream", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(`connect failed ${PROWLARR_URL}`)));

    const response = await indexers(appRequest("/api/indexers"));
    const text = await response.text();

    expect(response.status).toBe(502);
    expect(text).not.toContain("prowlarr.internal");
  });
});

describe("GET /api/search", () => {
  it("sem termo, lista os lançamentos recentes dos indexadores", async () => {
    const fetchMock = stubProwlarr(searchRoutes([upstreamResult()]));

    const { response, body } = await runSearch("/api/search");

    expect(response.status).toBe(200);
    expect(body.query).toBe("");
    expect(body.results).toHaveLength(1);
    const [url] = requestsTo(fetchMock, "/api/v1/search")[0];
    expect(new URL(String(url)).searchParams.get("query")).toBe("");
  });

  it("não exige login nem define cookie", async () => {
    stubProwlarr(searchRoutes([upstreamResult()]));

    const { response } = await runSearch("/api/search?q=ubuntu");

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("valida a entrada antes de chamar o Prowlarr", async () => {
    const fetchMock = stubProwlarr(searchRoutes([]));

    const response = await search(appRequest("/api/search?q=a"));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("nunca publica URL interna, downloadUrl ou API key", async () => {
    stubProwlarr(
      searchRoutes([
        upstreamResult(),
        upstreamResult({ guid: "b", indexerId: 5, downloadUrl: undefined, magnetUrl: downloadUrl(5) }),
      ]),
    );

    const { response, body } = await runSearch("/api/search?q=ubuntu");
    const text = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(2);
    expect(text).not.toContain(API_KEY);
    expect(text).not.toContain("prowlarr.internal");
    expect(text).not.toContain("downloadUrl");
    expect(body.results.every(({ torrentActionToken }) => torrentActionToken)).toBe(true);
    expect(body.results.every(({ magnetUrl }) => magnetUrl === null)).toBe(true);
  });

  it("envia indexadores como parâmetros repetidos", async () => {
    const fetchMock = stubProwlarr(searchRoutes([]));

    await runSearch("/api/search?q=ubuntu&indexerIds=1,5");

    const sent = requestsTo(fetchMock, "/api/v1/search").map(([url]) =>
      new URL(String(url)).searchParams.getAll("indexerIds"),
    );
    expect(sent).toEqual([["1"], ["5"]]);
  });

  it("pagina e reordena localmente sem repetir a busca upstream", async () => {
    const results = Array.from({ length: 60 }, (_, index) =>
      upstreamResult({ guid: `g${index}`, title: `Item ${index}`, seeders: index }),
    );
    const fetchMock = stubProwlarr(searchRoutes(results));
    const client = clientAddress();

    const first = await runSearch("/api/search?q=ubuntu&pageSize=25", client);
    const second = await runSearch("/api/search?q=ubuntu&pageSize=25&page=2&cachedOnly=true", client);
    const upstreamCalls = requestsTo(fetchMock, "/api/v1/search").length;
    const sorted = await runSearch("/api/search?q=ubuntu&sort=title&order=asc&cachedOnly=true", client);

    expect(first.body.results[0].seeders).toBe(59);
    expect(first.body.pagination).toMatchObject({ upstreamCount: 60, filteredCount: 60, totalPages: 3 });
    expect(second.body.results[0].seeders).toBe(34);
    expect(second.body.servedFromCache).toBe(true);
    expect(sorted.body.results[0].title).toBe("Item 0");
    expect(requestsTo(fetchMock, "/api/v1/search")).toHaveLength(upstreamCalls);
  });

  it("ordena por padrão pelo mais recente, com seeders como segundo critério", async () => {
    stubProwlarr(
      searchRoutes([
        upstreamResult({ guid: "antigo", publishDate: "2025-01-01T00:00:00Z", seeders: 900 }),
        upstreamResult({ guid: "novo-fraco", publishDate: "2026-10-30T22:00:00Z", seeders: 3 }),
        upstreamResult({ guid: "novo-forte", publishDate: "2026-10-30T01:00:00Z", seeders: 40 }),
      ]),
    );

    const { body } = await runSearch("/api/search?q=ubuntu");

    expect(body.results.map(({ seeders }) => seeders)).toEqual([40, 3, 900]);
  });

  it("aplica os filtros novos sobre o cache e devolve as facetas", async () => {
    const fetchMock = stubProwlarr(
      searchRoutes([
        upstreamResult({ guid: "a", title: "Show 1080p x265", indexerId: 1, indexer: "1337x" }),
        upstreamResult({ guid: "b", title: "Show 2160p AV1", indexerId: 5, indexer: "TPB" }),
      ]),
    );
    const client = clientAddress();

    const first = await runSearch("/api/search?q=show", client);
    const upstreamCalls = requestsTo(fetchMock, "/api/v1/search").length;
    const filtered = await runSearch("/api/search?q=show&qualities=2160p&sources=5&cachedOnly=true", client);

    expect(first.body.facets.qualities.map(({ id }) => id)).toEqual(["2160p", "1080p"]);
    expect(first.body.facets.sources.map(({ name }) => name).sort()).toEqual(["1337x", "TPB"]);
    expect(filtered.body.results).toHaveLength(1);
    expect(filtered.body.results[0]).toMatchObject({ quality: "2160p", codec: "av1", indexerId: 5 });
    expect(requestsTo(fetchMock, "/api/v1/search")).toHaveLength(upstreamCalls);
  });

  it("recusa cachedOnly sem cache em vez de consultar os indexadores", async () => {
    const fetchMock = stubProwlarr(searchRoutes([]));

    const response = await search(appRequest("/api/search?q=ubuntu&cachedOnly=true"));

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("search_expired");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("expira o cache depois do TTL", async () => {
    const now = vi.spyOn(Date, "now");
    const fetchMock = stubProwlarr(searchRoutes([upstreamResult()]));
    const client = clientAddress();

    now.mockReturnValue(1_000_000);
    await runSearch("/api/search?q=ubuntu", client);
    const firstRun = requestsTo(fetchMock, "/api/v1/search").length;
    now.mockReturnValue(1_000_000 + SEARCH_CACHE_TTL_MS + 1);
    await runSearch("/api/search?q=ubuntu", client);

    expect(requestsTo(fetchMock, "/api/v1/search")).toHaveLength(firstRun * 2);
  });

  it("devolve parcial quando um indexador falhou, sem transformar em erro", async () => {
    stubProwlarr(
      searchRoutes([upstreamResult()], {
        statuses: [{ indexerId: 8, disabledTill: "2999-01-01T00:00:00Z" }],
      }),
    );

    const { response, body } = await runSearch("/api/search?q=ubuntu");

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(body.partial).toEqual({
      isPartial: true,
      unavailableIndexers: [{ id: 8, name: "Internet Archive", disabledUntil: "2999-01-01T00:00:00Z" }],
    });
  });

  it("uma fonte que falha entra no aviso sem derrubar as demais", async () => {
    const [upstreamSearch, ...others] = searchRoutes([
      upstreamResult({ guid: "a", indexerId: 1, indexer: "1337x" }),
      upstreamResult({ guid: "b", indexerId: 5, indexer: "TPB" }),
    ]);
    stubProwlarr([
      {
        match: upstreamSearch.match,
        respond: (url) =>
          url.searchParams.get("indexerIds") === "5" ? new Response(null, { status: 500 }) : upstreamSearch.respond(url),
      },
      ...others,
    ]);

    const { response, body } = await runSearch("/api/search?q=ubuntu");

    expect(response.status).toBe(200);
    expect(body.results.map(({ indexerName }) => indexerName)).toEqual(["1337x"]);
    expect(body.partial.unavailableIndexers).toEqual([{ id: 5, name: "TPB", disabledUntil: null }]);
  });

  it("devolve erro somente quando todas as fontes falham", async () => {
    const [upstreamSearch, ...others] = searchRoutes([upstreamResult()]);
    stubProwlarr([{ match: upstreamSearch.match, respond: () => new Response(null, { status: 500 }) }, ...others]);

    const response = await search(appRequest("/api/search?q=ubuntu"));

    expect(response.status).toBe(502);
  });

  it("só avisa sobre indexadores que faziam parte da busca", async () => {
    stubProwlarr(
      searchRoutes([], { statuses: [{ indexerId: 8, disabledTill: "2999-01-01T00:00:00Z" }] }),
    );

    const { body } = await runSearch("/api/search?q=ubuntu&indexerIds=1");

    expect(body.partial.isPartial).toBe(false);
  });

  it("mantém a busca quando o estado dos indexadores não está disponível", async () => {
    stubProwlarr([searchRoutes([upstreamResult()])[0]]);

    const { response, body } = await runSearch("/api/search?q=ubuntu");

    expect(response.status).toBe(200);
    expect(body.partial.isPartial).toBe(false);
  });

  it("sanitiza falha total do Prowlarr", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(`connect failed ${PROWLARR_URL}`)));

    const response = await search(appRequest("/api/search?q=ubuntu"));
    const text = await response.text();

    expect(response.status).toBe(502);
    expect(text).not.toContain("prowlarr.internal");
    expect(text).not.toContain("stack");
  });

  it("duas abas do mesmo aparelho não cancelam a busca uma da outra", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: URL, init: RequestInit) => {
        if (new URL(String(input)).pathname !== "/api/v1/search") return Promise.resolve(Response.json([]));
        signals.push(init.signal!);
        return new Promise<Response>((resolve) => setTimeout(() => resolve(Response.json([])), 20));
      }),
    );
    const client = clientAddress();

    const [first, second] = await Promise.all([
      search(appRequest("/api/search?q=primeira", client)),
      search(appRequest("/api/search?q=segunda", client)),
    ]);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(signals).toHaveLength(2);
    expect(signals.some(({ aborted }) => aborted)).toBe(false);
  });

  it("a mesma busca em duas abas consulta os indexadores uma vez", async () => {
    const fetchMock = stubProwlarr(searchRoutes([upstreamResult()]));
    const client = clientAddress();

    await Promise.all([
      search(appRequest("/api/search?q=igual", client)),
      search(appRequest("/api/search?q=igual&page=2", client)),
    ]);

    const calls = requestsTo(fetchMock, "/api/v1/search").map(([url]) => new URL(String(url)).searchParams.get("indexerIds"));
    expect(new Set(calls).size).toBe(calls.length);
  });

  it("cancela o upstream quando o cliente desiste da busca", async () => {
    let upstreamSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_: URL, init: RequestInit) => {
        upstreamSignal = init.signal!;
        return new Promise<Response>((_, reject) => {
          init.signal!.addEventListener("abort", () => reject(new Error("aborted")));
        });
      }),
    );
    const client = new AbortController();
    const request = new NextRequest("https://search.example.test/api/search?q=ubuntu", {
      headers: { "x-forwarded-for": clientAddress() },
      signal: client.signal,
    });

    const pending = search(request);
    await vi.waitFor(() => expect(upstreamSignal).toBeDefined());
    client.abort();

    expect((await pending).status).toBe(499);
    expect(upstreamSignal?.aborted).toBe(true);
  });

  it("limita buscas upstream por sessão", async () => {
    stubProwlarr(searchRoutes([]));
    const client = clientAddress();

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const response = await search(appRequest(`/api/search?q=termo${attempt}`, client));
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 15).every((status) => status === 200)).toBe(true);
    expect(statuses[15]).toBe(429);
  });
});

describe("GET /api/results/:token/details", () => {
  const hash = "c690c3ae".padEnd(40, "0");
  const fullMagnet = `magnet:?xt=urn:btih:${hash.toUpperCase()}&dn=ubuntu&tr=udp%3A%2F%2Ftracker.invalid%3A1337&tr=http%3A%2F%2Fother.invalid%2Fannounce`;

  function benc(value: unknown): string {
    if (typeof value === "number") return `i${value}e`;
    if (typeof value === "string") return `${new TextEncoder().encode(value).length}:${value}`;
    if (Array.isArray(value)) return `l${value.map(benc).join("")}e`;
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `d${entries.map(([key, item]) => benc(key) + benc(item)).join("")}e`;
  }

  async function details(client: string, token: string) {
    const response = await detailsRoute(appRequest(`/api/results/${token}/details`, client), tokenContext(token));
    return { response, body: await response.json() };
  }

  it("traz trackers e infohash do magnet, sem expor a URL upstream", async () => {
    stubProwlarr([
      ...searchRoutes([upstreamResult()]),
      { match: /^\/1\/download$/, respond: () => new Response(null, { status: 301, headers: { Location: fullMagnet } }) },
    ]);
    const client = clientAddress();
    const token = await firstToken(client);

    const { response, body } = await details(client, token);

    expect(response.status).toBe(200);
    expect(body.result.title).toBe("Ubuntu 24.04");
    expect(body.details).toMatchObject({
      infoHash: hash,
      trackers: ["udp://tracker.invalid:1337", "http://other.invalid/announce"],
      files: [],
    });
    expect(JSON.stringify(body)).not.toContain(API_KEY);
    expect(JSON.stringify(body)).not.toContain("prowlarr.internal");
  });

  it("lê arquivos e metadados do .torrent", async () => {
    const torrent = benc({
      announce: "http://tracker.invalid/announce",
      comment: "Pacote de teste",
      "created by": "qBittorrent",
      "creation date": 1700000000,
      info: {
        name: "ubuntu",
        "piece length": 262144,
        pieces: "x".repeat(40),
        files: [
          { length: 100, path: ["disco", "a.iso"] },
          { length: 50, path: ["b.txt"] },
        ],
      },
    });
    stubProwlarr([
      ...searchRoutes([upstreamResult()]),
      { match: /^\/1\/download$/, respond: () => new Response(bytes(torrent)) },
    ]);
    const client = clientAddress();
    const token = await firstToken(client);

    const { body } = await details(client, token);

    expect(body.details).toMatchObject({
      name: "ubuntu",
      files: [
        { path: "disco/a.iso", size: 100 },
        { path: "b.txt", size: 50 },
      ],
      fileCount: 2,
      pieceSize: 262144,
      pieceCount: 2,
      createdBy: "qBittorrent",
      comment: "Pacote de teste",
      createdAt: "2023-11-14T22:13:20.000Z",
      trackers: ["http://tracker.invalid/announce"],
    });
    expect(body.details.infoHash).toMatch(/^[a-f0-9]{40}$/);
  });

  function torrentFile() {
    return benc({
      announce: "http://tracker.invalid/announce",
      info: {
        name: "ubuntu",
        "piece length": 262144,
        pieces: "x".repeat(40),
        files: [{ length: 100, path: ["a.iso"] }],
      },
    });
  }

  it("transforma .torrent em magnet para abrir o cliente de torrent", async () => {
    stubProwlarr([
      ...searchRoutes([upstreamResult()]),
      { match: /^\/1\/download$/, respond: () => new Response(bytes(torrentFile())) },
    ]);
    const client = clientAddress();
    const token = await firstToken(client);

    const response = await torrent(appRequest(`/api/results/${token}/torrent`, client), tokenContext(token));
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(302);
    expect(location.protocol).toBe("magnet:");
    expect(location.searchParams.get("xt")).toMatch(/^urn:btih:[a-f0-9]{40}$/);
    expect(location.searchParams.get("dn")).toBe("ubuntu");
    expect(location.searchParams.getAll("tr")).toEqual(["http://tracker.invalid/announce"]);
  });

  it("copiar magnet também funciona em fontes de .torrent", async () => {
    stubProwlarr([
      ...searchRoutes([upstreamResult()]),
      { match: /^\/1\/download$/, respond: () => new Response(bytes(torrentFile())) },
    ]);
    const client = clientAddress();
    const token = await firstToken(client);

    const response = await magnet(appRequest(`/api/results/${token}/magnet`, client), tokenContext(token));

    expect(response.status).toBe(200);
    expect((await response.json()).magnetUrl).toMatch(/^magnet:\?xt=urn:btih:/);
  });

  it("mantém a lista de arquivos depois de abrir o ímã, sem baixar de novo", async () => {
    const fetchMock = stubProwlarr([
      ...searchRoutes([upstreamResult()]),
      { match: /^\/1\/download$/, respond: () => new Response(bytes(torrentFile())) },
    ]);
    const client = clientAddress();
    const token = await firstToken(client);

    await torrent(appRequest(`/api/results/${token}/torrent`, client), tokenContext(token));
    const { body } = await details(client, token);

    expect(body.details.files).toEqual([{ path: "a.iso", size: 100 }]);
    expect(requestsTo(fetchMock, "/1/download")).toHaveLength(1);
  });

  it("mantém a página quando a fonte falha", async () => {
    stubProwlarr([
      ...searchRoutes([upstreamResult()]),
      { match: /^\/1\/download$/, respond: () => new Response(null, { status: 500 }) },
    ]);
    const client = clientAddress();
    const token = await firstToken(client);

    const { response, body } = await details(client, token);

    expect(response.status).toBe(200);
    expect(body.result.title).toBe("Ubuntu 24.04");
    expect(body.details).toBeNull();
  });

  it("não baixa de novo ao reabrir a página", async () => {
    const fetchMock = stubProwlarr([
      ...searchRoutes([upstreamResult()]),
      { match: /^\/1\/download$/, respond: () => new Response(null, { status: 301, headers: { Location: fullMagnet } }) },
    ]);
    const client = clientAddress();
    const token = await firstToken(client);

    await details(client, token);
    await details(client, token);

    expect(requestsTo(fetchMock, "/1/download")).toHaveLength(1);
  });

  it("não atende token de outro cliente", async () => {
    stubProwlarr(searchRoutes([upstreamResult()]));
    const token = await firstToken(clientAddress());

    const { response } = await details(clientAddress(), token);

    expect(response.status).toBe(404);
  });
});

describe("ações de resultado", () => {
  const session = clientAddress;

  it("resolve magnet pelo token sem expor a URL upstream", async () => {
    const fetchMock = stubProwlarr([
      ...searchRoutes([upstreamResult()]),
      {
        match: /^\/1\/download$/,
        respond: () => new Response(null, { status: 301, headers: { Location: MAGNET } }),
      },
    ]);
    const client = session();
    const token = await firstToken(client);

    const response = await magnet(appRequest(`/api/results/${token}/magnet`, client), tokenContext(token));
    const again = await magnet(appRequest(`/api/results/${token}/magnet`, client), tokenContext(token));

    expect(await response.json()).toEqual({ magnetUrl: MAGNET });
    expect(again.status).toBe(200);
    expect(requestsTo(fetchMock, "/1/download")).toHaveLength(1);
  });

  it("transmite .torrent com cabeçalhos de download", async () => {
    stubProwlarr([
      ...searchRoutes([upstreamResult({ title: 'Ubuntu "24" / LTS' })]),
      {
        match: /^\/1\/download$/,
        respond: () => new Response(bytes("d4:infoe"), { headers: { "Content-Length": "8" } }),
      },
    ]);
    const client = session();
    const token = await firstToken(client);

    const response = await torrent(appRequest(`/api/results/${token}/torrent`, client), tokenContext(token));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/x-bittorrent");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="Ubuntu_24_LTS.torrent"');
    expect(await response.text()).toBe("d4:infoe");
  });

  it("redireciona para o magnet quando não há arquivo", async () => {
    stubProwlarr([
      ...searchRoutes([upstreamResult()]),
      {
        match: /^\/1\/download$/,
        respond: () => new Response(null, { status: 301, headers: { Location: MAGNET } }),
      },
    ]);
    const client = session();
    const token = await firstToken(client);

    const response = await torrent(appRequest(`/api/results/${token}/torrent`, client), tokenContext(token));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(MAGNET);
  });

  it.each([
    ["redirecionamento para host externo", () => new Response(null, { status: 302, headers: { Location: "https://tracker.invalid/f.torrent" } })],
    ["corpo que não é torrent", () => new Response(bytes("<html>erro</html>"))],
    ["erro do Prowlarr", () => new Response(null, { status: 500 })],
    ["arquivo acima do limite", () => new Response(bytes("d"), { headers: { "Content-Length": String(50 * 1024 * 1024) } })],
  ])("recusa %s", async (_, respond) => {
    const fetchMock = stubProwlarr([
      ...searchRoutes([upstreamResult()]),
      { match: /^\/1\/download$/, respond },
    ]);
    const client = session();
    const token = await firstToken(client);

    const response = await torrent(appRequest(`/api/results/${token}/torrent`, client), tokenContext(token));
    const text = await response.text();

    expect(response.status).toBe(502);
    expect(text).not.toContain(API_KEY);
    expect(text).not.toContain("prowlarr.internal");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("tracker.invalid"))).toBe(false);
  });

  it("interrompe o streaming quando o corpo passa do limite sem Content-Length", async () => {
    const chunk = new Uint8Array(6 * 1024 * 1024).fill(0x64);
    stubProwlarr([
      ...searchRoutes([upstreamResult()]),
      {
        match: /^\/1\/download$/,
        respond: () =>
          new Response(
            new ReadableStream({
              pull(controller) {
                controller.enqueue(chunk);
              },
            }),
          ),
      },
    ]);
    const client = session();
    const token = await firstToken(client);

    const response = await torrent(appRequest(`/api/results/${token}/torrent`, client), tokenContext(token));

    expect(response.status).toBe(502);
  });

  it("mostra página de erro quando o link é aberto em navegação direta", async () => {
    stubProwlarr([]);
    const request = new NextRequest("https://search.example.test/api/results/curto/torrent", {
      headers: { "sec-fetch-mode": "navigate", "x-forwarded-for": clientAddress() },
    });

    const response = await torrent(request, tokenContext("curto"));
    const html = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("Busque novamente");
    expect(html).toContain('href="/"');
  });

  it("não aceita token de outro cliente", async () => {
    stubProwlarr(searchRoutes([upstreamResult()]));
    const token = await firstToken(session());

    const response = await torrent(appRequest(`/api/results/${token}/torrent`, session()), tokenContext(token));

    expect(response.status).toBe(404);
  });

  it("recusa token expirado", async () => {
    const now = vi.spyOn(Date, "now");
    stubProwlarr(searchRoutes([upstreamResult()]));

    now.mockReturnValue(1_000_000);
    const client = clientAddress();
    const token = await firstToken(client);
    now.mockReturnValue(1_000_000 + ACTION_TOKEN_TTL_MS + 1);

    const response = await torrent(appRequest(`/api/results/${token}/torrent`, client), tokenContext(token));

    expect(response.status).toBe(410);
  });

  it.each(["http://example.invalid/x", "..%2F..%2Fapi", "curto"])("recusa token malformado %s", async (token) => {
    const fetchMock = stubProwlarr([]);

    const response = await torrent(appRequest("/api/results/x/torrent"), tokenContext(token));

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("não define rota que aceite URL do cliente", async () => {
    stubProwlarr(searchRoutes([upstreamResult()]));
    const client = session();
    const token = await firstToken(client);
    const fetchMock = stubProwlarr([
      { match: /.*/, respond: () => new Response(bytes("d4:infoe")) },
    ]);

    await torrent(
      appRequest(`/api/results/${token}/torrent?url=https://evil.invalid/f.torrent`, client),
      tokenContext(token),
    );

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([downloadUrl(1)]);
  });
});
