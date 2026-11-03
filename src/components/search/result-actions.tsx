"use client";

import { Check, Copy, ExternalLink, LoaderCircle, Magnet } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useResultActions } from "@/hooks/use-result-actions";
import type { SearchResultDto } from "@/lib/contracts";

function ActionButton({ label, children, ...props }: ComponentProps<typeof Button> & { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label.split(":")[0]}</TooltipContent>
    </Tooltip>
  );
}

export function ResultActions({ result }: { result: SearchResultDto }) {
  const { openHref, copying, copied, copyMagnet } = useResultActions(result);

  return (
    <div className="flex items-center justify-end gap-0.5">
      {openHref ? (
        <ActionButton label={`Abrir no cliente de torrent: ${result.title}`} className="text-primary" asChild>
          <a href={openHref}>
            <Magnet aria-hidden />
          </a>
        </ActionButton>
      ) : (
        <ActionButton label="Magnet indisponível" disabled>
          <Magnet aria-hidden />
        </ActionButton>
      )}

      <ActionButton
        label={`Copiar magnet: ${result.title}`}
        disabled={openHref === null || copying}
        onClick={copyMagnet}
      >
        {copying ? (
          <LoaderCircle className="animate-spin" aria-hidden />
        ) : copied ? (
          <Check className="text-emerald-600 dark:text-emerald-400" aria-hidden />
        ) : (
          <Copy aria-hidden />
        )}
      </ActionButton>

      {result.infoUrl ? (
        <ActionButton label={`Ver na origem: ${result.title}`} asChild>
          <a href={result.infoUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden />
          </a>
        </ActionButton>
      ) : (
        <ActionButton label="Origem indisponível" disabled>
          <ExternalLink aria-hidden />
        </ActionButton>
      )}
    </div>
  );
}
