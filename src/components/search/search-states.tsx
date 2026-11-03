import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { UnavailableIndexer } from "@/lib/contracts";
import { formatTime } from "@/lib/format";

const SKELETON_ROWS = Array.from({ length: 16 }, (_, index) => index);

export function ResultsSkeleton() {
  return (
    <div role="status" aria-label="Consultando indexadores">
      <p className="mb-2 text-sm text-muted-foreground">Consultando indexadores…</p>
      <div className="flex flex-col" aria-hidden>
        {SKELETON_ROWS.map((row) => (
          <div key={row} className="flex h-10 items-center gap-4 border-b px-2">
            <Skeleton className="size-5" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3.5 w-16 max-md:hidden" />
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-3.5 w-10 max-md:hidden" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Message({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 py-8">
      <p className="text-sm font-medium">{title}</p>
      {children}
    </div>
  );
}

export function IdlePrompt() {
  return <Message title="Digite um termo ou escolha Mais recentes ou Top downloads." />;
}

export function EmptyResults({
  query,
  hasFilters,
  onClearFilters,
}: {
  query: string;
  hasFilters: boolean;
  onClearFilters: () => void;
}) {
  if (hasFilters) {
    return (
      <Message title="Nenhum resultado com os filtros atuais">
        <Button variant="outline" size="sm" onClick={onClearFilters}>
          Limpar filtros
        </Button>
      </Message>
    );
  }

  return <Message title={query ? `Nenhum resultado para “${query}”` : "Nenhum resultado"} />;
}

export function SearchError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert">
      <Message title={message}>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      </Message>
    </div>
  );
}

export function PartialNotice({ indexers }: { indexers: UnavailableIndexer[] }) {
  const description = indexers
    .map(({ name, disabledUntil }) => (disabledUntil ? `${name} (volta às ${formatTime(disabledUntil)})` : name))
    .join(", ");

  return (
    <p role="status" className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>Resultados parciais. Sem resposta de: {description}.</span>
    </p>
  );
}
