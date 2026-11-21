"use client";

// Prüfungsanmeldung in KLIPS. Erstis vergessen sie oft: Wer im Kurs (ILIAS/KLIPS) ist, ist noch nicht zur
// Prüfung angemeldet, und nach der Frist geht es nicht mehr (WiSo-Fakultät, Prüfungsorganisation).
// Es gibt keine zentrale Anmeldephase; in Informatik öffnet sie meist ~4 Wochen vor der Klausur und endet
// ~1 Woche davor (cs.uni-koeln.de), deshalb nur „usually“ und Verweis auf KLIPS.
// Merker „angemeldet“ je Klausurtermin (Deadline-Id) im Browser-Speicher der App (localStorage).

import { useSyncExternalStore } from "react";

export const KLIPS_URL = "https://klips2.uni-koeln.de";
const KEY = "studi.examRegistered";
/** Ab so vielen Tagen vor der Klausur erinnert die Startseite an die Anmeldung. */
export const REMIND_DAYS = 42;

let cache: string[] | null = null;
const listeners = new Set<() => void>();
const EMPTY: string[] = [];

function read(): string[] {
  if (cache) return cache;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    cache = [];
  }
  return cache;
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** Ids der Klausurtermine, für die man sich als angemeldet markiert hat. */
export function useExamRegistered(): string[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function setExamRegistered(id: string, on: boolean) {
  const now = read();
  const next = on ? [...new Set([...now, id])] : now.filter((x) => x !== id);
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Speicher nicht verfügbar: gilt dann nur bis zum Neuladen
  }
  for (const l of listeners) l();
}

/** Kurzer Hinweis, wann man sich anmelden kann, je nach Tagen bis zur Klausur. */
export function registrationHint(days: number): string {
  if (days > 28) return "Registration in KLIPS usually opens about 4 weeks before the exam.";
  if (days >= 7) return "Registration in KLIPS is probably open now. It usually closes about a week before the exam.";
  return "Registration has usually closed by now. Check KLIPS to make sure you are on the list.";
}
