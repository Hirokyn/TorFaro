"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ActiveFilters, listActiveFilters } from "@/components/search/active-filters";
import { AppHeader } from "@/components/search/app-header";
import { FilterBar } from "@/components/search/filter-bar";
import { ResultTabs } from "@/components/search/result-tabs";
import { ResultsList } from "@/components/search/results-list";
import { ResultsPagination, ResultsSummary } from "@/components/search/results-pagination";
import { ResultsTable } from "@/components/search/results-table";
import { SearchForm } from "@/components/search/search-form";
import {
  EmptyResults,
  IdlePrompt,
  PartialNotice,
  ResultsSkeleton,
  SearchError,
} from "@/components/search/search-states";
import { usePreferences } from "@/hooks/use-preferences";
import { useSearchResults } from "@/hooks/use-search-results";
import { useSearchState } from "@/hooks/use-search-state";
import { ClientApiError, getJson } from "@/lib/client/api";
import type { IndexersResponse } from "@/lib/contracts";
import {
  CLEARED_FILTERS,
  type PageSize,
  type SearchState,
  shouldSearch,
  type SortField,
  type SortOrder,
} from "@/lib/search/params";
import { cn } from "@/lib/utils";

const TEXT_SORT_FIELDS: SortField[] = ["title", "indexer"];

export function SearchPage() {
  const { state, pushState, replaceState } = useSearchState();
  const { preferences, updatePreferences } = usePreferences();
  const [runId, setRunId] = useState(0);

  const indexersQuery = useQuery({
    queryKey: ["indexers"],
    queryFn: ({ signal }) => getJson<IndexersResponse>("/api/indexers", { signal }),
    staleTime: 60_000,
  });

  const idle = !shouldSearch(state);
  const search = useSearchResults(state, runId);
  const data = idle ? undefined : search.data;
  const activeFilters = listActiveFilters(state, data?.facets);
  const error = search.error;
  const expired = error instanceof ClientApiError && error.code === "search_expired";

  function submitSearch(q: string, indexerIds: number[]) {
    setRunId((current) => current + 1);
    pushState({
      ...state,
      q,
      browse: q === "",
      indexerIds,
      page: 1,
      pageSize: state.q ? state.pageSize : preferences.pageSize,
      deduplicate: state.q ? state.deduplicate : preferences.deduplicate,
    });
  }

  function changeView(changes: Partial<SearchState>) {
    if ("deduplicate" in changes) updatePreferences({ deduplicate: changes.deduplicate });
    replaceState({ ...state, ...changes, page: 1 });
  }

  function changeSort(sort: SortField, order: SortOrder) {
    replaceState({ ...state, sort, order, page: 1 });
  }

  // Sem termo, a guia é o pedido explícito que dispara a lista; depois disso ela só reordena o cache.
  function selectTab(sort: SortField) {
    pushState({ ...state, sort, order: "desc", page: 1, browse: state.q === "" });
  }

  function toggleSort(field: SortField) {
    if (field === state.sort) {
      changeSort(field, state.order === "asc" ? "desc" : "asc");
    } else {
      changeSort(field, TEXT_SORT_FIELDS.includes(field) ? "asc" : "desc");
    }
  }

  function changePage(page: number) {
    pushState({ ...state, page });
    window.scrollTo({ top: 0 });
  }

  function changePageSize(pageSize: PageSize) {
    updatePreferences({ pageSize });
    replaceState({ ...state, pageSize, page: 1 });
  }

  const showResults = data !== undefined && data.results.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-1 flex-col gap-2.5 px-4 pb-4">
      <AppHeader />

      <main className="flex flex-col gap-2.5">
        <SearchForm
          query={state.q}
          indexerIds={state.indexerIds}
          indexers={indexersQuery.data?.indexers ?? []}
          searching={search.isFetching}
          onSubmit={submitSearch}
        />

        {indexersQuery.isError && (
          <p role="status" className="text-sm text-muted-foreground">
            Não foi possível listar os indexadores. A busca continua usando todos os habilitados.
          </p>
        )}

        <div className="flex items-center justify-between gap-3 border-b">
          <ResultTabs sort={state.sort} order={state.order} idle={idle} onSelect={selectTab} />
          <ResultsSummary pagination={data?.pagination} />
        </div>

        <FilterBar state={state} facets={data?.facets} onChange={changeView} onSortChange={changeSort} />

        <ActiveFilters filters={activeFilters} onClear={changeView} />

        <section aria-label="Resultados" className="flex min-w-0 flex-col gap-2">
          {data?.partial.isPartial && <PartialNotice indexers={data.partial.unavailableIndexers} />}

          {idle && <IdlePrompt />}

          {search.isLoading && <ResultsSkeleton />}

          {!idle && error && (
            <SearchError
              message={expired ? "Os resultados expiraram." : error.message}
              onRetry={() => setRunId((current) => current + 1)}
            />
          )}

          {!error && data && data.results.length === 0 && (
            <EmptyResults
              query={data.query}
              hasFilters={activeFilters.length > 0}
              onClearFilters={() => changeView(CLEARED_FILTERS)}
            />
          )}

          {!error && showResults && (
            <div className={cn("flex flex-col gap-1 transition-opacity", search.isPlaceholderData && "opacity-60")}>
              <div className="hidden md:block">
                <ResultsTable results={data.results} sort={state.sort} order={state.order} onSort={toggleSort} />
              </div>
              <div className="md:hidden">
                <ResultsList results={data.results} />
              </div>
              <ResultsPagination
                pagination={data.pagination}
                onPageChange={changePage}
                onPageSizeChange={changePageSize}
              />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
