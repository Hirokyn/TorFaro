// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IndexerIcon, indexerMonogram } from "@/components/search/indexer-icon";
import { visiblePages } from "@/components/search/results-pagination";

describe("indexerMonogram", () => {
  it.each([
    ["1337x", "13"],
    ["Nyaa.si", "NY"],
    ["YTS", "YT"],
    ["EZTV", "EZ"],
    ["The Pirate Bay", "PB"],
    ["Internet Archive", "IA"],
    ["LimeTorrents", "LT"],
    ["TorrentsCSV", "TC"],
    ["TorrentProject2", "TP"],
    ["ExtraTorrent.st", "ET"],
    ["Torrent Downloads", "TD"],
    ["", "?"],
  ])("resume %s como %s", (name, monogram) => {
    expect(indexerMonogram(name)).toBe(monogram);
  });

  it("gera siglas distintas para os indexadores instalados", () => {
    const names = ["1337x", "Nyaa.si", "YTS", "EZTV", "The Pirate Bay", "Internet Archive"];

    expect(new Set(names.map(indexerMonogram)).size).toBe(names.length);
  });
});

describe("IndexerIcon", () => {
  it("expõe o nome completo para tecnologia assistiva e no hover", () => {
    render(<IndexerIcon id={17} name="TorrentsCSV" />);

    const icon = screen.getByRole("img", { name: "TorrentsCSV" });

    expect(icon).toHaveTextContent("TC");
    expect(icon).toHaveAttribute("title", "TorrentsCSV");
  });

  it("usa a logo real quando existe", () => {
    const { container } = render(<IndexerIcon id={5} name="The Pirate Bay" />);

    expect(screen.getByRole("img", { name: "The Pirate Bay" })).toHaveAttribute("title", "The Pirate Bay");
    expect(container.querySelector("img")).toHaveAttribute("src", expect.stringContaining("/indexers/thepiratebay.png"));
  });

  it("volta para a sigla quando o arquivo da logo não existe", () => {
    const { container } = render(<IndexerIcon id={5} name="The Pirate Bay" />);

    fireEvent.error(container.querySelector("img")!);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: "The Pirate Bay" })).toHaveTextContent("PB");
  });

  it("usa a mesma logo para os dois domínios da kickasstorrents", () => {
    const { container } = render(
      <>
        <IndexerIcon id={13} name="kickasstorrents.to" />
        <IndexerIcon id={14} name="kickasstorrents.ws" />
      </>,
    );

    const sources = [...container.querySelectorAll("img")].map((image) => new URL(image.src).pathname);

    expect(new Set(sources)).toEqual(new Set(["/indexers/kickasstorrentsto.png"]));
  });
});

describe("visiblePages", () => {
  it("mostra todas as páginas quando são poucas", () => {
    expect(visiblePages(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it("resume os intervalos longos", () => {
    expect(visiblePages(10, 20)).toEqual([1, "gap", 9, 10, 11, "gap", 20]);
    expect(visiblePages(1, 20)).toEqual([1, 2, "gap", 20]);
    expect(visiblePages(20, 20)).toEqual([1, "gap", 19, 20]);
  });

  it("não troca uma única página oculta por reticências", () => {
    expect(visiblePages(4, 8)).toEqual([1, 2, 3, 4, 5, "gap", 8]);
  });

  it("funciona com página única", () => {
    expect(visiblePages(1, 1)).toEqual([1]);
  });
});
