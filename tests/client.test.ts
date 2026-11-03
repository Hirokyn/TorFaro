import { beforeEach, describe, expect, it, vi } from "vitest";

import { getConfig } from "@/lib/config";
import { buildSearchParams, getIndexers, ProwlarrError, searchReleases, withTimeout } from "@/lib/prowlarr/client";

import { API_KEY, stubAppEnv, stubProwlarr, upstreamResult } from "./helpers";

beforeEach(stubAppEnv);

describe("configuração", () => {
  it("cita o nome da variável inválida sem mostrar valores", () => {
    process.env.PROWLARR_API_KEY = "curta";

    expect(() => getConfig()).toThrow("PROWLARR_API_KEY");
    expect(() => getConfig()).not.toThrow("curta");
  });
});

describe("buildSearchParams", () => {
  it("serializa vários indexadores como parâmetros repetidos", () => {
    expect(buildSearchParams("ubuntu", [1, 5]).toString()).toContain("indexerIds=1&indexerIds=5");
    expect(buildSearchParams("ubuntu", [1, 5]).toString()).not.toContain("%2C");
  });

  it("usa o agregador de torrents quando nenhum indexador é escolhido", () => {
    expect(buildSearchParams("ubuntu", []).getAll("indexerIds")).toEqual(["-2"]);
  });
});

describe("requisições ao Prowlarr", () => {
  it("autentica por header, sem API key na URL", async () => {
    const fetchMock = stubProwlarr([{ match: /indexer$/, respond: () => Response.json([]) }]);

    await getIndexers();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).not.toContain(API_KEY);
    expect(init.headers).toMatchObject({ "X-Api-Key": API_KEY });
  });

  it("descarta item malformado sem perder o restante", async () => {
    stubProwlarr([
      { match: /search$/, respond: () => Response.json([{ title: 1 }, upstreamResult()]) },
    ]);

    await expect(searchReleases("ubuntu", [])).resolves.toHaveLength(1);
  });

  it("não vaza a URL interna na mensagem de erro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED prowlarr.internal:9696")));

    const error = await getIndexers().catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ProwlarrError);
    expect((error as ProwlarrError).kind).toBe("unreachable");
    expect((error as Error).message).not.toContain("prowlarr.internal");
  });

  it("não repete a busca quando ela falha", async () => {
    const fetchMock = stubProwlarr([{ match: /search$/, respond: () => new Response(null, { status: 500 }) }]);

    await expect(searchReleases("ubuntu", [])).rejects.toMatchObject({ kind: "http", status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("withTimeout", () => {
  const untilAborted = (signal: AbortSignal) =>
    new Promise<never>((_, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")));
    });

  it("classifica estouro de tempo", async () => {
    await expect(withTimeout(5, undefined, untilAborted)).rejects.toMatchObject({ kind: "timeout" });
  });

  it("classifica cancelamento do chamador", async () => {
    const controller = new AbortController();
    const pending = withTimeout(5_000, controller.signal, untilAborted);

    controller.abort();

    await expect(pending).rejects.toMatchObject({ kind: "aborted" });
  });
});
