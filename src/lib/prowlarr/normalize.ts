import "server-only";

import { createHash } from "node:crypto";

import type { IndexerDto, PublicCategory } from "@/lib/contracts";
import type {
  UpstreamCategory,
  UpstreamIndexer,
  UpstreamIndexerStatus,
  UpstreamSearchResult,
} from "@/lib/prowlarr/types";
import type { Codec, Quality } from "@/lib/search/params";

// IDs a partir deste valor são categorias próprias do tracker, sem nome padronizado.
const CUSTOM_CATEGORY_START = 100_000;

const MIN_PLACEHOLDER_GROUP = 5;
const PLACEHOLDER_DATE_WINDOW_MS = 5 * 60 * 1000;

export type NormalizedResult = {
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
  magnetUrl: string | null;
  infoUrl: string | null;
  infoHash: string | null;
  // Contém a API key: permanece no servidor, atrás de um token de ação.
  actionUrl: string | null;
};

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

// Alguns indexadores devolvem o título já escapado. O React escapa de novo na renderização.
function normalizeTitle(title: string | null | undefined) {
  return title
    ?.replace(/&(?:amp|lt|gt|quot|#39|apos);/g, (entity) => HTML_ENTITIES[entity])
    .replace(/\s+/g, " ")
    .trim();
}

// Títulos usam pontos, espaços e sublinhados como separadores; `\b` falharia no sublinhado.
function titleToken(pattern: string) {
  return new RegExp(`(?<![a-z0-9])(?:${pattern})(?![a-z0-9])`, "i");
}

const QUALITY_PATTERNS: [Quality, RegExp][] = [
  ["2160p", titleToken("2160p|4k|uhd")],
  ["1080p", titleToken("1080p")],
  ["720p", titleToken("720p")],
  ["sd", titleToken("576p|480p|360p")],
];

const CODEC_PATTERNS: [Codec, RegExp][] = [
  ["h265", titleToken("x265|h\\.?265|hevc")],
  ["h264", titleToken("x264|h\\.?264|avc")],
  ["av1", titleToken("av1")],
];

function firstMatch<T>(title: string, patterns: [T, RegExp][]): T | null {
  return patterns.find(([, pattern]) => pattern.test(title))?.[0] ?? null;
}

export function normalizeCategories(categories: UpstreamCategory[] | null | undefined): PublicCategory[] {
  const seen = new Map<number, PublicCategory>();

  for (const { id, name } of categories ?? []) {
    if (id < CUSTOM_CATEGORY_START && name && !seen.has(id)) seen.set(id, { id, name });
  }

  return [...seen.values()].sort((a, b) => a.id - b.id);
}

export function safeMagnetUrl(value: string | null | undefined): string | null {
  if (!value?.toLowerCase().startsWith("magnet:?")) return null;

  try {
    const url = new URL(value);
    const hasInfoHash = url.searchParams.getAll("xt").some((xt) => /^urn:(btih|btmh):/i.test(xt));
    return url.protocol === "magnet:" && hasInfoHash ? value : null;
  } catch {
    return null;
  }
}

// O magnet só é útil ao cliente; qualquer URL que aponte para o próprio Prowlarr carrega a API key.
export function safeInfoUrl(value: string | null | undefined, prowlarrUrl: string): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.origin === new URL(prowlarrUrl).origin) return null;
    if ([...url.searchParams.keys()].some((key) => key.toLowerCase() === "apikey")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isProwlarrDownloadUrl(value: string | null | undefined, prowlarrUrl: string): value is string {
  if (!value) return false;

  try {
    const url = new URL(value);
    const base = new URL(prowlarrUrl);
    const prefix = base.pathname.replace(/\/$/, "");
    const hasDownloadPath = url.pathname.startsWith(`${prefix}/`)
      && /^\/\d+\/download$/.test(url.pathname.slice(prefix.length));
    return url.origin === base.origin && hasDownloadPath;
  } catch {
    return false;
  }
}

function normalizeInfoHash(value: string | null | undefined): string | null {
  const hash = value?.trim().toLowerCase();
  return hash && (/^[a-f0-9]{40}$/.test(hash) || /^[a-z2-7]{32}$/.test(hash)) ? hash : null;
}

function normalizeCount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
}

// Nessas contagens o Prowlarr usa zero para "não informado".
function normalizePositive(value: number | null | undefined): number | null {
  return normalizeCount(value) || null;
}

// O Prowlarr usa a data mínima do .NET quando o indexador não informa publicação.
function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) || new Date(time).getUTCFullYear() < 1970 ? null : new Date(time).toISOString();
}

function resultId(result: UpstreamSearchResult, title: string) {
  return createHash("sha256")
    .update(`${result.indexerId}:${result.guid ?? title}`)
    .digest("base64url")
    .slice(0, 22);
}

// Algumas fontes só informam o infohash: ele basta para o cliente de torrent achar o conteúdo pela rede DHT.
function magnetFromHash(infoHash: string | null, title: string) {
  return infoHash ? `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}` : null;
}

export function normalizeResult(result: UpstreamSearchResult, prowlarrUrl: string): NormalizedResult | null {
  const title = normalizeTitle(result.title);
  if (!title) return null;

  // Na versão instalada, `magnetUrl` também pode ser uma URL do Prowlarr que redireciona para o magnet.
  const candidates = [result.downloadUrl, result.magnetUrl];
  const infoHash = normalizeInfoHash(result.infoHash);
  const actionUrl = candidates.find((url) => isProwlarrDownloadUrl(url, prowlarrUrl)) ?? null;

  return {
    id: resultId(result, title),
    title,
    indexerId: result.indexerId,
    indexerName: result.indexer?.trim() || `Indexador ${result.indexerId}`,
    size: result.size && result.size > 0 ? result.size : null,
    seeders: normalizeCount(result.seeders),
    leechers: normalizeCount(result.leechers),
    publishedAt: normalizeDate(result.publishDate),
    categories: normalizeCategories(result.categories),
    quality: firstMatch(title, QUALITY_PATTERNS),
    codec: firstMatch(title, CODEC_PATTERNS),
    grabs: normalizeCount(result.grabs),
    files: normalizePositive(result.files),
    imdbId: normalizePositive(result.imdbId),
    magnetUrl: candidates.map(safeMagnetUrl).find(Boolean) ?? (actionUrl ? null : magnetFromHash(infoHash, title)),
    infoUrl: safeInfoUrl(result.infoUrl, prowlarrUrl),
    infoHash,
    actionUrl,
  };
}

// Sem data no indexador, o Prowlarr preenche com o momento da busca e o resultado pareceria um lançamento novo.
export function discardPlaceholderDates(results: NormalizedResult[], now: number): NormalizedResult[] {
  const groups = new Map<number, NormalizedResult[]>();

  for (const result of results) {
    const group = groups.get(result.indexerId);
    if (group) group.push(result);
    else groups.set(result.indexerId, [result]);
  }

  const placeholders = new Set<number>();

  for (const [indexerId, group] of groups) {
    const [first] = group;
    const isRecent = first.publishedAt !== null && Math.abs(now - Date.parse(first.publishedAt)) < PLACEHOLDER_DATE_WINDOW_MS;
    const allEqual = group.every((result) => result.publishedAt === first.publishedAt);

    if (group.length >= MIN_PLACEHOLDER_GROUP && isRecent && allEqual) placeholders.add(indexerId);
  }

  return results.map((result) => (placeholders.has(result.indexerId) ? { ...result, publishedAt: null } : result));
}

// Ausência em indexerstatus significa sem falha registrada.
export function normalizeIndexers(
  indexers: UpstreamIndexer[],
  statuses: UpstreamIndexerStatus[],
  now = Date.now(),
): IndexerDto[] {
  const disabledUntil = new Map(statuses.map((status) => [status.indexerId, status.disabledTill ?? null]));

  return indexers
    .filter((indexer) => indexer.enable)
    .map((indexer) => {
      const until = disabledUntil.get(indexer.id) ?? null;
      const stillDisabled = until !== null && Date.parse(until) > now;

      return {
        id: indexer.id,
        name: indexer.name,
        enabled: indexer.enable,
        protocol: indexer.protocol,
        available: !stillDisabled,
        disabledUntil: stillDisabled ? until : null,
        categories: normalizeCategories(indexer.capabilities?.categories),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
