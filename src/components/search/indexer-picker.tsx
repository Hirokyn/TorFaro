"use client";

import { ChevronDown } from "lucide-react";

import { IndexerIcon } from "@/components/search/indexer-icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { IndexerDto } from "@/lib/contracts";
import { formatTime } from "@/lib/format";

type IndexerPickerProps = {
  indexers: IndexerDto[];
  // Lista vazia significa todos os indexadores habilitados.
  selectedIds: number[];
  onChange: (ids: number[]) => void;
};

function triggerLabel(indexers: IndexerDto[], selectedIds: number[]) {
  if (selectedIds.length === 0) return "Todos os indexadores";
  if (selectedIds.length === 1) {
    return indexers.find(({ id }) => id === selectedIds[0])?.name ?? "1 indexador";
  }
  return `${selectedIds.length} indexadores`;
}

export function IndexerPicker({ indexers, selectedIds, onChange }: IndexerPickerProps) {
  const allIds = indexers.map(({ id }) => id);
  const isSelected = (id: number) => selectedIds.length === 0 || selectedIds.includes(id);

  function toggle(id: number) {
    const base = selectedIds.length === 0 ? allIds : selectedIds;
    const next = base.includes(id) ? base.filter((value) => value !== id) : [...base, id];
    onChange(next.length === allIds.length ? [] : next.sort((a, b) => a - b));
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-10 min-w-0 justify-between sm:w-52">
          <span className="truncate">{triggerLabel(indexers, selectedIds)}</span>
          <ChevronDown aria-hidden className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-1 p-2">
        {indexers.length === 0 && <p className="p-2 text-sm text-muted-foreground">Nenhum indexador disponível.</p>}

        <ul className="flex flex-col">
          {indexers.map((indexer) => {
            const checkboxId = `indexer-${indexer.id}`;

            return (
              <li key={indexer.id}>
                <label
                  htmlFor={checkboxId}
                  className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm hover:bg-muted"
                >
                  <Checkbox
                    id={checkboxId}
                    checked={isSelected(indexer.id)}
                    onCheckedChange={() => toggle(indexer.id)}
                  />
                  <IndexerIcon id={indexer.id} name={indexer.name} />
                  <span className="min-w-0 flex-1 truncate">{indexer.name}</span>
                  {!indexer.available && (
                    <span className="shrink-0 text-xs text-amber-700 dark:text-amber-400">
                      {indexer.disabledUntil ? `falhou · volta ${formatTime(indexer.disabledUntil)}` : "falhou"}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>

        {selectedIds.length > 0 && (
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => onChange([])}>
            Selecionar todos
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
