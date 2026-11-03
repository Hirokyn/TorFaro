import type { NextRequest } from "next/server";

import { openAsMagnet } from "@/lib/actions/details";
import { resolveActionToken } from "@/lib/actions/tokens";
import { clientId } from "@/lib/api/client-id";
import { ApiError, jsonResponse, withErrors } from "@/lib/api/http";
import type { MagnetResponse } from "@/lib/contracts";
import { enforceRateLimit } from "@/lib/rate-limit";

export const GET = withErrors(async (request: NextRequest, context: RouteContext<"/api/results/[token]/magnet">) => {
  const client = clientId(request);
  enforceRateLimit(`action:${client}`, 60, 60_000);

  const { token } = await context.params;
  const resolved = await openAsMagnet(resolveActionToken(token, client), request.signal);

  if (resolved.kind !== "magnet") {
    throw new ApiError(422, "magnet_unavailable", "Este resultado só oferece arquivo .torrent.");
  }

  return jsonResponse<MagnetResponse>({ magnetUrl: resolved.magnetUrl });
});
