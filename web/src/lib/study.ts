"use client";

// Lernbereich „Study“: Zusammenfassung pro Datei, Lernzettel, Karteikarten (Leitner), Anki-Export.
// In der Mac-App kommen die Daten aus desktop/lib/study.js (KI: lokales Claude Code, nur Demo).
// Im Browser gibt es kleine Beispieldaten, damit man am Aussehen arbeiten kann.

import { useSyncExternalStore } from "react";
import { getDesktop, type Fail, type Ok } from "./desktop";

export interface Analysis {
  id: string; // erste 16 Zeichen des Datei-Hashes
  name: string;
  at: number;
  model: string;
  pages: number;
  partial: number | null; // nur Seiten 1–n ausgewertet
  summary: string;
  keyPoints: { text: string; page: number }[];
  topics: string[];
  terms: { term: string; definition: string; page: number }[];
  cards: { q: string; a: string; page: number }[];
}

export interface CardState {
  box: number; // Leitner-Fach 1–5 (1 = nochmal heute, 2 = morgen, 3 = in 3 Tagen, 4 = in 1 Woche, 5 = in 2 Wochen)
  due: string; // YYYY-MM-DD
  reviews: number;
}

export interface Sheet {
  id: string;
  moduleId: string;
  createdAt: number;
  focus: string | null;
  files: { path: string; name: string }[];
  title: string;
  sections: { heading: string; points: { text: string; file: number; page: number }[] }[];
}

export interface StudyJob {
  running: boolean;
  total: number;
  done: number;
  current: string[];
  failed: { path: string; name: string; message: string }[];
  etaSeconds: number | null;
}

export interface StudyApi {
  status(): Promise<{ available: boolean; provider: string; model: string }>;
  get(paths: string[]): Promise<{ files: Record<string, Analysis | null>; cards: Record<string, CardState>; today: string; state: StudyJob }>;
  analyze(paths: string[], moduleName: string): Promise<Ok | Fail>;
  cancel(): Promise<Ok>;
  review(cardId: string, knew: boolean): Promise<Ok<{ card: CardState }> | Fail>;
  resetCards(ids: string[]): Promise<Ok>;
  sheets(moduleId: string | null): Promise<Sheet[]>;
  createSheet(opts: { moduleId: string; moduleName: string; paths: string[]; focus?: string }): Promise<Ok<{ sheet: Sheet }> | Fail>;
  deleteSheet(id: string): Promise<Ok>;
  exportAnki(name: string, cards: { q: string; a: string; tags: string }[]): Promise<Ok<{ path: string }> | Fail>;
  onState(cb: (s: StudyJob) => void): () => void;
}

/** Karte mit Herkunft (für Abfrage und Export). */
export interface Card {
  id: string; // `${analysis.id}:${index}`
  q: string;
  a: string;
  page: number;
  file: string; // Dateiname
  path: string;
  state?: CardState;
}

interface StudyState {
  available: boolean | null; // null = noch unbekannt
  files: Record<string, Analysis | null>;
  cards: Record<string, CardState>;
  sheets: Record<string, Sheet[]>; // je Modul
  today: string;
  job: StudyJob;
}

const IDLE: StudyJob = { running: false, total: 0, done: 0, current: [], failed: [], etaSeconds: null };

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let state: StudyState = { available: null, files: {}, cards: {}, sheets: {}, today: "", job: IDLE };
const listeners = new Set<() => void>();
function set(patch: Partial<StudyState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}
const SERVER: StudyState = state;

export function useStudy(): StudyState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => SERVER,
  );
}

function api(): StudyApi | null {
  const d = getDesktop() as (ReturnType<typeof getDesktop> & { study?: StudyApi }) | null;
  return d?.study ?? null;
}

// ------------------------------------------------------------------ Laden

let lastPaths: string[] = [];
let unsub: (() => void) | null = null;
let lastDone = -1;

/** Daten für ein Modul laden (Dateien des Moduls, Lernzettel). */
export async function loadStudy(moduleId: string, paths: string[]) {
  lastPaths = paths;
  const a = api();
  if (!a) {
    set({ available: true, today: localToday(), ...demoData(moduleId, paths) });
    return;
  }
  if (!unsub) {
    unsub = a.onState((job) => {
      set({ job });
      // nach jeder fertigen Datei und am Ende neu holen, damit Ergebnisse sofort erscheinen
      if (job.done !== lastDone || !job.running) {
        lastDone = job.done;
        void refresh();
      }
    });
  }
  const [status, data, sheets] = await Promise.all([a.status(), a.get(paths), a.sheets(moduleId)]);
  set({
    available: status.available,
    files: { ...state.files, ...data.files },
    cards: { ...state.cards, ...data.cards },
    today: data.today,
    job: data.state,
    sheets: { ...state.sheets, [moduleId]: sheets },
  });
}

async function refresh() {
  const a = api();
  if (!a || !lastPaths.length) return;
  const data = await a.get(lastPaths);
  set({ files: { ...state.files, ...data.files }, cards: { ...state.cards, ...data.cards }, today: data.today });
}

// ------------------------------------------------------------------ Aktionen

export async function analyze(paths: string[], moduleName: string): Promise<string | null> {
  const a = api();
  if (!a) return "Summaries work in the Mac app.";
  const res = await a.analyze(paths, moduleName);
  return res.ok ? null : res.message;
}

export async function cancelAnalyze() {
  await api()?.cancel();
}

export async function review(cardId: string, knew: boolean) {
  const a = api();
  if (!a) {
    // Browser: nur im Speicher
    const cur = state.cards[cardId] ?? { box: 0, due: state.today, reviews: 0 };
    const box = knew ? Math.min(5, Math.max(1, cur.box) + 1) : 1;
    set({ cards: { ...state.cards, [cardId]: { box, due: addDays(state.today, [0, 0, 1, 3, 7, 14][box]), reviews: cur.reviews + 1 } } });
    return;
  }
  const res = await a.review(cardId, knew);
  if (res.ok) set({ cards: { ...state.cards, [cardId]: res.card } });
}

export async function resetCards(ids: string[]) {
  const next = { ...state.cards };
  for (const id of ids) delete next[id];
  set({ cards: next });
  await api()?.resetCards(ids);
}

export async function createSheet(opts: { moduleId: string; moduleName: string; paths: string[]; focus?: string }): Promise<{ sheet?: Sheet; error?: string }> {
  const a = api();
  if (!a) return { error: "Study sheets work in the Mac app." };
  const res = await a.createSheet(opts);
  if (!res.ok) return { error: res.message };
  set({ sheets: { ...state.sheets, [opts.moduleId]: [res.sheet, ...(state.sheets[opts.moduleId] ?? [])] } });
  return { sheet: res.sheet };
}

export async function deleteSheet(moduleId: string, id: string) {
  set({ sheets: { ...state.sheets, [moduleId]: (state.sheets[moduleId] ?? []).filter((s) => s.id !== id) } });
  await api()?.deleteSheet(id);
}

export async function exportAnki(name: string, cards: Card[]): Promise<string | null> {
  const a = api();
  if (!a) return "Export works in the Mac app.";
  const tag = name.replace(/\s+/g, "_");
  const res = await a.exportAnki(
    name,
    cards.map((c) => ({ q: c.q, a: c.a, tags: `${tag} ${c.file.replace(/\.[a-z0-9]+$/i, "").replace(/\s+/g, "_")}` })),
  );
  if (res.ok) return null;
  return res.code === "cancelled" ? null : res.message;
}

// ------------------------------------------------------------------ Ableitungen

export function cardsOf(paths: string[], s: StudyState): Card[] {
  const out: Card[] = [];
  for (const p of paths) {
    const a = s.files[p];
    if (!a) continue;
    a.cards.forEach((c, i) => {
      const id = `${a.id}:${i}`;
      out.push({ id, q: c.q, a: c.a, page: c.page, file: a.name, path: p, state: s.cards[id] });
    });
  }
  return out;
}

export function isDue(c: Card, today: string) {
  return !c.state || c.state.due <= today;
}

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ------------------------------------------------------------------ Beispieldaten (nur Browser)

function demoData(moduleId: string, paths: string[]): Partial<StudyState> {
  const files: Record<string, Analysis | null> = {};
  paths.forEach((p, i) => {
    const name = p.split("/").pop() ?? p;
    files[p] =
      i < 2
        ? {
            id: `demo${String(i).padStart(12, "0")}`,
            name,
            at: Date.now(),
            model: "sonnet",
            pages: 24,
            partial: null,
            summary: "Sample summary (browser only): what this file covers, the main ideas and what matters for the exam, in three to five sentences.",
            keyPoints: [
              { text: "First key idea with a short, exact definition.", page: 3 },
              { text: "Second key idea, including the formula a = b + c.", page: 7 },
              { text: "A worked example that shows how to apply it.", page: 12 },
            ],
            topics: ["Topic one", "Topic two"],
            terms: [{ term: "Key term", definition: "A one-sentence definition of the term.", page: 4 }],
            cards: [
              { q: "What does the key term mean?", a: "A one-sentence definition of the term.", page: 4 },
              { q: "How do you calculate a?", a: "a = b + c", page: 7 },
            ],
          }
        : null;
  });
  return { files, cards: {}, job: IDLE, sheets: { ...state.sheets, [moduleId]: state.sheets[moduleId] ?? [] } };
}
