"use client";

import { ArrowDown, ArrowUp } from "lucide-react";

import { ResultActions } from "@/components/search/result-actions";
import {
  PublishedDate,
  ResultCategory,
  ResultSources,
  ResultTags,
  ResultTitle,
  SeedersValue,
} from "@/components/search/result-parts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SearchResultDto } from "@/lib/contracts";
import { formatBytes, formatCount } from "@/lib/format";
import type { SortField, SortOrder } from "@/lib/search/params";
import { cn } from "@/lib/utils";

type SortProps = {
  sort: SortField;
  order: SortOrder;
  onSort: (field: SortField) => void;
};

type Column = {
  field: SortField;
  label: string;
  className: string;
  align?: "right";
};

const LEADING_COLUMNS: Column[] = [
  { field: "indexer", label: "Fonte", className: "w-16" },
  { field: "title", label: "Título", className: "" },
];

const TRAILING_COLUMNS: Column[] = [
  { field: "size", label: "Tamanho", className: "w-24", align: "right" },
  { field: "seeders", label: "Seeders", className: "w-20", align: "right" },
  { field: "leechers", label: "Leechers", className: "w-20 max-lg:hidden", align: "right" },
  { field: "publishedAt", label: "Publicado", className: "w-28", align: "right" },
];

function SortableHead({ column, sort, order, onSort }: SortProps & { column: Column }) {
  const active = sort === column.field;
  const Icon = order === "asc" ? ArrowUp : ArrowDown;

  return (
    <TableHead
      aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"}
      className={cn("h-9 px-3", column.className, column.align === "right" && "text-right")}
    >
      <button
        type="button"
        onClick={() => onSort(column.field)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm text-xs outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
          active ? "text-foreground" : "text-muted-foreground",
          column.align === "right" && "flex-row-reverse",
        )}
      >
        {column.label}
        {active && <Icon className="size-3" aria-hidden />}
      </button>
    </TableHead>
  );
}

function PlainHead({ label, className }: { label: string; className: string }) {
  return <TableHead className={cn("h-9 px-3 text-xs font-normal text-muted-foreground", className)}>{label}</TableHead>;
}

function ResultRow({ result }: { result: SearchResultDto }) {
  return (
    <TableRow className="h-10">
      <TableCell className="px-3 py-1">
        <ResultSources result={result} />
      </TableCell>
      <TableCell className="max-w-0 px-3 py-1" title={result.title}>
        <ResultTitle result={result} className="block truncate text-sm font-medium" />
      </TableCell>
      <TableCell className="px-3 py-1">
        <ResultCategory result={result} />
      </TableCell>
      <TableCell className="truncate px-3 py-1 max-xl:hidden">
        <ResultTags result={result} />
      </TableCell>
      <TableCell className="px-3 py-1 text-right text-sm tabular-nums">{formatBytes(result.size)}</TableCell>
      <TableCell className="px-3 py-1 text-right text-sm">
        <SeedersValue value={result.seeders} />
      </TableCell>
      <TableCell className="px-3 py-1 text-right text-sm text-muted-foreground tabular-nums max-lg:hidden">
        {formatCount(result.leechers)}
      </TableCell>
      <TableCell className="truncate px-3 py-1 text-right text-sm text-muted-foreground">
        <PublishedDate value={result.publishedAt} />
      </TableCell>
      <TableCell className="px-2 py-1">
        <ResultActions result={result} />
      </TableCell>
    </TableRow>
  );
}

export function ResultsTable({ results, ...sortProps }: SortProps & { results: SearchResultDto[] }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table className="table-fixed">
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            {LEADING_COLUMNS.map((column) => (
              <SortableHead key={column.field} column={column} {...sortProps} />
            ))}
            <PlainHead label="Categoria" className="w-24" />
            <PlainHead label="Formato" className="w-28 max-xl:hidden" />
            {TRAILING_COLUMNS.map((column) => (
              <SortableHead key={column.field} column={column} {...sortProps} />
            ))}
            <TableHead className="h-9 w-28 px-2">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((result) => (
            <ResultRow key={result.id} result={result} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
