import "server-only";

// Sem login, o IP identifica o aparelho na rede local para limites, cache e tokens de ação.
// Um proxy reverso acrescenta o próprio IP ao final de X-Forwarded-For; o cliente é a primeira entrada.
export function clientId(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}
