import "server-only";

import { parseTorrent } from "@/lib/actions/bencode";
import { openAction } from "@/lib/actions/resolve";
import type { ActionEntry } from "@/lib/actions/tokens";
import { ApiError } from "@/lib/api/http";
import type { TorrentDetails } from "@/lib/contracts";
import { safeMagnetUrl } from "@/lib/prowlarr/normalize";

const MAX_LISTED_FILES = 1_000;
const MAX_COMMENT_LENGTH = 500;
const TRACKER_PROTOCOLS = ["udp:", "http:", "https:", "wss:", "ws:"];

function isPublicTracker(value: string) {
  try {
    const url = new URL(value);
    return TRACKER_PROTOCOLS.includes(url.protocol) && !/apikey|passkey/i.test(value);
  } catch {
    return false;
  }
}

function detailsFromMagnet(magnetUrl: string): TorrentDetails {
  const params = new URL(magnetUrl).searchParams;
  const hash = params.getAll("xt").find((xt) => /^urn:btih:/i.test(xt));

  return {
    infoHash: hash ? hash.slice("urn:btih:".length).toLowerCase() : null,
    trackers: [...new Set(params.getAll("tr"))].filter(isPublicTracker),
    name: params.get("dn"),
    files: [],
    fileCount: null,
    pieceSize: null,
    pieceCount: null,
    createdBy: null,
    comment: null,
    createdAt: null,
  };
}

function detailsFromTorrent(bytes: Uint8Array): TorrentDetails {
  const { files, trackers, comment, ...metadata } = parseTorrent(bytes);

  return {
    ...metadata,
    trackers: trackers.filter(isPublicTracker),
    files: files.slice(0, MAX_LISTED_FILES),
    fileCount: files.length,
    comment: comment?.slice(0, MAX_COMMENT_LENGTH) ?? null,
  };
}

function magnetFromDetails({ infoHash, name, trackers }: TorrentDetails, title: string) {
  const query = [`xt=urn:btih:${infoHash}`, `dn=${encodeURIComponent(name ?? title)}`];
  for (const tracker of trackers) query.push(`tr=${encodeURIComponent(tracker)}`);
  return safeMagnetUrl(`magnet:?${query.join("&")}`);
}

export type OpenedResult = { kind: "magnet"; magnetUrl: string } | { kind: "file"; bytes: Uint8Array };

async function readBody(body: ReadableStream<Uint8Array>) {
  try {
    return new Uint8Array(await new Response(body).arrayBuffer());
  } catch {
    throw new ApiError(502, "download_unavailable", "O Prowlarr não conseguiu fornecer este resultado.");
  }
}

// Fontes que entregam .torrent também viram magnet: o arquivo traz o infohash e os trackers, e assim
// o navegador abre o cliente de torrent em todas as fontes. O arquivo só é usado se não puder ser lido.
export async function openAsMagnet(entry: ActionEntry, signal: AbortSignal): Promise<OpenedResult> {
  const opened = await openAction(entry, signal);

  if (opened.kind === "magnet") return opened;

  const bytes = await readBody(opened.body);

  try {
    const details = detailsFromTorrent(bytes);
    const magnetUrl = magnetFromDetails(details, entry.result.title);

    if (magnetUrl) {
      entry.details = details;
      entry.resolvedMagnet = magnetUrl;
      return { kind: "magnet", magnetUrl };
    }
  } catch {
    // Conteúdo que parece torrent, mas não pôde ser interpretado, segue como arquivo.
  }

  return { kind: "file", bytes };
}

// Falha aqui não derruba a página: os dados da busca continuam válidos sem esse complemento.
export async function loadActionDetails(entry: ActionEntry, signal: AbortSignal): Promise<TorrentDetails | null> {
  if (entry.details) return entry.details;

  try {
    const opened = await openAsMagnet(entry, signal);
    if (opened.kind !== "magnet") return null;

    entry.details ??= detailsFromMagnet(opened.magnetUrl);
    return entry.details;
  } catch {
    return null;
  }
}
