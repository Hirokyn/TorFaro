"use client";

import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";

import { getJson } from "@/lib/client/api";
import type { SearchResponse } from "@/lib/contracts";
import { type SearchState, serializeSearchState, shouldSearch, upstreamSearchKey } from "@/lib/search/params";

const RESULTS_STALE_MS = 120_000;

// `runId` muda a cada submissão explícita. Dentro de uma mesma execução, ordenar, filtrar ou paginar
// usa `cachedOnly`, e o servidor recusa com 409 em vez de repetir a busca nos indexadores.
export function useSearchResults(state: SearchState, runId: number) {
  const completedRun = useRef<string | null>(null);
  const viewKey = serializeSearchState(state).toString();
  const runKey = `${runId}:${upstreamSearchKey(state)}`;

  return useQuery<SearchResponse, Error, SearchResponse, string[]>({
    queryKey: ["search", runKey, viewKey],
    enabled: shouldSearch(state),
    staleTime: RESULTS_STALE_MS,
    gcTime: RESULTS_STALE_MS,
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === runKey ? previous : undefined),
    queryFn: async ({ signal }) => {
      const params = serializeSearchState(state);
      if (completedRun.current === runKey) params.set("cachedOnly", "true");

      const response = await getJson<SearchResponse>(`/api/search?${params}`, { signal });
      completedRun.current = runKey;
      return response;
    },
  });
}
