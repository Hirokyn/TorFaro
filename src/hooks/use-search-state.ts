"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { parseSearchState, type SearchState, serializeSearchState } from "@/lib/search/params";

function urlFor(state: SearchState) {
  const query = serializeSearchState(state).toString();
  return query ? `/?${query}` : "/";
}

// A URL é a fonte da verdade. history.pushState evita ida ao servidor e o App Router atualiza useSearchParams.
export function useSearchState() {
  const params = useSearchParams();
  const state = useMemo(() => parseSearchState(new URLSearchParams(params.toString())), [params]);

  const pushState = useCallback((next: SearchState) => {
    window.history.pushState(null, "", urlFor(next));
  }, []);

  const replaceState = useCallback((next: SearchState) => {
    window.history.replaceState(null, "", urlFor(next));
  }, []);

  return { state, pushState, replaceState };
}
