// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SearchPage } from "@/components/search/search-page";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { IndexerDto, SearchResponse, SearchResultDto } from "@/lib/contracts";

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast: toastMock }));

// Reproduz a integração do App Router: useSearchParams acompanha history.pushState/replaceState.
vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    useSyncExternalStore(
      (listener) => {
        window.addEventListener("test:url", listener);
        return () => window.removeEventListener("test:url", listener);
      },
      () => currentParams(),
      () => currentParams(),
    ),
}));

let cachedSearch = "";
let cachedParams = new URLSearchParams();

function currentParams() {
  if (window.location.search !== cachedSearch) {
    cachedSearch = window.location.search;
    cachedParams = new URLSearchParams(cachedSearch);
  }
  return cachedParams;
}

function trackHistory() {
  for (const method of ["pushState", "replaceState"] as const) {
    const original = window.history[method].bind(window.history);
    vi.spyOn(window.history, method).mockImplementation((...args) => {
      original(...args);
      window.dispatchEvent(new Event("test:url"));
    });
  }
}

const INDEXERS: IndexerDto[] = [
  { id: 1, name: "1337x", enabled: true, protocol: "torrent", available: true, disabledUntil: null, categories: [] },
  {
    id: 8,
    name: "Internet Archive",
    enabled: true,
    protocol: "torrent",
    available: false,
    disabledUntil: "2999-01-01T07:48:00Z",
    categories: [],
  },
];

function resultDto(overrides: Partial<SearchResultDto> = {}): SearchResultDto {
  return {
    id: "r1",
    title: "Ubuntu 24.04",
    indexerId: 1,
    indexerName: "1337x",
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
    infoHash: "a".repeat(40),
    magnetUrl: null,
    infoUrl: "https://example.invalid/item/1",
    torrentActionToken: "token-1",
    sources: [{ indexerId: 1, indexerName: "1337x", seeders: 42 }],
    ...overrides,
  };
}

function searchResponse(overrides: Partial<SearchResponse> = {}): SearchResponse {
  return {
    query: "ubuntu",
    results: [resultDto()],
    pagination: { page: 1, pageSize: 25, upstreamCount: 1, filteredCount: 1, totalPages: 1, hasMore: false },
    partial: { isPartial: false, unavailableIndexers: [] },
    facets: {
      categories: [{ id: 4000, name: "PC", count: 1 }],
      sources: [{ id: 1, name: "1337x", count: 1 }],
      qualities: [{ id: "1080p", name: "1080p", count: 1 }],
      codecs: [{ id: "h265", name: "H.265", count: 1 }],
    },
    searchedAt: "2026-11-02T04:00:00Z",
    servedFromCache: false,
    ...overrides,
  };
}

type SearchHandler = (url: URL) => Response | Promise<Response>;

function stubApi(onSearch: SearchHandler = () => Response.json(searchResponse())) {
  const searchCalls: URL[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input, "http://localhost");
      if (url.pathname === "/api/indexers") return Response.json({ indexers: INDEXERS });
      if (url.pathname === "/api/health") {
        return Response.json({
          status: "connected",
          prowlarr: { reachable: true, version: "2.5.2.5491" },
          checkedAt: "2026-11-02T04:00:00Z",
        });
      }
      if (url.pathname === "/api/search") {
        searchCalls.push(url);
        return onSearch(url);
      }
      if (url.pathname.endsWith("/magnet")) {
        return Response.json({ magnetUrl: "magnet:?xt=urn:btih:abc" });
      }
      return new Response(null, { status: 404 });
    }),
  );

  return searchCalls;
}

function renderPage(url = "/") {
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event("test:url"));

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <SearchPage />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.scrollTo = vi.fn();
  trackHistory();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});

describe("formulário", () => {
  it("não busca ao digitar, somente ao enviar com Enter", async () => {
    const user = userEvent.setup();
    const searches = stubApi();
    renderPage();

    await user.type(screen.getByRole("searchbox"), "ubuntu");
    expect(searches).toHaveLength(0);

    await user.keyboard("{Enter}");

    await waitFor(() => expect(searches).toHaveLength(1));
    expect(searches[0].searchParams.get("q")).toBe("ubuntu");
    expect(window.location.search).toBe("?q=ubuntu");
  });

  it("também busca pelo botão", async () => {
    const user = userEvent.setup();
    const searches = stubApi();
    renderPage();

    await user.type(screen.getByRole("searchbox"), "ubuntu");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    await waitFor(() => expect(searches.at(-1)?.searchParams.get("q")).toBe("ubuntu"));
  });

  it("explica termo curto e não consulta a API", async () => {
    const user = userEvent.setup();
    const searches = stubApi();
    renderPage();

    await user.type(screen.getByRole("searchbox"), "a{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("pelo menos 2 caracteres");
    expect(screen.getByRole("searchbox")).toHaveAttribute("aria-invalid", "true");
    expect(searches).toHaveLength(0);
  });

  it("restaura termo e filtros da URL compartilhada", async () => {
    const searches = stubApi();
    renderPage("/?q=ubuntu&minSeeders=5&sort=size&order=asc");

    await waitFor(() => expect(searches).toHaveLength(1));
    expect(screen.getByRole("searchbox")).toHaveValue("ubuntu");
    expect(searches[0].searchParams.get("minSeeders")).toBe("5");
    expect(searches[0].searchParams.get("sort")).toBe("size");
    expect(await screen.findByText("5+ seeders")).toBeInTheDocument();
  });
});

describe("resultados", () => {
  it("mostra tabela para desktop e lista para mobile", async () => {
    stubApi();
    renderPage("/?q=ubuntu");

    const table = await screen.findByRole("table");

    expect(within(table).getByText("Ubuntu 24.04")).toBeInTheDocument();
    expect(within(table).getByText("1,7 GB")).toBeInTheDocument();
    expect(screen.getAllByRole("list").length).toBeGreaterThan(0);
  });

  it("mostra logo da fonte em vez do nome e a categoria na tabela", async () => {
    stubApi();
    renderPage("/?q=ubuntu");

    const table = await screen.findByRole("table");
    const logo = within(table).getByRole("img", { name: "1337x" });

    expect(logo.querySelector("img")).toHaveAttribute("src", expect.stringContaining("/indexers/1337x.png"));
    expect(within(table).queryByText("1337x")).not.toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Categoria" })).toBeInTheDocument();
    expect(within(table).getByText("PC")).toBeInTheDocument();
  });

  it("indica no menu quantas opções estão marcadas", async () => {
    stubApi();
    renderPage("/?q=ubuntu&qualities=1080p&qualities=720p");

    expect(await screen.findByRole("button", { name: /^Resolução\s*2/ })).toBeInTheDocument();
  });

  it("mantém a paginação fixa e visível mesmo com uma só página", async () => {
    stubApi();
    renderPage("/?q=ubuntu");

    const pagination = await screen.findByRole("navigation", { name: "Paginação" });

    expect(pagination).toHaveClass("sticky", "bottom-0");
    expect(within(pagination).getByRole("button", { name: "Página 1" })).toHaveAttribute("aria-current", "page");
    expect(within(pagination).getByRole("button", { name: "Próxima página" })).toBeDisabled();
  });

  it("aplica o texto digitado quando o menu é fechado sem sair do campo", async () => {
    const user = userEvent.setup();
    const searches = stubApi();
    renderPage("/?q=ubuntu");
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: /^Mais filtros/ }));
    await user.type(await screen.findByLabelText("Título não contém"), "cam");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(searches.at(-1)?.searchParams.get("titleExcludes")).toBe("cam"));
  });

  it("mostra o intervalo exibido e a navegação numerada", async () => {
    stubApi(() =>
      Response.json(
        searchResponse({
          pagination: { page: 3, pageSize: 25, upstreamCount: 182, filteredCount: 182, totalPages: 8, hasMore: true },
        }),
      ),
    );
    renderPage("/?q=ubuntu&page=3");

    expect(await screen.findByText("51–75 de 182")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Página 3" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Página 8" })).toBeInTheDocument();
  });

  it("aplica filtros de resolução, fonte e período sem repetir a busca upstream", async () => {
    const user = userEvent.setup();
    const searches = stubApi();
    renderPage("/?q=ubuntu");
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: /^Resolução/ }));
    await user.click(await screen.findByRole("checkbox", { name: /^1080p/ }));

    await waitFor(() => expect(searches).toHaveLength(2));
    expect(searches[1].searchParams.get("qualities")).toBe("1080p");
    expect(searches[1].searchParams.get("cachedOnly")).toBe("true");

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /^Período/ }));
    await user.click(await screen.findByRole("checkbox", { name: "7 dias" }));

    await waitFor(() => expect(searches).toHaveLength(3));
    expect(searches[2].searchParams.get("maxAgeDays")).toBe("7");
    expect(window.location.search).toContain("maxAgeDays=7");
  });

  it("restaura da URL os filtros novos como filtros ativos", async () => {
    stubApi();
    renderPage("/?q=ubuntu&sources=1&qualities=2160p&titleExcludes=cam&maxAgeDays=30");

    expect(await screen.findByRole("button", { name: "Remover filtro 1337x" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover filtro 4K" })).toBeInTheDocument();
    expect(screen.getByText("Sem “cam”")).toBeInTheDocument();
    expect(screen.getByText("Últimos 30 dias")).toBeInTheDocument();
  });

  it("ordena sem repetir a busca upstream", async () => {
    const user = userEvent.setup();
    const searches = stubApi();
    renderPage("/?q=ubuntu");
    await screen.findByRole("table");

    await user.click(within(screen.getByRole("table")).getByRole("button", { name: "Tamanho" }));

    await waitFor(() => expect(searches).toHaveLength(2));
    expect(searches[1].searchParams.get("sort")).toBe("size");
    expect(searches[1].searchParams.get("cachedOnly")).toBe("true");
    expect(screen.getByRole("columnheader", { name: /Tamanho/ })).toHaveAttribute("aria-sort", "descending");
  });

  it("pagina sem repetir a busca upstream", async () => {
    const user = userEvent.setup();
    const searches = stubApi(() =>
      Response.json(
        searchResponse({
          pagination: { page: 1, pageSize: 25, upstreamCount: 120, filteredCount: 120, totalPages: 5, hasMore: true },
        }),
      ),
    );
    renderPage("/?q=ubuntu");

    await user.click(await screen.findByRole("button", { name: "Próxima página" }));

    await waitFor(() => expect(searches).toHaveLength(2));
    expect(searches[1].searchParams.get("page")).toBe("2");
    expect(searches[1].searchParams.get("cachedOnly")).toBe("true");
  });

  it("mostra filtros ativos e permite removê-los", async () => {
    const user = userEvent.setup();
    const searches = stubApi();
    renderPage("/?q=ubuntu&minSeeders=5");

    await user.click(await screen.findByRole("button", { name: "Remover filtro 5+ seeders" }));

    await waitFor(() => expect(searches).toHaveLength(2));
    expect(searches[1].searchParams.has("minSeeders")).toBe(false);
    expect(window.location.search).toBe("?q=ubuntu");
  });

  it("aplica filtro numérico ao sair do campo, não a cada tecla", async () => {
    const user = userEvent.setup();
    const searches = stubApi();
    renderPage("/?q=ubuntu");
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: /^Mais filtros/ }));
    await user.type(await screen.findByLabelText("Seeders mínimos"), "10");
    expect(searches).toHaveLength(1);

    await user.tab();

    await waitFor(() => expect(searches).toHaveLength(2));
    expect(searches[1].searchParams.get("minSeeders")).toBe("10");
  });
});

describe("detalhes", () => {
  it("o título abre a página de detalhes em nova aba", async () => {
    stubApi();
    renderPage("/?q=ubuntu");

    const table = await screen.findByRole("table");
    const title = within(table).getByRole("link", { name: "Ubuntu 24.04" });

    expect(title).toHaveAttribute("href", "/resultado/token-1");
    expect(title).toHaveAttribute("target", "_blank");
  });

  it("mostra o título sem link quando não há token", async () => {
    stubApi(() => Response.json(searchResponse({ results: [resultDto({ torrentActionToken: null })] })));
    renderPage("/?q=ubuntu");

    const table = await screen.findByRole("table");

    expect(within(table).getByText("Ubuntu 24.04")).toBeInTheDocument();
    expect(within(table).queryByRole("link", { name: "Ubuntu 24.04" })).not.toBeInTheDocument();
  });
});

describe("guias", () => {
  it("não consulta os indexadores ao abrir a página", async () => {
    const searches = stubApi();
    renderPage("/");

    expect(await screen.findByText(/Digite um termo/)).toBeInTheDocument();
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(searches).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Mais recentes" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Top downloads" })).toHaveAttribute("aria-pressed", "false");
  });

  it("Mais recentes dispara a lista sem termo", async () => {
    const user = userEvent.setup();
    const searches = stubApi();
    renderPage("/");

    await user.click(screen.getByRole("button", { name: "Mais recentes" }));

    await waitFor(() => expect(searches).toHaveLength(1));
    expect(searches[0].searchParams.has("q")).toBe(false);
    expect(searches[0].searchParams.has("cachedOnly")).toBe(false);
    expect(window.location.search).toBe("?browse=true");
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByText(/Digite um termo/)).not.toBeInTheDocument();
  });

  it("uma URL com a lista aberta volta a carregar", async () => {
    const searches = stubApi();
    renderPage("/?browse=true&sort=seeders");

    await waitFor(() => expect(searches).toHaveLength(1));
    expect(screen.getByRole("button", { name: "Top downloads" })).toHaveAttribute("aria-pressed", "true");
  });

  it("filtrar antes de escolher uma guia não consulta os indexadores", async () => {
    const user = userEvent.setup();
    const searches = stubApi();
    renderPage("/");

    await user.click(screen.getByRole("button", { name: /^Período/ }));
    await user.click(await screen.findByRole("checkbox", { name: "7 dias" }));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(searches).toHaveLength(0);
  });

  it("Top downloads dispara a lista, e trocar de guia não repete a busca upstream", async () => {
    const user = userEvent.setup();
    const searches = stubApi();
    renderPage("/");

    await user.click(screen.getByRole("button", { name: "Top downloads" }));

    await waitFor(() => expect(searches).toHaveLength(1));
    expect(searches[0].searchParams.get("sort")).toBe("seeders");
    expect(screen.getByRole("button", { name: "Top downloads" })).toHaveAttribute("aria-pressed", "true");
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Mais recentes" }));

    await waitFor(() => expect(searches).toHaveLength(2));
    expect(searches[1].searchParams.get("cachedOnly")).toBe("true");
  });

  it("com um termo, as guias só reordenam a busca feita", async () => {
    const user = userEvent.setup();
    const searches = stubApi();
    renderPage("/?q=ubuntu");
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Top downloads" }));

    await waitFor(() => expect(searches).toHaveLength(2));
    expect(searches[1].searchParams.get("q")).toBe("ubuntu");
    expect(searches[1].searchParams.get("cachedOnly")).toBe("true");
  });

  it("volta para a lista de recentes quando o termo é apagado", async () => {
    const user = userEvent.setup();
    const searches = stubApi();
    renderPage("/?q=ubuntu");
    await screen.findByRole("table");

    await user.clear(screen.getByRole("searchbox"));
    await user.keyboard("{Enter}");

    await waitFor(() => expect(searches.at(-1)?.searchParams.has("q")).toBe(false));
    expect(window.location.search).toBe("?browse=true");
  });
});

describe("estados", () => {
  it("mostra skeleton durante a busca", async () => {
    stubApi(() => new Promise(() => undefined));
    renderPage("/?q=ubuntu");

    expect(await screen.findByRole("status", { name: "Consultando indexadores" })).toBeInTheDocument();
  });

  it("mostra estado vazio", async () => {
    stubApi(() =>
      Response.json(
        searchResponse({
          results: [],
          pagination: { page: 1, pageSize: 50, upstreamCount: 0, filteredCount: 0, totalPages: 1, hasMore: false },
        }),
      ),
    );
    renderPage("/?q=ubuntu");

    expect(await screen.findByText("Nenhum resultado para “ubuntu”")).toBeInTheDocument();
  });

  it("oferece limpar filtros quando eles esvaziam a lista", async () => {
    const user = userEvent.setup();
    const searches = stubApi(() =>
      Response.json(
        searchResponse({
          results: [],
          pagination: { page: 1, pageSize: 50, upstreamCount: 10, filteredCount: 0, totalPages: 1, hasMore: false },
        }),
      ),
    );
    renderPage("/?q=ubuntu&minSeeders=500");

    await user.click(await screen.findByRole("button", { name: "Limpar filtros" }));

    await waitFor(() => expect(searches).toHaveLength(2));
    expect(window.location.search).toBe("?q=ubuntu");
  });

  it("avisa sobre resposta parcial mantendo os resultados", async () => {
    stubApi(() =>
      Response.json(
        searchResponse({
          partial: {
            isPartial: true,
            unavailableIndexers: [{ id: 8, name: "Internet Archive", disabledUntil: null }],
          },
        }),
      ),
    );
    renderPage("/?q=ubuntu");

    expect(await screen.findByText(/Resultados parciais/)).toHaveTextContent("Internet Archive");
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("mostra erro e permite nova tentativa", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const searches = stubApi(() => {
      attempts += 1;
      return attempts === 1
        ? Response.json({ error: { code: "search_unavailable", message: "Prowlarr indisponível." } }, { status: 502 })
        : Response.json(searchResponse());
    });
    renderPage("/?q=ubuntu");

    expect(await screen.findByRole("alert")).toHaveTextContent("Prowlarr indisponível.");

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(searches).toHaveLength(2);
    expect(searches[1].searchParams.has("cachedOnly")).toBe(false);
  });

  it("trata resultados expirados sem repetir a busca sozinho", async () => {
    const user = userEvent.setup();
    const searches = stubApi((url) =>
      url.searchParams.has("cachedOnly")
        ? Response.json({ error: { code: "search_expired", message: "Expirou." } }, { status: 409 })
        : Response.json(searchResponse()),
    );
    renderPage("/?q=ubuntu");
    await screen.findByRole("table");

    await user.click(within(screen.getByRole("table")).getByRole("button", { name: "Tamanho" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Os resultados expiraram.");
    expect(searches).toHaveLength(2);
  });
});

describe("ações", () => {
  it("copia o magnet resolvido e confirma", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    stubApi();
    renderPage("/?q=ubuntu");

    const [button] = await screen.findAllByRole("button", { name: /Copiar magnet/ });
    await user.click(button);

    await waitFor(() => {
      expect(toastMock.error.mock.calls).toEqual([]);
      expect(toastMock.success).toHaveBeenCalledWith("Magnet copiado");
    });
    expect(writeText).toHaveBeenCalledWith("magnet:?xt=urn:btih:abc");
  });

  it("recorre à seleção quando o navegador recusa writeText", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new DOMException("Write permission denied.", "NotAllowedError"));
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });
    stubApi();
    renderPage("/?q=ubuntu");

    const [button] = await screen.findAllByRole("button", { name: /Copiar magnet/ });
    await user.click(button);

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Magnet copiado"));
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("orienta o usuário quando nenhuma forma de cópia é permitida", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new DOMException("Write permission denied.", "NotAllowedError"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    Object.defineProperty(document, "execCommand", { value: vi.fn().mockReturnValue(false), configurable: true });
    stubApi();
    renderPage("/?q=ubuntu");

    const [button] = await screen.findAllByRole("button", { name: /Copiar magnet/ });
    await user.click(button);

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("O navegador não permitiu copiar. Use o botão do ímã."),
    );
  });

  it("abre o cliente de torrent por um link direto, como nos sites comuns", async () => {
    stubApi();
    renderPage("/?q=ubuntu");

    const [link] = await screen.findAllByRole("link", { name: /Abrir no cliente de torrent/ });

    expect(link).toHaveAttribute("href", "/api/results/token-1/torrent");
    expect(link).not.toHaveAttribute("target");
  });

  it("usa o magnet no link quando o indexador já o informa", async () => {
    const magnetUrl = "magnet:?xt=urn:btih:abc";
    stubApi(() => Response.json(searchResponse({ results: [resultDto({ magnetUrl, torrentActionToken: null })] })));
    renderPage("/?q=ubuntu");

    const [link] = await screen.findAllByRole("link", { name: /Abrir no cliente de torrent/ });

    expect(link).toHaveAttribute("href", magnetUrl);
  });

  it("desabilita ações quando não há magnet nem token", async () => {
    stubApi(() =>
      Response.json(
        searchResponse({ results: [resultDto({ torrentActionToken: null, magnetUrl: null, infoUrl: null })] }),
      ),
    );
    renderPage("/?q=ubuntu");

    const [button] = await screen.findAllByRole("button", { name: /Copiar magnet/ });

    expect(button).toBeDisabled();
  });
});
