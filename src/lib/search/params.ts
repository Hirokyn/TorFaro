import { z } from "zod";

// Módulo compartilhado: usado na validação dos Route Handlers e na leitura da URL no cliente.

export const SORT_FIELDS = ["seeders", "leechers", "size", "publishedAt", "title", "indexer"] as const;
export const SORT_ORDERS = ["asc", "desc"] as const;
export const PAGE_SIZES = [25, 50, 100] as const;
export const QUALITIES = ["2160p", "1080p", "720p", "sd"] as const;
export const CODECS = ["h265", "h264", "av1"] as const;
export const MAX_AGE_DAYS = [1, 7, 30, 365] as const;

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 200;
const MAX_TITLE_FILTER_LENGTH = 100;

export type SortField = (typeof SORT_FIELDS)[number];
export type SortOrder = (typeof SORT_ORDERS)[number];
export type PageSize = (typeof PAGE_SIZES)[number];
export type Quality = (typeof QUALITIES)[number];
export type Codec = (typeof CODECS)[number];
export type MaxAgeDays = (typeof MAX_AGE_DAYS)[number];

export const QUALITY_LABELS: Record<Quality, string> = { "2160p": "4K", "1080p": "1080p", "720p": "720p", sd: "SD" };
export const CODEC_LABELS: Record<Codec, string> = { h265: "H.265", h264: "H.264", av1: "AV1" };

const CATEGORY_LABELS: Record<number, string> = {
  1000: "Console",
  2000: "Filmes",
  3000: "Áudio",
  4000: "PC",
  5000: "TV",
  6000: "XXX",
  7000: "Livros",
  8000: "Outros",
};

// IDs padronizados são hierárquicos: 5070 (TV/Anime) pertence à família 5000 (TV).
export function categoryFamily(id: number) {
  return Math.floor(id / 1000) * 1000;
}

export function categoryLabel(id: number, name: string) {
  return CATEGORY_LABELS[categoryFamily(id)] ?? name.split("/")[0];
}

const csvList = z.array(z.string()).transform((values) => values.flatMap((value) => value.split(",")).filter(Boolean));

const idList = csvList
  .pipe(z.array(z.coerce.number<string>().int().positive()).max(50))
  .transform((ids) => [...new Set(ids)].sort((a, b) => a - b));

function enumList<const T extends readonly [string, ...string[]]>(values: T) {
  return csvList
    .pipe(z.array(z.enum(values)))
    .transform((items) => values.filter((value) => (items as string[]).includes(value)) as T[number][]);
}

const titleFilter = z.string().trim().min(1).max(MAX_TITLE_FILTER_LENGTH);

const booleanFlag = z.enum(["true", "false", "1", "0"]).transform((value) => value === "true" || value === "1");

const bytes = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

const fields = {
  indexerIds: idList,
  categories: idList,
  sources: idList,
  qualities: enumList(QUALITIES),
  codecs: enumList(CODECS),
  titleIncludes: titleFilter,
  titleExcludes: titleFilter,
  maxAgeDays: z.coerce.number().pipe(z.literal(MAX_AGE_DAYS)),
  minSeeders: z.coerce.number().int().min(0).max(1_000_000),
  minSize: bytes,
  maxSize: bytes,
  publishedAfter: z.union([z.iso.date(), z.iso.datetime({ offset: true })]),
  sort: z.enum(SORT_FIELDS),
  order: z.enum(SORT_ORDERS),
  page: z.coerce.number().int().min(1).max(100_000),
  pageSize: z.coerce.number().pipe(z.literal(PAGE_SIZES)),
  deduplicate: booleanFlag,
  browse: booleanFlag,
};

// Termo vazio é válido: lista os lançamentos mais recentes dos indexadores.
export function isSearchableTerm(term: string) {
  return term.length === 0 || term.length >= MIN_QUERY_LENGTH;
}

export const searchRequestSchema = z
  .object({
    q: z.string().trim().max(MAX_QUERY_LENGTH).default(""),
    indexerIds: fields.indexerIds.default([]),
    categories: fields.categories.default([]),
    sources: fields.sources.default([]),
    qualities: fields.qualities.default([]),
    codecs: fields.codecs.default([]),
    titleIncludes: fields.titleIncludes.optional(),
    titleExcludes: fields.titleExcludes.optional(),
    maxAgeDays: fields.maxAgeDays.optional(),
    minSeeders: fields.minSeeders.optional(),
    minSize: fields.minSize.optional(),
    maxSize: fields.maxSize.optional(),
    publishedAfter: fields.publishedAfter.optional(),
    sort: fields.sort.default("publishedAt"),
    order: fields.order.default("desc"),
    page: fields.page.default(1),
    pageSize: fields.pageSize.default(25),
    deduplicate: fields.deduplicate.default(false),
    cachedOnly: booleanFlag.default(false),
  })
  .refine((value) => isSearchableTerm(value.q), { path: ["q"] })
  .refine((value) => value.minSize === undefined || value.maxSize === undefined || value.minSize <= value.maxSize, {
    path: ["maxSize"],
  });

export type SearchRequest = z.output<typeof searchRequestSchema>;

// `browse` marca que o usuário pediu a lista sem termo. Sem ele, abrir a página não consulta os indexadores.
export type SearchState = Omit<SearchRequest, "cachedOnly"> & { browse: boolean };

export function shouldSearch(state: Pick<SearchState, "q" | "browse">) {
  return state.q ? isSearchableTerm(state.q) : state.browse;
}

export const DEFAULT_SEARCH_STATE: SearchState = {
  q: "",
  indexerIds: [],
  categories: [],
  sources: [],
  qualities: [],
  codecs: [],
  titleIncludes: undefined,
  titleExcludes: undefined,
  maxAgeDays: undefined,
  minSeeders: undefined,
  minSize: undefined,
  maxSize: undefined,
  publishedAfter: undefined,
  sort: "publishedAt",
  order: "desc",
  page: 1,
  pageSize: 25,
  deduplicate: false,
  browse: false,
};

export const CLEARED_FILTERS = {
  categories: [],
  sources: [],
  qualities: [],
  codecs: [],
  titleIncludes: undefined,
  titleExcludes: undefined,
  maxAgeDays: undefined,
  minSeeders: undefined,
  minSize: undefined,
  maxSize: undefined,
  publishedAfter: undefined,
  deduplicate: false,
} satisfies Partial<SearchState>;

const LIST_KEYS = ["indexerIds", "categories", "sources", "qualities", "codecs"] as const;
const SCALAR_KEYS = [
  "q",
  "titleIncludes",
  "titleExcludes",
  "maxAgeDays",
  "minSeeders",
  "minSize",
  "maxSize",
  "publishedAfter",
  "sort",
  "order",
  "page",
  "pageSize",
  "deduplicate",
  "browse",
  "cachedOnly",
] as const;

// Valores vazios contam como ausentes para que `?minSeeders=` não vire zero na coerção numérica.
export function rawSearchParams(params: URLSearchParams): Record<string, string | string[]> {
  const raw: Record<string, string | string[]> = {};
  for (const key of LIST_KEYS) {
    const values = params.getAll(key).filter(Boolean);
    if (values.length > 0) raw[key] = values;
  }
  for (const key of SCALAR_KEYS) {
    const value = params.get(key);
    if (value) raw[key] = value;
  }
  return raw;
}

// A URL é editável pelo usuário: campo inválido cai no padrão em vez de derrubar a tela.
export function parseSearchState(params: URLSearchParams): SearchState {
  const raw = rawSearchParams(params);
  const state: SearchState = { ...DEFAULT_SEARCH_STATE };

  if (typeof raw.q === "string") state.q = raw.q.trim().slice(0, MAX_QUERY_LENGTH);

  for (const [key, schema] of Object.entries(fields) as [keyof typeof fields, z.ZodType][]) {
    if (raw[key] === undefined) continue;
    const parsed = schema.safeParse(raw[key]);
    if (parsed.success) Object.assign(state, { [key]: parsed.data });
  }

  return state;
}

export function serializeSearchState(state: SearchState): URLSearchParams {
  const params = new URLSearchParams();

  if (state.q) params.set("q", state.q);
  for (const id of state.indexerIds) params.append("indexerIds", String(id));
  for (const id of state.categories) params.append("categories", String(id));
  for (const id of state.sources) params.append("sources", String(id));
  for (const quality of state.qualities) params.append("qualities", quality);
  for (const codec of state.codecs) params.append("codecs", codec);
  if (state.titleIncludes) params.set("titleIncludes", state.titleIncludes);
  if (state.titleExcludes) params.set("titleExcludes", state.titleExcludes);
  if (state.maxAgeDays !== undefined) params.set("maxAgeDays", String(state.maxAgeDays));
  if (state.minSeeders !== undefined) params.set("minSeeders", String(state.minSeeders));
  if (state.minSize !== undefined) params.set("minSize", String(state.minSize));
  if (state.maxSize !== undefined) params.set("maxSize", String(state.maxSize));
  if (state.publishedAfter) params.set("publishedAfter", state.publishedAfter);
  if (state.sort !== DEFAULT_SEARCH_STATE.sort) params.set("sort", state.sort);
  if (state.order !== DEFAULT_SEARCH_STATE.order) params.set("order", state.order);
  if (state.page !== DEFAULT_SEARCH_STATE.page) params.set("page", String(state.page));
  if (state.pageSize !== DEFAULT_SEARCH_STATE.pageSize) params.set("pageSize", String(state.pageSize));
  if (state.deduplicate) params.set("deduplicate", "true");
  if (state.browse) params.set("browse", "true");

  return params;
}

// Identifica a busca upstream: só termo e indexadores. Ordenação, filtros e página operam sobre o cache.
export function upstreamSearchKey(state: Pick<SearchState, "q" | "indexerIds">): string {
  const term = state.q.trim().replace(/\s+/g, " ").toLowerCase();
  return `${term}|${[...state.indexerIds].sort((a, b) => a - b).join(",")}`;
}
