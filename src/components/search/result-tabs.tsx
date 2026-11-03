"use client";

import { Clock, Flame } from "lucide-react";

import type { SortField, SortOrder } from "@/lib/search/params";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Mais recentes", short: "Recentes", sort: "publishedAt", icon: Clock, title: "Lançamentos mais novos primeiro" },
  { label: "Top downloads", short: "Top", sort: "seeders", icon: Flame, title: "Mais seeders primeiro" },
] as const;

type ResultTabsProps = {
  sort: SortField;
  order: SortOrder;
  idle: boolean;
  onSelect: (sort: SortField) => void;
};

export function ResultTabs({ sort, order, idle, onSelect }: ResultTabsProps) {
  return (
    <div role="group" aria-label="Guias de resultados" className="flex shrink-0 gap-1">
      {TABS.map((tab) => {
        const active = !idle && sort === tab.sort && order === "desc";

        return (
          <button
            key={tab.sort}
            type="button"
            aria-label={tab.label}
            aria-pressed={active}
            title={tab.title}
            onClick={() => onSelect(tab.sort)}
            className={cn(
              "-mb-px inline-flex h-9 items-center gap-1.5 border-b-2 px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <tab.icon className="size-3.5" aria-hidden />
            <span className="max-sm:hidden">{tab.label}</span>
            <span className="sm:hidden">{tab.short}</span>
          </button>
        );
      })}
    </div>
  );
}
