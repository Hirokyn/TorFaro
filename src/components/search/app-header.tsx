"use client";

import { useQuery } from "@tanstack/react-query";

import { getJson } from "@/lib/client/api";
import type { HealthResponse } from "@/lib/contracts";
import { cn } from "@/lib/utils";

const HEALTH_INTERVAL_MS = 60_000;

function ConnectionStatus() {
  const { data, isPending } = useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => getJson<HealthResponse>("/api/health", { signal }),
    refetchInterval: HEALTH_INTERVAL_MS,
  });

  const connected = data?.status === "connected";
  const label = isPending ? "Verificando" : connected ? "Prowlarr conectado" : "Prowlarr desconectado";

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          isPending ? "bg-muted-foreground" : connected ? "bg-emerald-500" : "bg-destructive",
        )}
      />
      <span className="max-sm:sr-only">{label}</span>
      {data?.prowlarr.version && <span className="font-mono max-sm:hidden">{data.prowlarr.version}</span>}
    </span>
  );
}

export function AppHeader() {
  return (
    <header className="flex h-11 items-center justify-between gap-4">
      <span className="text-sm font-semibold tracking-tight">TorFaro</span>
      <ConnectionStatus />
    </header>
  );
}
