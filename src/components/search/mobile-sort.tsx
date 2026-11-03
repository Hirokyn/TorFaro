"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SORT_FIELDS, type SortField, type SortOrder } from "@/lib/search/params";

const SORT_LABELS: Record<SortField, string> = {
  publishedAt: "Recentes",
  seeders: "Seeders",
  leechers: "Leechers",
  size: "Tamanho",
  title: "Título",
  indexer: "Fonte",
};

type MobileSortProps = {
  sort: SortField;
  order: SortOrder;
  onChange: (sort: SortField, order: SortOrder) => void;
};

export function MobileSort({ sort, order, onChange }: MobileSortProps) {
  return (
    <Select
      value={`${sort}:${order}`}
      onValueChange={(value) => {
        const [field, direction] = value.split(":");
        onChange(field as SortField, direction as SortOrder);
      }}
    >
      <SelectTrigger size="sm" aria-label="Ordenar por" className="rounded-full md:hidden">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {SORT_FIELDS.flatMap((field) =>
          (["desc", "asc"] as const).map((direction) => (
            <SelectItem key={`${field}:${direction}`} value={`${field}:${direction}`}>
              {SORT_LABELS[field]} {direction === "desc" ? "↓" : "↑"}
            </SelectItem>
          )),
        )}
      </SelectContent>
    </Select>
  );
}
