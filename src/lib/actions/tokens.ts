import "server-only";

import { randomBytes } from "node:crypto";

import { ApiError } from "@/lib/api/http";
import type { TorrentDetails } from "@/lib/contracts";
import type { NormalizedResult } from "@/lib/prowlarr/normalize";
import { getServerState } from "@/lib/server-state";

export const ACTION_TOKEN_TTL_MS = 30 * 60 * 1000;

const MAX_ACTIONS = 20_000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type ActionEntry = {
  clientId: string;
  queryKey: string;
  result: NormalizedResult;
  resolvedMagnet: string | null;
  details: TorrentDetails | null;
  expiresAt: number;
};

function pruneActions(now: number) {
  const { actions } = getServerState();

  for (const [token, entry] of actions) {
    if (entry.expiresAt <= now) actions.delete(token);
  }

  // Map preserva a ordem de inserção: os primeiros são os tokens mais antigos.
  for (const token of actions.keys()) {
    if (actions.size < MAX_ACTIONS) break;
    actions.delete(token);
  }
}

export function issueActionToken(
  input: Pick<ActionEntry, "clientId" | "queryKey" | "result">,
  now = Date.now(),
) {
  const { actions } = getServerState();
  if (actions.size >= MAX_ACTIONS) pruneActions(now);

  const token = randomBytes(32).toString("base64url");
  actions.set(token, { ...input, resolvedMagnet: null, details: null, expiresAt: now + ACTION_TOKEN_TTL_MS });
  return token;
}

// Token de outro cliente responde igual a token inexistente.
export function resolveActionToken(token: string, clientId: string, now = Date.now()): ActionEntry {
  const { actions } = getServerState();
  const entry = TOKEN_PATTERN.test(token) ? actions.get(token) : undefined;

  if (!entry || entry.clientId !== clientId) {
    throw new ApiError(404, "action_not_found", "Este resultado não está mais disponível. Busque novamente.");
  }

  if (entry.expiresAt <= now) {
    actions.delete(token);
    throw new ApiError(410, "action_expired", "Este link expirou. Busque novamente para gerar outro.");
  }

  return entry;
}
