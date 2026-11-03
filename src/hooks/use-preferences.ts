"use client";

import { useCallback, useSyncExternalStore } from "react";
import { z } from "zod";

import { DEFAULT_SEARCH_STATE, PAGE_SIZES } from "@/lib/search/params";

const STORAGE_KEY = "torfaro:preferences";

const preferencesSchema = z.object({
  pageSize: z.literal(PAGE_SIZES).catch(DEFAULT_SEARCH_STATE.pageSize),
  deduplicate: z.boolean().catch(DEFAULT_SEARCH_STATE.deduplicate),
});

export type Preferences = z.output<typeof preferencesSchema>;

const DEFAULT_PREFERENCES: Preferences = {
  pageSize: DEFAULT_SEARCH_STATE.pageSize,
  deduplicate: DEFAULT_SEARCH_STATE.deduplicate,
};

const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedValue = DEFAULT_PREFERENCES;

function readPreferences() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedValue;

    cachedRaw = raw;
    cachedValue = raw ? preferencesSchema.parse(JSON.parse(raw)) : DEFAULT_PREFERENCES;
  } catch {
    cachedValue = DEFAULT_PREFERENCES;
  }
  return cachedValue;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function usePreferences() {
  const preferences = useSyncExternalStore(subscribe, readPreferences, () => DEFAULT_PREFERENCES);

  const updatePreferences = useCallback((changes: Partial<Preferences>) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readPreferences(), ...changes }));
      listeners.forEach((listener) => listener());
    } catch {
      // Sem armazenamento a aplicação segue com os padrões.
    }
  }, []);

  return { preferences, updatePreferences };
}
