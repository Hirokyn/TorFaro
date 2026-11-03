import type { NextRequest } from "next/server";

import { openAction } from "@/lib/actions/resolve";
import { resolveActionToken } from "@/lib/actions/tokens";
import { clientId } from "@/lib/api/client-id";
import { ApiError, withErrors } from "@/lib/api/http";
import { enforceRateLimit } from "@/lib/rate-limit";

type TorrentContext = RouteContext<"/api/results/[token]/torrent">;

function torrentFilename(title: string) {
  const safe = title
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 120);
  return `${safe || "resultado"}.torrent`;
}

async function openResult(request: NextRequest, context: TorrentContext) {
  const client = clientId(request);
  enforceRateLimit(`action:${client}`, 60, 60_000);

  const { token } = await context.params;
  const entry = resolveActionToken(token, client);
  const resolved = await openAction(entry, request.signal);

  // Redirecionar para magnet: faz o navegador entregar o link ao cliente de torrent padrão e manter a página aberta.
  if (resolved.kind === "magnet") {
    return new Response(null, {
      status: 302,
      headers: { Location: resolved.magnetUrl, "Cache-Control": "no-store" },
    });
  }

  const headers = new Headers({
    "Content-Type": "application/x-bittorrent",
    "Content-Disposition": `attachment; filename="${torrentFilename(entry.result.title)}"`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (resolved.contentLength !== null) headers.set("Content-Length", String(resolved.contentLength));

  return new Response(resolved.body, { headers });
}

// O botão é um link comum: sem esta página, um erro mostraria JSON bruto no navegador.
function navigationError({ status, message }: ApiError) {
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>TorFaro</title>
<body style="font-family:system-ui,sans-serif;padding:2rem"><p>${message}</p><a href="/">Voltar para a busca</a></body></html>`;

  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export const GET = withErrors(async (request: NextRequest, context: TorrentContext) => {
  try {
    return await openResult(request, context);
  } catch (error) {
    if (error instanceof ApiError && request.headers.get("sec-fetch-mode") === "navigate") {
      return navigationError(error);
    }
    throw error;
  }
});
