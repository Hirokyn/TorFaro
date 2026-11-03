import type { NextRequest } from "next/server";

import { ApiError, jsonResponse, withErrors } from "@/lib/api/http";
import type { IndexersResponse } from "@/lib/contracts";
import { getIndexers, getIndexerStatuses } from "@/lib/prowlarr/client";
import { normalizeIndexers } from "@/lib/prowlarr/normalize";

export const GET = withErrors(async (request: NextRequest) => {
  try {
    const [indexers, statuses] = await Promise.all([
      getIndexers(request.signal),
      getIndexerStatuses(request.signal),
    ]);

    return jsonResponse<IndexersResponse>({ indexers: normalizeIndexers(indexers, statuses) });
  } catch {
    throw new ApiError(502, "indexers_unavailable", "Não foi possível listar os indexadores.");
  }
});
