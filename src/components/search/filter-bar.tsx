"use client";

import { CommitInput } from "@/components/search/commit-input";
import { FilterMenu, FilterOption } from "@/components/search/filter-menu";
import { IndexerIcon } from "@/components/search/indexer-icon";
import { MobileSort } from "@/components/search/mobile-sort";
import type { Facet, SearchFacets } from "@/lib/contracts";
import { BYTES_PER_GB } from "@/lib/format";
import type { MaxAgeDays, SearchState, SortField, SortOrder } from "@/lib/search/params";

type FilterBarProps = {
  state: SearchState;
  facets: SearchFacets | undefined;
  onChange: (changes: Partial<SearchState>) => void;
  onSortChange: (sort: SortField, order: SortOrder) => void;
};

type Filters = Pick<FilterBarProps, "state" | "onChange">;

const AGE_OPTIONS: { days: MaxAgeDays; label: string }[] = [
  { days: 1, label: "24 horas" },
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 365, label: "1 ano" },
];

const SIZE_OPTIONS: { label: string; minGb?: number; maxGb?: number }[] = [
  { label: "Até 1 GB", maxGb: 1 },
  { label: "1–5 GB", minGb: 1, maxGb: 5 },
  { label: "5–15 GB", minGb: 5, maxGb: 15 },
  { label: "Acima de 15 GB", minGb: 15 },
];

function gbToBytes(value: number | undefined) {
  return value === undefined ? undefined : value * BYTES_PER_GB;
}

function toGbText(bytes: number | undefined) {
  return bytes === undefined ? "" : String(Math.round((bytes / BYTES_PER_GB) * 100) / 100);
}

function parseNonNegative(value: string) {
  const parsed = Number(value.replace(",", "."));
  return value.trim() === "" || !Number.isFinite(parsed) || parsed < 0 ? undefined : parsed;
}

function parseGb(value: string) {
  const parsed = parseNonNegative(value);
  return parsed === undefined ? undefined : Math.round(parsed * BYTES_PER_GB);
}

function parseCount(value: string) {
  const parsed = parseNonNegative(value);
  return parsed === undefined ? undefined : Math.floor(parsed);
}

function toggled<T>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function FacetMenu<Id extends number | string>({
  label,
  group,
  options,
  selected,
  renderIcon,
  onChange,
}: {
  label: string;
  group: string;
  options: Facet<Id>[] | undefined;
  selected: Id[];
  renderIcon?: (option: Facet<Id>) => React.ReactNode;
  onChange: (selected: Id[]) => void;
}) {
  return (
    <FilterMenu label={label} activeCount={selected.length} disabled={!options?.length}>
      {options?.map((option) => (
        <FilterOption
          key={option.id}
          id={`filter-${group}-${option.id}`}
          checked={selected.includes(option.id)}
          count={option.count}
          onChange={() => onChange(toggled(selected, option.id))}
        >
          {renderIcon?.(option)}
          <span className="truncate">{option.name}</span>
        </FilterOption>
      ))}
    </FilterMenu>
  );
}

function PeriodMenu({ state, onChange }: Filters) {
  return (
    <FilterMenu label="Período" activeCount={state.maxAgeDays === undefined ? 0 : 1} contentClassName="w-44">
      {AGE_OPTIONS.map(({ days, label }) => (
        <FilterOption
          key={days}
          id={`filter-age-${days}`}
          checked={state.maxAgeDays === days}
          onChange={(checked) => onChange({ maxAgeDays: checked ? days : undefined })}
        >
          {label}
        </FilterOption>
      ))}
    </FilterMenu>
  );
}

function SizeMenu({ state, onChange }: Filters) {
  const activeCount = state.minSize === undefined && state.maxSize === undefined ? 0 : 1;

  return (
    <FilterMenu label="Tamanho" activeCount={activeCount} contentClassName="w-56">
      {SIZE_OPTIONS.map(({ label, minGb, maxGb }) => {
        const minSize = gbToBytes(minGb);
        const maxSize = gbToBytes(maxGb);

        return (
          <FilterOption
            key={label}
            id={`filter-size-${label}`}
            checked={state.minSize === minSize && state.maxSize === maxSize}
            onChange={(checked) =>
              onChange(checked ? { minSize, maxSize } : { minSize: undefined, maxSize: undefined })
            }
          >
            {label}
          </FilterOption>
        );
      })}
      <div className="mt-1 grid grid-cols-2 gap-2 border-t p-1.5 pt-2">
        <CommitInput
          id="filter-min-size"
          label="Mín. (GB)"
          inputMode="decimal"
          value={toGbText(state.minSize)}
          onCommit={(value) => onChange({ minSize: parseGb(value) })}
        />
        <CommitInput
          id="filter-max-size"
          label="Máx. (GB)"
          inputMode="decimal"
          value={toGbText(state.maxSize)}
          onCommit={(value) => onChange({ maxSize: parseGb(value) })}
        />
      </div>
    </FilterMenu>
  );
}

function MoreMenu({ state, onChange }: Filters) {
  const activeCount = [
    state.titleIncludes,
    state.titleExcludes,
    state.minSeeders,
    state.publishedAfter,
    state.deduplicate || undefined,
  ].filter((value) => value !== undefined).length;

  return (
    <FilterMenu label="Mais filtros" activeCount={activeCount} contentClassName="w-64">
      <FilterOption
        id="filter-with-seeders"
        checked={(state.minSeeders ?? 0) >= 1}
        onChange={(checked) => onChange({ minSeeders: checked ? 1 : undefined })}
      >
        Só com seeders
      </FilterOption>
      <FilterOption
        id="filter-deduplicate"
        checked={state.deduplicate}
        onChange={(deduplicate) => onChange({ deduplicate })}
      >
        Agrupar duplicados
      </FilterOption>
      <div className="mt-1 flex flex-col gap-2 border-t p-1.5 pt-2">
        <CommitInput
          id="filter-title-includes"
          label="Título contém"
          value={state.titleIncludes ?? ""}
          onCommit={(value) => onChange({ titleIncludes: value.trim() || undefined })}
        />
        <CommitInput
          id="filter-title-excludes"
          label="Título não contém"
          value={state.titleExcludes ?? ""}
          onCommit={(value) => onChange({ titleExcludes: value.trim() || undefined })}
        />
        <CommitInput
          id="filter-min-seeders"
          label="Seeders mínimos"
          inputMode="numeric"
          value={state.minSeeders === undefined ? "" : String(state.minSeeders)}
          onCommit={(value) => onChange({ minSeeders: parseCount(value) })}
        />
        <CommitInput
          id="filter-published-after"
          label="Publicado a partir de"
          type="date"
          value={state.publishedAfter?.slice(0, 10) ?? ""}
          onCommit={(value) => onChange({ publishedAfter: value || undefined })}
        />
      </div>
    </FilterMenu>
  );
}

export function FilterBar({ state, facets, onChange, onSortChange }: FilterBarProps) {
  return (
    <div
      role="group"
      aria-label="Filtros"
      className="flex items-center gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none] md:flex-wrap md:overflow-visible [&>*]:shrink-0"
    >
      <FacetMenu
        label="Fontes"
        group="source"
        options={facets?.sources}
        selected={state.sources}
        renderIcon={(source) => <IndexerIcon id={source.id} name={source.name} className="size-5 text-[8px]" />}
        onChange={(sources) => onChange({ sources })}
      />
      <FacetMenu
        label="Categoria"
        group="category"
        options={facets?.categories}
        selected={state.categories}
        onChange={(categories) => onChange({ categories })}
      />
      <FacetMenu
        label="Resolução"
        group="quality"
        options={facets?.qualities}
        selected={state.qualities}
        onChange={(qualities) => onChange({ qualities })}
      />
      <FacetMenu
        label="Codec"
        group="codec"
        options={facets?.codecs}
        selected={state.codecs}
        onChange={(codecs) => onChange({ codecs })}
      />
      <PeriodMenu state={state} onChange={onChange} />
      <SizeMenu state={state} onChange={onChange} />
      <MoreMenu state={state} onChange={onChange} />
      <MobileSort sort={state.sort} order={state.order} onChange={onSortChange} />
    </div>
  );
}
