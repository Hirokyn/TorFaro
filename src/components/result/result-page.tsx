"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Copy, ExternalLink, LoaderCircle, Magnet } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ResultFacts } from "@/components/result/result-facts";
import { FileList, TrackerList } from "@/components/result/torrent-sections";
import { AppHeader } from "@/components/search/app-header";
import { SeedersValue } from "@/components/search/result-parts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useResultActions } from "@/hooks/use-result-actions";
import { getJson } from "@/lib/client/api";
import type { ResultPageResponse, SearchResultDto } from "@/lib/contracts";
import { formatBytes, formatCount, formatDate } from "@/lib/format";

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

function imdbUrl(imdbId: number) {
  return `https://www.imdb.com/title/tt${String(imdbId).padStart(7, "0")}/`;
}

function ResultButtons({ result }: { result: SearchResultDto }) {
  const { openHref, copying, copied, copyMagnet } = useResultActions(result);

  return (
    <div className="flex flex-wrap gap-2">
      {openHref && (
        <Button size="lg" className="px-4" asChild>
          <a href={openHref}>
            <Magnet aria-hidden />
            Abrir no cliente de torrent
          </a>
        </Button>
      )}
      {openHref && (
        <Button variant="outline" size="lg" className="px-4" disabled={copying} onClick={copyMagnet}>
          {copying ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : copied ? (
            <Check aria-hidden />
          ) : (
            <Copy aria-hidden />
          )}
          Copiar magnet
        </Button>
      )}
      {result.imdbId !== null && (
        <Button variant="outline" size="lg" className="px-4" asChild>
          <a href={imdbUrl(result.imdbId)} target="_blank" rel="noopener noreferrer">
            IMDb
            <ExternalLink aria-hidden />
          </a>
        </Button>
      )}
      {result.infoUrl && (
        <Button variant="outline" size="lg" className="px-4" asChild>
          <a href={result.infoUrl} target="_blank" rel="noopener noreferrer">
            Página original
            <ExternalLink aria-hidden />
          </a>
        </Button>
      )}
    </div>
  );
}

function ResultContent({ result, details }: ResultPageResponse) {
  return (
    <article className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold tracking-tight break-words">{result.title}</h1>

      <ResultButtons result={result} />

      <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Seeders">
          <SeedersValue value={result.seeders} />
        </Stat>
        <Stat label="Leechers">{formatCount(result.leechers)}</Stat>
        <Stat label="Tamanho">{formatBytes(result.size)}</Stat>
        <Stat label="Publicado">
          <span className="text-sm">{formatDate(result.publishedAt)}</span>
        </Stat>
      </dl>

      <ResultFacts result={result} details={details} />

      {details === null && (
        <p role="status" className="text-sm text-muted-foreground">
          A fonte não respondeu agora. Arquivos e trackers não puderam ser carregados.
        </p>
      )}

      {details && <FileList details={details} knownCount={result.files} />}
      {details && <TrackerList trackers={details.trackers} />}
    </article>
  );
}

function ResultLoading() {
  return (
    <div role="status" aria-label="Carregando detalhes" className="flex flex-col gap-4">
      <Skeleton className="h-7 w-3/4" />
      <Skeleton className="h-9 w-64" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
      <Skeleton className="h-40" />
    </div>
  );
}

export function ResultPage({ token }: { token: string }) {
  const { data, error, isPending } = useQuery({
    queryKey: ["result", token],
    queryFn: ({ signal }) => getJson<ResultPageResponse>(`/api/results/${token}/details`, { signal }),
    staleTime: Infinity,
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 px-4 pb-6">
      <AppHeader />

      <nav>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">
            <ArrowLeft aria-hidden />
            Voltar para a busca
          </Link>
        </Button>
      </nav>

      <main>
        {isPending && <ResultLoading />}
        {error && (
          <p role="alert" className="py-6 text-sm font-medium">
            {error.message}
          </p>
        )}
        {data && <ResultContent {...data} />}
      </main>
    </div>
  );
}
