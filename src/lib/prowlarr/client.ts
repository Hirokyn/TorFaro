import "server-only";

import { z } from "zod";

import { getConfig } from "@/lib/config";
import {
  indexerSchema,
  indexerStatusSchema,
  searchResultSchema,
  systemStatusSchema,
  type UpstreamSearchResult,
} from "@/lib/prowlarr/types";

const METADATA_TIMEOUT_MS = 8_000;
export const SEARCH_TIMEOUT_MS = 45_000;
export const SOURCE_TIMEOUT_MS = 30_000;

// Valor aceito pelo Prowlarr para "todos os indexadores torrent habilitados".
const ALL_TORRENT_INDEXERS = -2;

export type ProwlarrErrorKind = "timeout" | "aborted" | "unreachable" | "http" | "invalid";

// A mensagem é fixa de propósito: erros de fetch carregam a URL de destino.
export class ProwlarrError extends Error {
  constructor(
    readonly kind: ProwlarrErrorKind,
    readonly status?: number,
  ) {
    super(`prowlarr_${kind}`);
    this.name = "ProwlarrError";
  }
}

// Combina timeout próprio com o sinal do chamador e distingue os dois motivos de aborto.
export async function withTimeout<T>(
  timeoutMs: number,
  parent: AbortSignal | undefined,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const signal = parent ? AbortSignal.any([timeout.signal, parent]) : timeout.signal;

  try {
    return await run(signal);
  } catch (error) {
    if (error instanceof ProwlarrError) throw error;
    if (timeout.signal.aborted) throw new ProwlarrError("timeout");
    if (parent?.aborted) throw new ProwlarrError("aborted");
    throw new ProwlarrError("unreachable");
  } finally {
    clearTimeout(timer);
  }
}

async function requestJson(
  path: string,
  options: { params?: URLSearchParams; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<unknown> {
  const { PROWLARR_URL, PROWLARR_API_KEY } = getConfig();
  const url = new URL(path, PROWLARR_URL);
  if (options.params) url.search = options.params.toString();

  return withTimeout(options.timeoutMs ?? METADATA_TIMEOUT_MS, options.signal, async (signal) => {
    const response = await fetch(url, {
      headers: { "X-Api-Key": PROWLARR_API_KEY, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal,
    });

    if (!response.ok) throw new ProwlarrError("http", response.status);

    return response.json();
  });
}

function parseResponse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ProwlarrError("invalid");
  return parsed.data;
}

export async function getSystemStatus(signal?: AbortSignal) {
  return parseResponse(systemStatusSchema, await requestJson("/api/v1/system/status", { signal, timeoutMs: 5_000 }));
}

export async function getIndexers(signal?: AbortSignal) {
  return parseResponse(z.array(indexerSchema), await requestJson("/api/v1/indexer", { signal }));
}

export async function getIndexerStatuses(signal?: AbortSignal) {
  return parseResponse(z.array(indexerStatusSchema), await requestJson("/api/v1/indexerstatus", { signal }));
}

// `limit` e `offset` são enviados como validado no ambiente, mas o agregador os ignora e devolve tudo.
export function buildSearchParams(query: string, indexerIds: number[]) {
  const params = new URLSearchParams({ query, type: "search", limit: "100", offset: "0" });
  const ids = indexerIds.length > 0 ? indexerIds : [ALL_TORRENT_INDEXERS];
  for (const id of ids) params.append("indexerIds", String(id));
  return params;
}

export async function searchReleases(
  query: string,
  indexerIds: number[],
  signal?: AbortSignal,
  timeoutMs = SEARCH_TIMEOUT_MS,
): Promise<UpstreamSearchResult[]> {
  const payload = await requestJson("/api/v1/search", {
    params: buildSearchParams(query, indexerIds),
    timeoutMs,
    signal,
  });

  if (!Array.isArray(payload)) throw new ProwlarrError("invalid");

  // Um item malformado de um indexador não invalida o restante da busca.
  return payload.flatMap((item) => {
    const parsed = searchResultSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}
