"use client";

import { LoaderCircle, Search } from "lucide-react";
import { type FormEvent, useState } from "react";

import { IndexerPicker } from "@/components/search/indexer-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { IndexerDto } from "@/lib/contracts";
import { isSearchableTerm, MAX_QUERY_LENGTH, MIN_QUERY_LENGTH } from "@/lib/search/params";

type SearchFormProps = {
  query: string;
  indexerIds: number[];
  indexers: IndexerDto[];
  searching: boolean;
  onSubmit: (query: string, indexerIds: number[]) => void;
};

export function SearchForm({ query, indexerIds, indexers, searching, onSubmit }: SearchFormProps) {
  const applied = `${query}|${indexerIds.join(",")}`;
  const [lastApplied, setLastApplied] = useState(applied);
  const [draftQuery, setDraftQuery] = useState(query);
  const [draftIds, setDraftIds] = useState<number[] | null>(null);
  const [tooShort, setTooShort] = useState(false);

  // Voltar no histórico muda a URL: o rascunho acompanha sem remontar o campo, que perderia o foco.
  if (applied !== lastApplied) {
    setLastApplied(applied);
    setDraftQuery(query);
    setDraftIds(null);
    setTooShort(false);
  }

  const selectedIds = draftIds ?? indexerIds;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = draftQuery.trim();

    if (!isSearchableTerm(term)) {
      setTooShort(true);
      return;
    }

    setTooShort(false);
    onSubmit(term, selectedIds);
  }

  return (
    <form role="search" onSubmit={handleSubmit} className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            name="q"
            aria-label="Termo de busca"
            aria-invalid={tooShort}
            aria-describedby={tooShort ? "query-error" : undefined}
            autoComplete="off"
            autoFocus
            maxLength={MAX_QUERY_LENGTH}
            placeholder="Buscar"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            className="h-10 pl-9 text-base md:text-sm"
          />
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex">
          <IndexerPicker indexers={indexers} selectedIds={selectedIds} onChange={setDraftIds} />
          <Button type="submit" className="h-10 px-4">
            {searching ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            Buscar
          </Button>
        </div>
      </div>

      {tooShort && (
        <p id="query-error" role="alert" className="text-sm text-destructive">
          Digite pelo menos {MIN_QUERY_LENGTH} caracteres.
        </p>
      )}
    </form>
  );
}
