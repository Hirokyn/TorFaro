import "server-only";

import { parseTorrent } from "@/lib/actions/bencode";
import { openAction } from "@/lib/actions/resolve";
import type { ActionEntry } from "@/lib/actions/tokens";
import type { TorrentDetails } from "@/lib/contracts";

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

// Falha aqui não derruba a página: os dados da busca continuam válidos sem esse complemento.
export async function loadActionDetails(entry: ActionEntry, signal: AbortSignal): Promise<TorrentDetails | null> {
  if (entry.details) return entry.details;

  try {
    const opened = await openAction(entry, signal);
    const details =
      opened.kind === "magnet"
        ? detailsFromMagnet(opened.magnetUrl)
        : detailsFromTorrent(new Uint8Array(await new Response(opened.body).arrayBuffer()));

    entry.details = details;
    return details;
  } catch {
    return null;
  }
}
