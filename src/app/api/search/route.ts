import type { NextRequest } from "next/server";

import { clientId } from "@/lib/api/client-id";
import { ApiError, jsonResponse, withErrors } from "@/lib/api/http";
import { rawSearchParams, searchRequestSchema } from "@/lib/search/params";
import { getSearchResponse } from "@/lib/search/service";

export const GET = withErrors(async (request: NextRequest) => {
  const parsed = searchRequestSchema.safeParse(rawSearchParams(request.nextUrl.searchParams));

  if (!parsed.success) {
    throw new ApiError(400, "invalid_search", "Revise os parâmetros da busca.");
  }

  return jsonResponse(await getSearchResponse(clientId(request), parsed.data, request.signal));
});
