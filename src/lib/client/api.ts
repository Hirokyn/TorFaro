import type { ApiErrorBody } from "@/lib/contracts";

export class ClientApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

export async function getJson<T>(url: string, options: { signal?: AbortSignal } = {}): Promise<T> {
  const response = await fetch(url, { signal: options.signal, headers: { Accept: "application/json" } });
  const body: unknown = await response.json().catch(() => null);

  if (response.ok) return body as T;

  const error = (body as ApiErrorBody | null)?.error;
  throw new ClientApiError(
    response.status,
    error?.code ?? "request_failed",
    error?.message ?? "Não foi possível concluir a solicitação.",
  );
}
