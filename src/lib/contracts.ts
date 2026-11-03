// Contratos públicos da API interna. Nada aqui pode carregar URL interna, API key ou objeto bruto do Prowlarr.

import type { Codec, Quality } from "@/lib/search/params";

export type PublicCategory = {
  id: number;
  name: string;
};

export type HealthResponse = {
  status: "connected" | "disconnected";
  prowlarr: {
    reachable: boolean;
    version: string | null;
  };
  checkedAt: string;
};

export type IndexerDto = {
  id: number;
  name: string;
  enabled: boolean;
  protocol: string;
  available: boolean;
  disabledUntil: string | null;
  categories: PublicCategory[];
};

export type IndexersResponse = {
  indexers: IndexerDto[];
};

export type ResultSource = {
  indexerId: number;
  indexerName: string;
  seeders: number | null;
};

export type SearchResultDto = {
  id: string;
  title: string;
  indexerId: number;
  indexerName: string;
  size: number | null;
  seeders: number | null;
  leechers: number | null;
  publishedAt: string | null;
  categories: PublicCategory[];
  quality: Quality | null;
  codec: Codec | null;
  grabs: number | null;
  files: number | null;
  imdbId: number | null;
  infoHash: string | null;
  magnetUrl: string | null;
  infoUrl: string | null;
  torrentActionToken: string | null;
  sources: ResultSource[];
};

export type Pagination = {
  page: number;
  pageSize: number;
  upstreamCount: number;
  filteredCount: number;
  totalPages: number;
  hasMore: boolean;
};

export type UnavailableIndexer = {
  id: number;
  name: string;
  disabledUntil: string | null;
};

export type Facet<Id extends number | string = number> = {
  id: Id;
  name: string;
  count: number;
};

export type SearchFacets = {
  categories: Facet[];
  sources: Facet[];
  qualities: Facet<Quality>[];
  codecs: Facet<Codec>[];
};

export type SearchResponse = {
  query: string;
  results: SearchResultDto[];
  pagination: Pagination;
  partial: {
    isPartial: boolean;
    unavailableIndexers: UnavailableIndexer[];
  };
  facets: SearchFacets;
  searchedAt: string;
  servedFromCache: boolean;
};

export type TorrentFile = {
  path: string;
  size: number;
};

export type TorrentDetails = {
  infoHash: string | null;
  name: string | null;
  trackers: string[];
  files: TorrentFile[];
  fileCount: number | null;
  pieceSize: number | null;
  pieceCount: number | null;
  createdBy: string | null;
  comment: string | null;
  createdAt: string | null;
};

export type ResultPageResponse = {
  result: SearchResultDto;
  details: TorrentDetails | null;
};

export type MagnetResponse = {
  magnetUrl: string;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
  };
};
