import { ArrowUp } from "lucide-react";

import { ResultActions } from "@/components/search/result-actions";
import {
  PublishedDate,
  ResultCategory,
  ResultSources,
  ResultTags,
  ResultTitle,
  SeedersValue,
} from "@/components/search/result-parts";
import type { SearchResultDto } from "@/lib/contracts";
import { formatBytes } from "@/lib/format";

function ResultItem({ result }: { result: SearchResultDto }) {
  return (
    <li className="flex flex-col gap-0.5 border-b py-1.5 last:border-b-0">
      <p className="line-clamp-2 text-[13px] leading-snug font-medium break-words">
        <ResultTitle result={result} />
      </p>

      <div className="flex items-center justify-between gap-2">
        <dl className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <div>
            <dt className="sr-only">Fonte</dt>
            <dd className="flex">
              <ResultSources result={result} />
            </dd>
          </div>
          <div>
            <dt className="sr-only">Categoria</dt>
            <dd className="flex">
              <ResultCategory result={result} />
            </dd>
          </div>
          <div className="flex items-center gap-0.5">
            <dt>
              <ArrowUp className="size-3" aria-hidden />
              <span className="sr-only">Seeders</span>
            </dt>
            <dd>
              <SeedersValue value={result.seeders} />
            </dd>
          </div>
          <div>
            <dt className="sr-only">Tamanho</dt>
            <dd className="tabular-nums">{formatBytes(result.size)}</dd>
          </div>
          <div>
            <dt className="sr-only">Publicado</dt>
            <dd>
              <PublishedDate value={result.publishedAt} compact />
            </dd>
          </div>
          <div>
            <dt className="sr-only">Resolução</dt>
            <dd>
              <ResultTags result={result} compact />
            </dd>
          </div>
        </dl>
        <ResultActions result={result} />
      </div>
    </li>
  );
}

export function ResultsList({ results }: { results: SearchResultDto[] }) {
  return (
    <ul>
      {results.map((result) => (
        <ResultItem key={result.id} result={result} />
      ))}
    </ul>
  );
}
