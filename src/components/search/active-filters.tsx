"use client";

import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SearchFacets } from "@/lib/contracts";
import { formatBytes } from "@/lib/format";
import { CLEARED_FILTERS, CODEC_LABELS, QUALITY_LABELS, type SearchState } from "@/lib/search/params";

type ActiveFilter = {
  key: string;
  label: string;
  clear: Partial<SearchState>;
};

const AGE_LABELS: Record<number, string> = {
  1: "Últimas 24 horas",
  7: "Últimos 7 dias",
  30: "Últimos 30 dias",
  365: "Último ano",
};

function listFilters<T>(
  values: T[],
  key: string,
  labelOf: (value: T) => string,
  clearWith: (remaining: T[]) => Partial<SearchState>,
): ActiveFilter[] {
  return values.map((value) => ({
    key: `${key}-${String(value)}`,
    label: labelOf(value),
    clear: clearWith(values.filter((item) => item !== value)),
  }));
}

export function listActiveFilters(state: SearchState, facets: SearchFacets | undefined): ActiveFilter[] {
  const facetName = (options: { id: number; name: string }[] | undefined, id: number, fallback: string) =>
    options?.find((option) => option.id === id)?.name ?? `${fallback} ${id}`;

  const active = [
    ...listFilters(
      state.sources,
      "source",
      (id) => facetName(facets?.sources, id, "Fonte"),
      (sources) => ({ sources }),
    ),
    ...listFilters(
      state.categories,
      "category",
      (id) => facetName(facets?.categories, id, "Categoria"),
      (categories) => ({ categories }),
    ),
    ...listFilters(
      state.qualities,
      "quality",
      (quality) => QUALITY_LABELS[quality],
      (qualities) => ({ qualities }),
    ),
    ...listFilters(
      state.codecs,
      "codec",
      (codec) => CODEC_LABELS[codec],
      (codecs) => ({ codecs }),
    ),
  ];

  if (state.titleIncludes) {
    active.push({ key: "includes", label: `Contém “${state.titleIncludes}”`, clear: { titleIncludes: undefined } });
  }
  if (state.titleExcludes) {
    active.push({ key: "excludes", label: `Sem “${state.titleExcludes}”`, clear: { titleExcludes: undefined } });
  }
  if (state.maxAgeDays !== undefined) {
    active.push({ key: "age", label: AGE_LABELS[state.maxAgeDays], clear: { maxAgeDays: undefined } });
  }
  if (state.minSeeders !== undefined) {
    active.push({ key: "seeders", label: `${state.minSeeders}+ seeders`, clear: { minSeeders: undefined } });
  }
  if (state.minSize !== undefined) {
    active.push({ key: "min-size", label: `Mín. ${formatBytes(state.minSize)}`, clear: { minSize: undefined } });
  }
  if (state.maxSize !== undefined) {
    active.push({ key: "max-size", label: `Máx. ${formatBytes(state.maxSize)}`, clear: { maxSize: undefined } });
  }
  if (state.publishedAfter) {
    const date = new Date(state.publishedAfter).toLocaleDateString("pt-BR", { timeZone: "UTC" });
    active.push({ key: "published", label: `Desde ${date}`, clear: { publishedAfter: undefined } });
  }
  if (state.deduplicate) {
    active.push({ key: "deduplicate", label: "Sem duplicados", clear: { deduplicate: false } });
  }

  return active;
}

type ActiveFiltersProps = {
  filters: ActiveFilter[];
  onClear: (changes: Partial<SearchState>) => void;
};

export function ActiveFilters({ filters, onClear }: ActiveFiltersProps) {
  if (filters.length === 0) return null;

  return (
    <ul aria-label="Filtros ativos" className="flex flex-wrap items-center gap-1.5">
      {filters.map((filter) => (
        <li key={filter.key}>
          <Badge variant="secondary" className="h-6 gap-1 pr-1 pl-2 font-normal">
            {filter.label}
            <button
              type="button"
              aria-label={`Remover filtro ${filter.label}`}
              onClick={() => onClear(filter.clear)}
              className="rounded-sm p-0.5 outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3" aria-hidden />
            </button>
          </Badge>
        </li>
      ))}
      <li>
        <Button variant="ghost" size="xs" onClick={() => onClear(CLEARED_FILTERS)}>
          Limpar
        </Button>
      </li>
    </ul>
  );
}
