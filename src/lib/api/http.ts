import "server-only";

import { NextResponse } from "next/server";

import type { ApiErrorBody } from "@/lib/contracts";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const NO_STORE = { "Cache-Control": "no-store" };

export function jsonResponse<T>(body: T, init?: { status?: number; headers?: Record<string, string> }) {
  return NextResponse.json(body, { status: init?.status, headers: { ...NO_STORE, ...init?.headers } });
}

function errorResponse(status: number, code: string, message: string, headers?: Record<string, string>) {
  return jsonResponse<ApiErrorBody>({ error: { code, message } }, { status, headers });
}

// Toda rota passa por aqui: erro inesperado nunca chega ao cliente com detalhes internos.
export function withErrors<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return errorResponse(error.status, error.code, error.message, error.headers);
      }

      console.error("api_unexpected_error", error instanceof Error ? error.name : "unknown");
      return errorResponse(500, "internal_error", "Não foi possível concluir a solicitação.");
    }
  };
}
