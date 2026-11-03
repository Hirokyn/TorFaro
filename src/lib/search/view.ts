import "server-only";

import type { Facet, Pagination, ResultSource, SearchFacets } from "@/lib/contracts";
import type { NormalizedResult } from "@/lib/prowlarr/normalize";
import {
  categoryFamily,
  categoryLabel,
  type Codec,
  CODEC_LABELS,
  CODECS,
  QUALITIES,
  type Quality,
  QUALITY_LABELS,
  type SearchRequest,
  type SortField,
  type SortOrder,
} from "@/lib/search/params";

export type ViewResult = NormalizedResult & {
  sources: ResultSource[];
};

type ResultFilters = Pick<
  SearchRequest,
  | "categories"
  | "sources"
  | "qualities"
  | "codecs"
  | "titleIncludes"
  | "titleExcludes"
  | "maxAgeDays"
  | "minSeeders"
  | "minSize"
  | "maxSize"
  | "publishedAfter"
>;

const DAY_MS = 86_400_000;

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

function toSource(result: NormalizedResult): ResultSource {
  return { indexerId: result.indexerId, indexerName: result.indexerName, seeders: result.seeders };
}

export function withOwnSource(result: NormalizedResult): ViewResult {
  return { ...result, sources: [toSource(result)] };
}

function metadataScore(result: NormalizedResult) {
  return [result.size, result.publishedAt, result.infoUrl, result.magnetUrl ?? result.actionUrl].filter(
    (value) => value !== null,
  ).length;
}

function isBetterPrimary(candidate: NormalizedResult, current: NormalizedResult) {
  const seederDiff = (candidate.seeders ?? -1) - (current.seeders ?? -1);
  return seederDiff !== 0 ? seederDiff > 0 : metadataScore(candidate) > metadataScore(current);
}

// Só agrupa por infoHash válido e igual. Seeders nunca são somados entre indexadores.
export function deduplicateResults(results: NormalizedResult[]): ViewResult[] {
  const groups = new Map<string, NormalizedResult[]>();
  const output: (ViewResult | string)[] = [];

  for (const result of results) {
    if (!result.infoHash) {
      output.push(withOwnSource(result));
      continue;
    }

    const group = groups.get(result.infoHash);
    if (group) {
      group.push(result);
    } else {
      groups.set(result.infoHash, [result]);
      output.push(result.infoHash);
    }
  }

  return output.map((entry) => {
    if (typeof entry !== "string") return entry;

    const group = groups.get(entry) ?? [];
    const primary = group.reduce((best, candidate) => (isBetterPrimary(candidate, best) ? candidate : best));
    const alternatives = group.filter((result) => result !== primary);

    return { ...primary, sources: [primary, ...alternatives].map(toSource) };
  });
}

function foldText(text: string) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function words(text: string | undefined) {
  return text ? foldText(text).split(/\s+/).filter(Boolean) : [];
}

export function filterResults(results: ViewResult[], filters: ResultFilters, now = Date.now()): ViewResult[] {
  const families = new Set(filters.categories.map(categoryFamily));
  const sources = new Set(filters.sources);
  const qualities = new Set(filters.qualities);
  const codecs = new Set(filters.codecs);
  const required = words(filters.titleIncludes);
  const excluded = words(filters.titleExcludes);
  const publishedAfter = filters.publishedAfter ? Date.parse(filters.publishedAfter) : null;
  const minPublishedAt = filters.maxAgeDays !== undefined ? now - filters.maxAgeDays * DAY_MS : null;

  return results.filter((result) => {
    if (families.size > 0 && !result.categories.some(({ id }) => families.has(categoryFamily(id)))) return false;
    if (sources.size > 0 && !result.sources.some(({ indexerId }) => sources.has(indexerId))) return false;
    if (qualities.size > 0 && (!result.quality || !qualities.has(result.quality))) return false;
    if (codecs.size > 0 && (!result.codec || !codecs.has(result.codec))) return false;
    if (filters.minSeeders !== undefined && (result.seeders ?? -1) < filters.minSeeders) return false;
    if (filters.minSize !== undefined && (result.size === null || result.size < filters.minSize)) return false;
    if (filters.maxSize !== undefined && (result.size === null || result.size > filters.maxSize)) return false;

    if (publishedAfter !== null || minPublishedAt !== null) {
      const publishedAt = result.publishedAt ? Date.parse(result.publishedAt) : null;
      if (publishedAt === null) return false;
      if (publishedAfter !== null && publishedAt < publishedAfter) return false;
      if (minPublishedAt !== null && publishedAt < minPublishedAt) return false;
    }

    if (required.length > 0 || excluded.length > 0) {
      const title = foldText(result.title);
      if (!required.every((word) => title.includes(word))) return false;
      if (excluded.some((word) => title.includes(word))) return false;
    }

    return true;
  });
}

// Compara por dia: a hora exata varia entre indexadores e impediria o desempate por seeders.
function publishedDay(result: NormalizedResult) {
  return result.publishedAt ? Math.floor(Date.parse(result.publishedAt) / DAY_MS) : null;
}

function sortValue(result: NormalizedResult, field: SortField): number | string | null {
  switch (field) {
    case "seeders":
      return result.seeders;
    case "leechers":
      return result.leechers;
    case "size":
      return result.size;
    case "publishedAt":
      return publishedDay(result);
    case "title":
      return result.title;
    case "indexer":
      return result.indexerName;
  }
}

// Valores ausentes ficam no fim nas duas direções.
function compareValues(left: number | string | null, right: number | string | null, direction: 1 | -1) {
  if (left === null || right === null) {
    if (left === right) return 0;
    return left === null ? 1 : -1;
  }

  const difference =
    typeof left === "string" && typeof right === "string"
      ? collator.compare(left, right)
      : Number(left) - Number(right);

  return difference * direction;
}

// Depois do campo escolhido, valem sempre o mais recente e o com mais seeders. O id mantém a ordem estável entre páginas.
export function sortResults<T extends NormalizedResult>(results: T[], field: SortField, order: SortOrder): T[] {
  const direction = order === "asc" ? 1 : -1;

  return [...results].sort(
    (a, b) =>
      compareValues(sortValue(a, field), sortValue(b, field), direction) ||
      compareValues(publishedDay(a), publishedDay(b), -1) ||
      compareValues(a.seeders, b.seeders, -1) ||
      a.id.localeCompare(b.id),
  );
}

export function paginate<T>(results: T[], page: number, pageSize: number, upstreamCount: number) {
  const filteredCount = results.length;
  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;

  const pagination: Pagination = {
    page: currentPage,
    pageSize,
    upstreamCount,
    filteredCount,
    totalPages,
    hasMore: currentPage < totalPages,
  };

  return { items: results.slice(start, start + pageSize), pagination };
}

function buildFacet<Id extends number | string>(
  results: ViewResult[],
  optionsOf: (result: ViewResult) => [Id, string][],
): Facet<Id>[] {
  const facets = new Map<Id, Facet<Id>>();

  for (const result of results) {
    for (const [id, name] of new Map(optionsOf(result))) {
      const facet = facets.get(id);
      if (facet) facet.count += 1;
      else facets.set(id, { id, name, count: 1 });
    }
  }

  return [...facets.values()].sort((a, b) => b.count - a.count || String(a.id).localeCompare(String(b.id)));
}

function inDeclaredOrder<Id extends string>(facets: Facet<Id>[], order: readonly Id[]) {
  return [...facets].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

// Cada faceta ignora o próprio filtro para que as demais opções do grupo continuem selecionáveis.
export function buildSearchFacets(results: ViewResult[], filters: ResultFilters, now = Date.now()): SearchFacets {
  const without = (changes: Partial<ResultFilters>) => filterResults(results, { ...filters, ...changes }, now);

  return {
    categories: buildFacet(without({ categories: [] }), (result) =>
      result.categories.map(({ id, name }): [number, string] => [categoryFamily(id), categoryLabel(id, name)]),
    ),
    sources: buildFacet(without({ sources: [] }), (result) =>
      result.sources.map(({ indexerId, indexerName }): [number, string] => [indexerId, indexerName]),
    ),
    qualities: inDeclaredOrder(
      buildFacet<Quality>(without({ qualities: [] }), ({ quality }) =>
        quality ? [[quality, QUALITY_LABELS[quality]]] : [],
      ),
      QUALITIES,
    ),
    codecs: inDeclaredOrder(
      buildFacet<Codec>(without({ codecs: [] }), ({ codec }) => (codec ? [[codec, CODEC_LABELS[codec]]] : [])),
      CODECS,
    ),
  };
}
