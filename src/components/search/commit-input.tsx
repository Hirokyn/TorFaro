"use client";

import { type ComponentProps, type KeyboardEvent, useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CommitInputProps = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "onBlur" | "onKeyDown"> & {
  id: string;
  label: string;
  value: string;
  onCommit: (value: string) => void;
};

// Aplica o valor ao sair do campo ou com Enter, para não refazer a listagem a cada tecla.
export function CommitInput({ id, label, value, onCommit, ...props }: CommitInputProps) {
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  const pending = useRef({ draft, value, onCommit });

  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }

  useEffect(() => {
    pending.current = { draft, value, onCommit };
  });

  // Fechar o menu desmonta o campo sem disparar blur; o texto digitado não pode se perder.
  useEffect(
    () => () => {
      const latest = pending.current;
      if (latest.draft !== latest.value) latest.onCommit(latest.draft);
    },
    [],
  );

  function commit() {
    if (draft !== value) onCommit(draft);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        {...props}
      />
    </div>
  );
}
