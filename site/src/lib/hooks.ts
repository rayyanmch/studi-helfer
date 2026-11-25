"use client";

import { useSyncExternalStore } from "react";
import { fromKey, keyOf } from "./week";

// Beim Bauen gibt es kein „heute“: Die statische Seite zeigt diesen Tag, der Browser tauscht
// gleich nach dem Laden auf das echte Datum.
const BUILD_DAY = "2026-11-25";
let clientDay: string | null = null;
const noop = () => () => {};

export function useToday(): Date {
  const key = useSyncExternalStore(
    noop,
    () => (clientDay ??= keyOf(new Date())),
    () => BUILD_DAY,
  );
  return fromKey(key);
}

export function useMedia(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export const useReducedMotion = () => useMedia("(prefers-reduced-motion: reduce)");
