import { NextRequest } from "next/server";
import { vi } from "vitest";

export const PROWLARR_URL = "http://prowlarr.internal:9696";
export const API_KEY = "test-key-0123456789abcdef";

let nextAddress = 0;

export function stubAppEnv() {
  vi.stubEnv("PROWLARR_URL", PROWLARR_URL);
  vi.stubEnv("PROWLARR_API_KEY", API_KEY);
}

// Sem login, cada aparelho é identificado pelo IP.
export function clientAddress() {
  nextAddress += 1;
  return `10.0.0.${nextAddress}`;
}

export function appRequest(path: string, client = clientAddress()) {
  return new NextRequest(`https://search.example.test${path}`, {
    headers: { "x-forwarded-for": `${client}, 172.18.0.2` },
  });
}

export function downloadUrl(indexerId: number, link = "abc") {
  return `${PROWLARR_URL}/${indexerId}/download?apikey=${API_KEY}&link=${link}&file=x`;
}

export function upstreamResult(overrides: Record<string, unknown> = {}) {
  return {
    guid: "https://1337x.to/torrent/1/ubuntu/",
    title: "Ubuntu   24.04",
    indexerId: 1,
    indexer: "1337x",
    size: 1_814_623_682,
    seeders: 9,
    leechers: 10,
    publishDate: "2026-01-10T03:00:00Z",
    categories: [
      { id: 4000, name: "PC", subCategories: [{ id: 4010, name: "PC/0day" }] },
      { id: 100034, subCategories: [] },
    ],
    downloadUrl: downloadUrl(1),
    infoUrl: "https://1337x.to/torrent/1/ubuntu/",
    protocol: "torrent",
    ...overrides,
  };
}

type Route = { match: RegExp; respond: (url: URL) => Response | Promise<Response> };

export function stubProwlarr(routes: Route[]) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const route = routes.find(({ match }) => match.test(url.pathname));
    return route ? route.respond(url) : new Response("not found", { status: 404 });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

type UpstreamItem = { indexerId?: number; indexer?: string };

// A aplicação consulta uma fonte por vez; a rota responde só com os itens da fonte pedida.
export function searchRoutes(results: unknown[], options: { statuses?: unknown[] } = {}): Route[] {
  const items = results as UpstreamItem[];
  const sources = new Map([[1, "1337x"], [8, "Internet Archive"]]);
  for (const { indexerId, indexer } of items) {
    if (indexerId !== undefined) sources.set(indexerId, indexer ?? `Indexador ${indexerId}`);
  }

  return [
    {
      match: /^\/api\/v1\/search$/,
      respond: (url) => {
        const ids = url.searchParams.getAll("indexerIds").map(Number);
        return Response.json(ids.includes(-2) ? items : items.filter(({ indexerId }) => ids.includes(indexerId ?? 0)));
      },
    },
    {
      match: /^\/api\/v1\/indexer$/,
      respond: () =>
        Response.json(
          [...sources].map(([id, name]) => ({
            id,
            name,
            enable: true,
            protocol: "torrent",
            capabilities: { categories: [] },
          })),
        ),
    },
    { match: /^\/api\/v1\/indexerstatus$/, respond: () => Response.json(options.statuses ?? []) },
  ];
}

export function requestsTo(fetchMock: ReturnType<typeof stubProwlarr>, path: string) {
  return fetchMock.mock.calls.filter(([input]) => new URL(String(input)).pathname === path);
}
