"use client";

import { Copy } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { IndexerIcon } from "@/components/search/indexer-icon";
import { ResultCategory, ResultTags } from "@/components/search/result-parts";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/client/clipboard";
import type { ResultPageResponse } from "@/lib/contracts";
import { formatBytes, formatCount, formatDate } from "@/lib/format";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

function InfoHash({ value }: { value: string }) {
  async function copyHash() {
    try {
      await copyText(value);
      toast.success("Infohash copiado");
    } catch {
      toast.error("O navegador não permitiu copiar.");
    }
  }

  return (
    <span className="flex min-w-0 items-center gap-1">
      <code className="truncate font-mono text-xs">{value}</code>
      <Button variant="ghost" size="icon-xs" aria-label="Copiar infohash" onClick={copyHash}>
        <Copy aria-hidden />
      </Button>
    </span>
  );
}

export function ResultFacts({ result, details }: ResultPageResponse) {
  const infoHash = details?.infoHash ?? result.infoHash;
  const pieceInfo = details?.pieceCount && details.pieceSize ? details : null;

  return (
    <section aria-label="Informações" className="flex flex-col gap-1.5">
      <h2 className="text-sm font-medium">Informações</h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 rounded-lg border p-3 md:grid-cols-3">
        <Fact label="Fonte">
          <span className="flex items-center gap-1.5">
            <IndexerIcon id={result.indexerId} name={result.indexerName} className="size-5" />
            {result.indexerName}
          </span>
        </Fact>
        <Fact label="Categoria">
          <ResultCategory result={result} />
        </Fact>
        {(result.quality || result.codec) && (
          <Fact label="Formato">
            <ResultTags result={result} />
          </Fact>
        )}
        {result.grabs !== null && <Fact label="Downloads">{formatCount(result.grabs)}</Fact>}
        {pieceInfo && (
          <Fact label="Peças">
            {formatCount(pieceInfo.pieceCount)} de {formatBytes(pieceInfo.pieceSize)}
          </Fact>
        )}
        {details?.createdAt && <Fact label="Criado em">{formatDate(details.createdAt)}</Fact>}
        {details?.createdBy && <Fact label="Criado com">{details.createdBy}</Fact>}
        {details?.comment && <Fact label="Comentário">{details.comment}</Fact>}
        {infoHash && (
          <div className="col-span-2 min-w-0 md:col-span-3">
            <Fact label="Infohash">
              <InfoHash value={infoHash} />
            </Fact>
          </div>
        )}
      </dl>
    </section>
  );
}
