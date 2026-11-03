import "server-only";

import { ApiError } from "@/lib/api/http";
import { getServerState } from "@/lib/server-state";

export type RateWindow = {
  count: number;
  resetAt: number;
};

const MAX_TRACKED_KEYS = 5_000;

export function enforceRateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const { rateWindows } = getServerState();

  if (rateWindows.size >= MAX_TRACKED_KEYS) {
    for (const [trackedKey, window] of rateWindows) {
      if (window.resetAt <= now) rateWindows.delete(trackedKey);
    }
  }

  const current = rateWindows.get(key);

  if (!current || current.resetAt <= now) {
    rateWindows.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (current.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    throw new ApiError(429, "rate_limited", "Muitas solicitações. Aguarde um instante e tente novamente.", {
      "Retry-After": String(retryAfter),
    });
  }

  current.count += 1;
}
