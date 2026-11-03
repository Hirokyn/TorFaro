"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Pagination } from "@/lib/contracts";
import { formatCount } from "@/lib/format";
import { PAGE_SIZES, type PageSize } from "@/lib/search/params";

const NEIGHBOR_PAGES = 1;

export function visiblePages(page: number, totalPages: number): (number | "gap")[] {
  const wanted = new Set([1, totalPages]);
  for (let offset = -NEIGHBOR_PAGES; offset <= NEIGHBOR_PAGES; offset += 1) {
    const candidate = page + offset;
    if (candidate >= 1 && candidate <= totalPages) wanted.add(candidate);
  }

  const pages = [...wanted].sort((a, b) => a - b);

  return pages.flatMap((current, index) => {
    const gap = current - (pages[index - 1] ?? current);
    if (gap === 2) return [current - 1, current];
    return gap > 2 ? (["gap", current] as const) : [current];
  });
}

export function ResultsSummary({ pagination }: { pagination: Pagination | undefined }) {
  if (!pagination) return <p role="status" />;

  const { page, pageSize, filteredCount, upstreamCount } = pagination;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, filteredCount);

  return (
    <p role="status" className="truncate text-sm text-muted-foreground tabular-nums">
      {filteredCount === 0 ? "Nenhum resultado" : `${formatCount(first)}–${formatCount(last)} de ${formatCount(filteredCount)}`}
      {filteredCount !== upstreamCount && <span className="max-sm:hidden"> · {formatCount(upstreamCount)} no total</span>}
    </p>
  );
}

type ResultsPaginationProps = {
  pagination: Pagination;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: PageSize) => void;
};

function PageNumbers({ pagination, onPageChange }: Omit<ResultsPaginationProps, "onPageSizeChange">) {
  const { page, totalPages, hasMore } = pagination;

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        aria-label="Página anterior"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft aria-hidden />
        <span className="max-sm:hidden">Anterior</span>
      </Button>

      <ol className="flex items-center gap-0.5">
        {visiblePages(page, totalPages).map((item, index) => (
          <li key={item === "gap" ? `gap-${index}` : item}>
            {item === "gap" ? (
              <span aria-hidden className="inline-flex size-8 items-center justify-center text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                variant={item === page ? "default" : "ghost"}
                size="icon"
                aria-label={`Página ${item}`}
                aria-current={item === page ? "page" : undefined}
                className="min-w-8 tabular-nums"
                onClick={() => onPageChange(item)}
              >
                {item}
              </Button>
            )}
          </li>
        ))}
      </ol>

      <Button
        variant="ghost"
        size="sm"
        aria-label="Próxima página"
        disabled={!hasMore}
        onClick={() => onPageChange(page + 1)}
      >
        <span className="max-sm:hidden">Próxima</span>
        <ChevronRight aria-hidden />
      </Button>
    </div>
  );
}

export function ResultsPagination({ pagination, onPageChange, onPageSizeChange }: ResultsPaginationProps) {
  return (
    <nav
      aria-label="Paginação"
      className="sticky bottom-0 z-10 grid grid-cols-1 items-center justify-items-center gap-2 border-t bg-background/95 py-1.5 backdrop-blur-sm md:grid-cols-[1fr_auto_1fr]"
    >
      <span className="max-md:hidden" />

      <PageNumbers pagination={pagination} onPageChange={onPageChange} />

      <div className="max-md:hidden md:justify-self-end">
        <Select
          value={String(pagination.pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value) as PageSize)}
        >
          <SelectTrigger size="sm" aria-label="Resultados por página">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} por página
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </nav>
  );
}
