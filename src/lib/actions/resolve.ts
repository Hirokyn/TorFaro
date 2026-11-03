import "server-only";

import type { ActionEntry } from "@/lib/actions/tokens";
import { ApiError } from "@/lib/api/http";
import { getConfig } from "@/lib/config";
import { isProwlarrDownloadUrl, safeMagnetUrl } from "@/lib/prowlarr/normalize";

const DOWNLOAD_TIMEOUT_MS = 30_000;
export const MAX_TORRENT_BYTES = 10 * 1024 * 1024;

// Todo arquivo .torrent é um dicionário bencode.
const BENCODE_DICTIONARY = 0x64;

export type ResolvedAction =
  | { kind: "magnet"; magnetUrl: string }
  | { kind: "torrent"; body: ReadableStream<Uint8Array>; contentLength: number | null };

function unavailable() {
  return new ApiError(502, "download_unavailable", "O Prowlarr não conseguiu fornecer este resultado.");
}

function limitedStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  first: Uint8Array,
  release: () => void,
): ReadableStream<Uint8Array> {
  let received = first.byteLength;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(first);
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();

        if (done) {
          release();
          controller.close();
          return;
        }

        received += value.byteLength;
        if (received > MAX_TORRENT_BYTES) {
          release();
          await reader.cancel();
          controller.error(new Error("torrent_too_large"));
          return;
        }

        controller.enqueue(value);
      } catch {
        release();
        controller.error(new Error("torrent_stream_failed"));
      }
    },
    async cancel() {
      release();
      await reader.cancel();
    },
  });
}

async function openTorrent(response: Response, release: () => void): Promise<ResolvedAction> {
  const declaredLength = Number(response.headers.get("content-length"));
  const contentLength = Number.isFinite(declaredLength) && declaredLength > 0 ? declaredLength : null;

  if (!response.body) throw unavailable();

  if (contentLength !== null && contentLength > MAX_TORRENT_BYTES) {
    await response.body.cancel();
    throw new ApiError(502, "download_too_large", "O arquivo excede o limite permitido.");
  }

  const reader = response.body.getReader();
  const { value: first } = await reader.read();

  if (first?.[0] !== BENCODE_DICTIONARY) {
    await reader.cancel();
    throw unavailable();
  }

  return { kind: "torrent", body: limitedStream(reader, first, release), contentLength };
}

// `release` encerra o timeout quando o corpo termina; em resposta sem corpo ele é chamado aqui mesmo.
async function fetchAction(url: string, signal: AbortSignal, release: () => void): Promise<ResolvedAction> {
  const response = await fetch(url, { redirect: "manual", cache: "no-store", signal });

  if (response.status >= 300 && response.status < 400) {
    // O destino nunca é seguido: fora do Prowlarr só um magnet é aceito, jamais acesso direto a tracker.
    const magnetUrl = safeMagnetUrl(response.headers.get("location"));
    if (!magnetUrl) throw unavailable();
    release();
    return { kind: "magnet", magnetUrl };
  }

  if (!response.ok) throw unavailable();

  return openTorrent(response, release);
}

export async function openAction(entry: ActionEntry, parent?: AbortSignal): Promise<ResolvedAction> {
  const knownMagnet = entry.resolvedMagnet ?? entry.result.magnetUrl;
  if (knownMagnet) return { kind: "magnet", magnetUrl: knownMagnet };

  // A URL veio do cache do servidor, mas o destino é conferido de novo antes de cada acesso.
  const { actionUrl } = entry.result;
  if (!isProwlarrDownloadUrl(actionUrl, getConfig().PROWLARR_URL)) throw unavailable();

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), DOWNLOAD_TIMEOUT_MS);
  const release = () => clearTimeout(timer);
  const signal = parent ? AbortSignal.any([timeout.signal, parent]) : timeout.signal;

  try {
    const resolved = await fetchAction(actionUrl, signal, release);
    if (resolved.kind === "magnet") entry.resolvedMagnet = resolved.magnetUrl;
    return resolved;
  } catch (error) {
    release();
    if (error instanceof ApiError) throw error;
    if (timeout.signal.aborted) {
      throw new ApiError(504, "download_timeout", "O Prowlarr demorou demais para responder.");
    }
    throw unavailable();
  }
}
