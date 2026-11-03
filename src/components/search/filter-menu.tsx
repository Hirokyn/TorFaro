"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type FilterMenuProps = {
  label: string;
  activeCount?: number;
  disabled?: boolean;
  contentClassName?: string;
  children: ReactNode;
};

export function FilterMenu({ label, activeCount = 0, disabled, contentClassName, children }: FilterMenuProps) {
  const active = activeCount > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn("rounded-full px-3", active && "border-foreground/50 bg-muted")}
        >
          {label}
          {active && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">
              {activeCount}
            </span>
          )}
          <ChevronDown aria-hidden className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("w-60 gap-0 p-1.5", contentClassName)}>
        <div className="flex max-h-80 flex-col overflow-y-auto">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

type FilterOptionProps = {
  id: string;
  checked: boolean;
  count?: number;
  children: ReactNode;
  onChange: (checked: boolean) => void;
};

export function FilterOption({ id, checked, count, children, onChange }: FilterOptionProps) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-1.5 text-[13px] hover:bg-muted"
    >
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <span className="flex min-w-0 flex-1 items-center gap-1.5">{children}</span>
      {count !== undefined && <span className="text-xs text-muted-foreground tabular-nums">{count}</span>}
    </label>
  );
}
