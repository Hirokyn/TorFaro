// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ResultPage } from "@/components/result/result-page";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ResultPageResponse, SearchResultDto, TorrentDetails } from "@/lib/contracts";

const result: SearchResultDto = {
  id: "r1",
  title: "Ubuntu 24.04 desktop amd64",
  indexerId: 5,
  indexerName: "The Pirate Bay",
  size: 1_814_623_682,
  seeders: 42,
  leechers: 3,
  publishedAt: "2026-01-01T00:00:00Z",
  categories: [{ id: 4000, name: "PC" }],
  quality: "1080p",
  codec: "h265",
  grabs: 2340,
  files: 7,
  imdbId: 133093,
  infoHash: null,
  magnetUrl: null,
  infoUrl: "https://example.invalid/item/1",
  torrentActionToken: "token-1",
  sources: [{ indexerId: 5, indexerName: "The Pirate Bay", seeders: 42 }],
};

const details: TorrentDetails = {
  infoHash: "a".repeat(40),
  name: "ubuntu",
  trackers: ["udp://tracker.invalid:1337"],
  files: [],
  fileCount: null,
  pieceSize: null,
  pieceCount: null,
  createdBy: null,
  comment: null,
  createdAt: null,
};

function stubDetails(body: ResultPageResponse | { error: { code: string; message: string } }, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) =>
      input.endsWith("/details")
        ? Response.json(body, { status })
        : Response.json({ status: "connected", prowlarr: { reachable: true, version: "2.5.2.5491" } }),
    ),
  );
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ResultPage token="token-1" />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("página de detalhes", () => {
  it("mostra título, números e ações", async () => {
    stubDetails({ result, details });
    renderPage();

    expect(await screen.findByRole("heading", { name: result.title })).toBeInTheDocument();
    expect(screen.getByText("Seeders")).toBeInTheDocument();
    expect(screen.getByText("2.340")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Abrir no cliente de torrent/ })).toHaveAttribute(
      "href",
      "/api/results/token-1/torrent",
    );
    expect(screen.getByRole("link", { name: "IMDb" })).toHaveAttribute(
      "href",
      "https://www.imdb.com/title/tt0133093/",
    );
  });

  it("usa o infohash do magnet quando a busca não trouxe", async () => {
    stubDetails({ result, details });
    renderPage();

    expect(await screen.findByText("a".repeat(40))).toBeInTheDocument();
  });

  it("lista os trackers", async () => {
    stubDetails({ result, details });
    renderPage();

    const trackers = await screen.findByRole("region", { name: "Trackers" });

    expect(within(trackers).getByText("udp://tracker.invalid:1337")).toBeInTheDocument();
  });

  it("explica quando os nomes dos arquivos não estão disponíveis", async () => {
    stubDetails({ result, details });
    renderPage();

    const files = await screen.findByRole("region", { name: "Arquivos" });

    expect(within(files).getByText(/\(7\)/)).toBeInTheDocument();
    expect(within(files).getByText(/só aparecem nas fontes que entregam arquivo .torrent/)).toBeInTheDocument();
  });

  it("lista arquivos e dados do .torrent", async () => {
    stubDetails({
      result,
      details: {
        ...details,
        files: [{ path: "disco/a.iso", size: 1024 }],
        fileCount: 1,
        pieceSize: 262144,
        pieceCount: 200,
        createdBy: "qBittorrent",
        comment: "Pacote de teste",
      },
    });
    renderPage();

    const files = await screen.findByRole("region", { name: "Arquivos" });

    expect(within(files).getByText("disco/a.iso")).toBeInTheDocument();
    expect(within(files).getByText("1 KB")).toBeInTheDocument();
    expect(screen.getByText("qBittorrent")).toBeInTheDocument();
    expect(screen.getByText("Pacote de teste")).toBeInTheDocument();
    expect(screen.getByText("200 de 256 KB")).toBeInTheDocument();
  });

  it("segue abrindo quando a fonte não responde", async () => {
    stubDetails({ result, details: null });
    renderPage();

    expect(await screen.findByRole("heading", { name: result.title })).toBeInTheDocument();
    expect(screen.getByText(/A fonte não respondeu agora/)).toBeInTheDocument();
  });

  it("mostra a mensagem da API quando o link expirou", async () => {
    stubDetails({ error: { code: "action_expired", message: "Este link expirou." } }, 410);
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Este link expirou.");
    expect(screen.getByRole("link", { name: /Voltar para a busca/ })).toHaveAttribute("href", "/");
  });
});
