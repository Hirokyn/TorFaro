import { jsonResponse, withErrors } from "@/lib/api/http";
import type { HealthResponse } from "@/lib/contracts";
import { getSystemStatus } from "@/lib/prowlarr/client";
import { getServerState } from "@/lib/server-state";

const HEALTH_CACHE_MS = 10_000;

// Sempre 200: o healthcheck do container mede esta aplicação, e `status` informa o estado do Prowlarr.
export const GET = withErrors(async () => {
  const state = getServerState();
  const now = Date.now();

  if (state.health && state.health.expiresAt > now) {
    return jsonResponse(state.health.value);
  }

  let version: string | null = null;
  try {
    ({ version } = await getSystemStatus());
  } catch {
    version = null;
  }

  const value: HealthResponse = {
    status: version ? "connected" : "disconnected",
    prowlarr: { reachable: version !== null, version },
    checkedAt: new Date(now).toISOString(),
  };

  state.health = { value, expiresAt: now + HEALTH_CACHE_MS };
  return jsonResponse(value);
});
