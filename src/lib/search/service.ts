import "server-only";

import { issueActionToken } from "@/lib/actions/tokens";
import { ApiError } from "@/lib/api/http";
import { getConfig } from "@/lib/config";
import type { IndexerDto, SearchResponse, SearchResultDto, UnavailableIndexer } from "@/lib/contracts";
import {
  getIndexers,
  getIndexerStatuses,
  ProwlarrError,
  searchReleases,
  SOURCE_TIMEOUT_MS,
} from "@/lib/prowlarr/client";
import type { UpstreamSearchResult } from "@/lib/prowlarr/types";
import {
  discardPlaceholderDates,
  normalizeIndexers,
  normalizeResult,
  type NormalizedResult,
} from "@/lib/prowlarr/normalize";
import { enforceRateLimit } from "@/lib/rate-limit";
import { type SearchRequest, upstreamSearchKey } from "@/lib/search/params";
import {
  buildSearchFacets,
  deduplicateResults,
  filterResults,
  paginate,
  sortResults,
  type ViewResult,
  withOwnSource,
} from "@/lib/search/view";
import { getServerState } from "@/lib/server-state";

export const SEARCH_CACHE_TTL_MS = 180_000;

const MAX_CACHED_SEARCHES = 50;
const VIEW_REQUESTS_PER_MINUTE = 240;
const UPSTREAM_SEARCHES_PER_MINUTE = 15;

export type CachedSearch = {
  results: NormalizedResult[];
  tokens: Map<string, string>;
  unavailableIndexers: UnavailableIndexer[];
  searchedAt: string;
  expiresAt: number;
};

export type ActiveSearch = {
  controller: AbortController;
  promise: Promise<CachedSearch>;
  waiters: number;
};

function readCache(key: string, now: number) {
  const { searches } = getServerState();
  const entry = searches.get(key);
  if (entry && entry.expiresAt > now) return entry;
  searches.delete(key);
  return null;
}

function writeCache(key: string, entry: CachedSearch, now: number) {
  const { searches } = getServerState();

  for (const [cachedKey, cached] of searches) {
    if (cached.expiresAt <= now) searches.delete(cachedKey);
  }
  for (const cachedKey of searches.keys()) {
    if (searches.size < MAX_CACHED_SEARCHES) break;
    searches.delete(cachedKey);
  }

  searches.set(key, entry);
}

// O estado é lido depois da busca, quando as falhas dela já foram registradas.
async function findUnavailableIndexers(
  requestedIds: number[],
  failedIds: number[],
  now: number,
): Promise<UnavailableIndexer[]> {
  try {
    const [indexers, statuses] = await Promise.all([getIndexers(), getIndexerStatuses()]);
    const requested = new Set(requestedIds);
    const failed = new Set(failedIds);
    const isRequested = (indexer: IndexerDto) => requested.size === 0 || requested.has(indexer.id);

    return normalizeIndexers(indexers, statuses, now)
      .filter((indexer) => isRequested(indexer) && (!indexer.available || failed.has(indexer.id)))
      .map(({ id, name, disabledUntil }) => ({ id, name, disabledUntil }));
  } catch {
    // Sem esse dado a busca continua válida; apenas não há aviso de resposta parcial.
    return [];
  }
}

async function enabledIndexerIds(signal: AbortSignal) {
  try {
    return normalizeIndexers(await getIndexers(signal), []).map(({ id }) => id);
  } catch (error) {
    if (signal.aborted) throw error;
    return [];
  }
}

type SourcesResult = {
  items: UpstreamSearchResult[];
  failedIds: number[];
};

// Cada fonte tem limite próprio: uma lenta entra no aviso de resposta parcial em vez de derrubar a busca inteira.
async function searchSources(request: SearchRequest, signal: AbortSignal): Promise<SourcesResult> {
  const ids = request.indexerIds.length > 0 ? request.indexerIds : await enabledIndexerIds(signal);

  if (ids.length === 0) {
    return { items: await searchReleases(request.q, [], signal), failedIds: [] };
  }

  const settled = await Promise.allSettled(
    ids.map((id) => searchReleases(request.q, [id], signal, SOURCE_TIMEOUT_MS)),
  );

  if (signal.aborted) throw new ProwlarrError("aborted");

  const firstFailure = settled.find((outcome) => outcome.status === "rejected");
  if (firstFailure && settled.every((outcome) => outcome.status === "rejected")) throw firstFailure.reason;

  return {
    items: settled.flatMap((outcome) => (outcome.status === "fulfilled" ? outcome.value : [])),
    failedIds: ids.filter((_, index) => settled[index].status === "rejected"),
  };
}

async function runUpstreamSearch(
  clientId: string,
  key: string,
  request: SearchRequest,
  signal: AbortSignal,
): Promise<CachedSearch> {
  const { PROWLARR_URL } = getConfig();
  const { items, failedIds } = await searchSources(request, signal);
  const now = Date.now();

  const normalized = items.flatMap((item) => {
    const result = normalizeResult(item, PROWLARR_URL);
    return result ? [result] : [];
  });
  const results = discardPlaceholderDates(normalized, now);

  const tokens = new Map<string, string>();
  for (const result of results) {
    tokens.set(result.id, issueActionToken({ clientId, queryKey: key, result }));
  }

  const entry: CachedSearch = {
    results,
    tokens,
    unavailableIndexers: await findUnavailableIndexers(request.indexerIds, failedIds, now),
    searchedAt: new Date(now).toISOString(),
    expiresAt: now + SEARCH_CACHE_TTL_MS,
  };

  writeCache(key, entry, now);
  return entry;
}

function toSearchApiError(error: unknown) {
  if (error instanceof ApiError) return error;

  if (error instanceof ProwlarrError) {
    switch (error.kind) {
      case "aborted":
        return new ApiError(499, "search_cancelled", "Busca cancelada.");
      case "timeout":
        return new ApiError(504, "search_timeout", "Os indexadores demoraram demais para responder.");
      default:
        return new ApiError(502, "search_unavailable", "Não foi possível consultar o Prowlarr agora.");
    }
  }

  return error;
}

// Pedido igual aguarda a busca em andamento. Sem login, o cliente é o IP: abas do mesmo aparelho não podem cancelar
// umas às outras, e cada navegador já desiste sozinho da própria busca antiga.
async function joinUpstreamSearch(clientId: string, key: string, request: SearchRequest, signal: AbortSignal) {
  const { activeSearches } = getServerState();
  let active = activeSearches.get(key);

  if (!active) {
    enforceRateLimit(`upstream:${clientId}`, UPSTREAM_SEARCHES_PER_MINUTE, 60_000);

    const controller = new AbortController();
    const started: ActiveSearch = {
      controller,
      waiters: 0,
      promise: runUpstreamSearch(clientId, key, request, controller.signal).finally(() => {
        activeSearches.delete(key);
      }),
    };

    activeSearches.set(key, started);
    active = started;
  }

  const current = active;
  current.waiters += 1;

  // Cancela o upstream somente quando nenhum pedido ainda espera por ele.
  const onAbort = () => {
    current.waiters -= 1;
    if (current.waiters === 0) current.controller.abort();
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    return await current.promise;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

export function toPublicResult(result: ViewResult, token: string | null): SearchResultDto {
  return {
    id: result.id,
    title: result.title,
    indexerId: result.indexerId,
    indexerName: result.indexerName,
    size: result.size,
    seeders: result.seeders,
    leechers: result.leechers,
    publishedAt: result.publishedAt,
    categories: result.categories,
    quality: result.quality,
    codec: result.codec,
    grabs: result.grabs,
    files: result.files,
    imdbId: result.imdbId,
    infoHash: result.infoHash,
    magnetUrl: result.magnetUrl,
    infoUrl: result.infoUrl,
    torrentActionToken: token,
    sources: result.sources,
  };
}

function buildResponse(request: SearchRequest, entry: CachedSearch, servedFromCache: boolean): SearchResponse {
  const base = request.deduplicate ? deduplicateResults(entry.results) : entry.results.map(withOwnSource);
  const filtered = filterResults(base, request);
  const sorted = sortResults(filtered, request.sort, request.order);
  const { items, pagination } = paginate(sorted, request.page, request.pageSize, entry.results.length);

  return {
    query: request.q,
    results: items.map((result) => toPublicResult(result, entry.tokens.get(result.id) ?? null)),
    pagination,
    partial: {
      isPartial: entry.unavailableIndexers.length > 0,
      unavailableIndexers: entry.unavailableIndexers,
    },
    facets: buildSearchFacets(base, request),
    searchedAt: entry.searchedAt,
    servedFromCache,
  };
}

export async function getSearchResponse(
  clientId: string,
  request: SearchRequest,
  signal: AbortSignal,
): Promise<SearchResponse> {
  enforceRateLimit(`view:${clientId}`, VIEW_REQUESTS_PER_MINUTE, 60_000);

  const key = `${clientId}|${upstreamSearchKey(request)}`;
  const cached = readCache(key, Date.now());
  if (cached) return buildResponse(request, cached, true);

  if (request.cachedOnly) {
    throw new ApiError(409, "search_expired", "Os resultados expiraram. Faça a busca novamente.");
  }

  try {
    const entry = await joinUpstreamSearch(clientId, key, request, signal);
    return buildResponse(request, entry, false);
  } catch (error) {
    throw toSearchApiError(error);
  }
}
