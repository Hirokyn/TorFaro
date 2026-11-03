import type { NextRequest } from "next/server";

import { loadActionDetails } from "@/lib/actions/details";
import { resolveActionToken } from "@/lib/actions/tokens";
import { clientId } from "@/lib/api/client-id";
import { jsonResponse, withErrors } from "@/lib/api/http";
import type { ResultPageResponse } from "@/lib/contracts";
import { enforceRateLimit } from "@/lib/rate-limit";
import { toPublicResult } from "@/lib/search/service";
import { withOwnSource } from "@/lib/search/view";

export const GET = withErrors(async (request: NextRequest, context: RouteContext<"/api/results/[token]/details">) => {
  const client = clientId(request);
  enforceRateLimit(`action:${client}`, 60, 60_000);

  const { token } = await context.params;
  const entry = resolveActionToken(token, client);

  return jsonResponse<ResultPageResponse>({
    result: toPublicResult(withOwnSource(entry.result), token),
    details: await loadActionDetails(entry, request.signal),
  });
});
