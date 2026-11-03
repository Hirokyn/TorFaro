import "server-only";

import type { ActionEntry } from "@/lib/actions/tokens";
import type { RateWindow } from "@/lib/rate-limit";
import type { ActiveSearch, CachedSearch } from "@/lib/search/service";
import type { HealthResponse } from "@/lib/contracts";

type ServerState = {
  rateWindows: Map<string, RateWindow>;
  searches: Map<string, CachedSearch>;
  activeSearches: Map<string, ActiveSearch>;
  actions: Map<string, ActionEntry>;
  health: { value: HealthResponse; expiresAt: number } | null;
};

const globalStore = globalThis as typeof globalThis & { __prowlarrSearchUi?: ServerState };

// Route Handlers são empacotados separadamente; o estado precisa viver em globalThis para ser único no processo.
export function getServerState(): ServerState {
  globalStore.__prowlarrSearchUi ??= {
    rateWindows: new Map(),
    searches: new Map(),
    activeSearches: new Map(),
    actions: new Map(),
    health: null,
  };
  return globalStore.__prowlarrSearchUi;
}

export function resetServerState() {
  globalStore.__prowlarrSearchUi = undefined;
}
