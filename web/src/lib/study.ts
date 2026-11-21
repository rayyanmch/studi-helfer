"use client";

// Lernbereich „Study“: Zusammenfassung pro Datei, Karteikästen (Leitner, je Modul und gemischt), Lernzettel als PDF.
// In der Mac-App kommen die Daten aus desktop/lib/study.js (KI: lokales Claude Code, nur Demo).
// Im Browser gibt es kleine Beispieldaten, damit man am Aussehen arbeiten kann.

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useApp } from "./app-store";
import { getDesktop, type Fail, type Ok } from "./desktop";
import type { Course } from "./mock-data";
import { type Week, weekLabel, weeksOf } from "./weeks";
import { docTypeOf, isStudyDoc, isTaskDoc } from "./doctype";

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
  cards: { q: string; a: string; page: number; type?: CardType; steps?: string[] }[];
  math?: boolean; // mit Formeln (LaTeX) und Mathe-Kartentypen ausgewertet
  kind?: "summary" | "help"; // help = Lernhilfe für Übungsblatt/Klausur
  tasks?: { label: string; topic: string; method: string; hint: string; lookup: string; page: number }[];
}

export type CardType = "concept" | "definition" | "theorem" | "formula" | "strategy" | "compute" | "truefalse" | "proof";

export interface CardState {
  box: number; // Leitner-Fach 1–5 (1 = nochmal heute, 2 = morgen, 3 = in 3 Tagen, 4 = in 1 Woche, 5 = in 2 Wochen)
  due?: string; // YYYY-MM-DD
  reviews: number;
  suspended?: boolean; // nicht mehr abfragen
}

/** Bausteine eines Lernzettels (Reihenfolge wie im PDF). */
export const SHEET_SECTIONS = [
  { key: "summary", label: "Summary", hint: "Short paragraphs with the key ideas", fixed: true },
  { key: "beginner", label: "Explained simply", hint: "Simple why and what questions for a first understanding" },
  { key: "analogies", label: "Analogies", hint: "Everyday comparisons that make it click" },
  { key: "examples", label: "Examples", hint: "Concrete cases, mostly from the slides" },
  { key: "tables", label: "Tables", hint: "Phases, types and comparisons side by side" },
  { key: "terms", label: "Key terms", hint: "Short definitions you should know" },
  { key: "mnemonics", label: "Memory hooks", hint: "Mnemonics for lists and orders" },
  { key: "misconceptions", label: "Common mistakes", hint: "What students often get wrong" },
  { key: "anecdotes", label: "Stories", hint: "Short true stories that help you remember" },
  { key: "questions", label: "Review questions", hint: "Questions like in the exam" },
  { key: "answers", label: "Answers", hint: "Model answers to the review questions", needs: "questions" },
  { key: "bigPicture", label: "Big picture", hint: "The core ideas that connect everything" },
] as const;

/** Bausteine für Mathe-Fächer (eigene Herangehensweise, siehe desktop/lib/study-sheet.js MATH_SECTIONS). */
export const MATH_SECTIONS = [
  { key: "summary", label: "Overview", hint: "What it’s about, in a few short paragraphs", fixed: true },
  { key: "intuition", label: "Intuition", hint: "What it means, as a picture or everyday idea" },
  { key: "definitions", label: "Definitions", hint: "Exact definitions with notation, in boxes" },
  { key: "theorems", label: "Theorems & rules", hint: "Statements with all conditions, in boxes" },
  { key: "formulas", label: "Formula sheet", hint: "Each formula with what the symbols mean" },
  { key: "methods", label: "Recipes", hint: "Step by step: how to solve each task type" },
  { key: "examples", label: "Worked examples", hint: "Full solutions, every step with the reason" },
  { key: "tasks", label: "Typical exam tasks", hint: "Task types from the sheets and how to start" },
  { key: "mistakes", label: "Typical mistakes", hint: "Forgotten conditions, sign errors and the fix" },
  { key: "proofs", label: "Proof ideas", hint: "The key trick of important proofs" },
  { key: "practice", label: "Practice problems", hint: "New problems of the same type" },
  { key: "answers", label: "Solutions", hint: "Step-by-step solutions to the practice problems", needs: "practice" },
  { key: "bigPicture", label: "Big picture", hint: "How the parts connect" },
] as const;

export type SectionKey = (typeof SHEET_SECTIONS)[number]["key"] | (typeof MATH_SECTIONS)[number]["key"];
export type Include = Partial<Record<SectionKey, boolean>>;
export type SheetLength = "short" | "normal" | "detailed";

const on = (...keys: SectionKey[]): Include =>
  Object.fromEntries(SHEET_SECTIONS.map((s) => [s.key, s.key === "summary" || keys.includes(s.key)])) as Include;
const onMath = (...keys: SectionKey[]): Include =>
  Object.fromEntries(MATH_SECTIONS.map((s) => [s.key, s.key === "summary" || keys.includes(s.key)])) as Include;

export const MATH_PRESETS: { id: string; label: string; include: Include }[] = [
  { id: "formulas", label: "Formula sheet", include: onMath("definitions", "theorems", "formulas") },
  { id: "exam", label: "Exam prep", include: onMath("formulas", "methods", "examples", "tasks", "mistakes", "practice", "answers") },
  { id: "understand", label: "Understand it", include: onMath("intuition", "definitions", "theorems", "examples", "proofs", "bigPicture") },
  { id: "all", label: "Everything", include: onMath(...MATH_SECTIONS.map((s) => s.key)) },
];

export const PRESETS: { id: string; label: string; include: Include }[] = [
  { id: "guide", label: "Study guide", include: on("beginner", "analogies", "examples", "tables", "misconceptions", "questions", "bigPicture") },
  { id: "exam", label: "Exam prep", include: on("tables", "terms", "misconceptions", "questions", "answers", "bigPicture") },
  { id: "quick", label: "Quick review", include: on("terms", "questions") },
  { id: "beginner", label: "Beginner-friendly", include: on("beginner", "analogies", "examples", "mnemonics", "anecdotes") },
  { id: "all", label: "Everything", include: on(...SHEET_SECTIONS.map((s) => s.key)) },
];

export interface Sheet {
  id: string;
  moduleId: string;
  moduleName?: string;
  createdAt: number;
  focus: string | null;
  files: { path: string; name: string }[];
  title: string;
  pdf?: string | null;
  include?: Partial<Include>;
  length?: SheetLength;
  parts?: { title: string }[];
  sections?: { heading: string }[]; // ältere Lernzettel
  math?: boolean;
}

export interface StudyJob {
  running: boolean;
  total: number;
  done: number;
  current: string[];
  failed: { path: string; name: string; message: string }[];
  etaSeconds: number | null;
}

export interface StudyStats {
  today: number; // heute abgefragt
  streak: number; // Tage am Stück
  newToday: number; // heute zum ersten Mal gesehene Karten
}

/** Neue Karten pro Tag (wie bei Anki), damit es nicht erschlägt. */
export const NEW_PER_DAY = 20;

export interface StudyApi {
  status(): Promise<{ available: boolean; provider: string; model: string }>;
  get(paths: string[]): Promise<{
    files: Record<string, Analysis | null>;
    cards: Record<string, CardState>;
    today: string;
    state: StudyJob;
    stats: StudyStats;
    sheet: SheetRun;
    unreadable: Record<string, boolean>;
    weekTitles: Record<string, Record<string, string>>;
  }>;
  weekTitles(moduleId: string, moduleName: string, weeks: { key: string; title: string; hints: string[] }[]): Promise<Ok<{ titles: Record<string, string> }> | Fail>;
  analyze(paths: string[], moduleName: string, opts?: { math?: boolean; help?: string[]; context?: string }): Promise<Ok | Fail>;
  cancel(): Promise<Ok>;
  review(cardId: string, knew: boolean, practice?: boolean): Promise<Ok<{ card: CardState; stats: StudyStats }> | Fail>;
  suspend(cardId: string, on: boolean): Promise<Ok<{ card: CardState }> | Fail>;
  resetCards(ids: string[]): Promise<Ok>;
  sheets(moduleId: string | null): Promise<Sheet[]>;
  createSheet(opts: {
    moduleId: string;
    moduleName: string;
    paths: string[];
    focus?: string;
    include: Include;
    length: SheetLength;
    accent?: string;
    context?: string;
    math?: boolean;
  }): Promise<Ok<{ sheet: Sheet }> | Fail>;
  openSheet(id: string, reveal?: boolean): Promise<Ok<{ path: string }> | Fail>;
  deleteSheet(id: string): Promise<Ok>;
  sheetState(): Promise<SheetRun>;
  exportAnki(name: string, cards: { q: string; a: string; tags: string }[]): Promise<Ok<{ path: string }> | Fail>;
  onState(cb: (s: StudyJob) => void): () => void;
}

export interface SheetRun {
  running: boolean;
  startedAt?: number;
  step?: "reading" | "writing" | "pdf";
  title?: string; // nur Oberfläche
}

/** Karte mit Herkunft (für Abfrage, Kästen und Export). */
export interface Card {
  id: string; // `${analysis.id}:${index}`
  q: string;
  a: string;
  page: number;
  type?: CardType;
  steps?: string[];
  math?: boolean;
  file: string; // Dateiname
  path: string;
  moduleId?: string;
  state?: CardState;
}

interface StudyState {
  available: boolean | null; // null = noch unbekannt
  files: Record<string, Analysis | null>;
  cards: Record<string, CardState>;
  sheets: Sheet[]; // alle Module
  today: string;
  job: StudyJob;
  stats: StudyStats;
  sheetRun: SheetRun;
  target: StudyTarget | null; // Sprungziel aus der Kursseite
  unreadable: Record<string, boolean>; // Dateien ohne Text (Handschrift, Scans)
  weekTitles: Record<string, Record<string, string>>; // Modul → Wochen-Key → KI-Titel
}

export type StudyTarget = { screen: "deck"; moduleId: string } | { screen: "new-sheet"; moduleId?: string };

const IDLE: StudyJob = { running: false, total: 0, done: 0, current: [], failed: [], etaSeconds: null };

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let state: StudyState = {
  available: null,
  files: {},
  cards: {},
  sheets: [],
  today: "",
  job: IDLE,
  stats: { today: 0, streak: 0, newToday: 0 },
  sheetRun: { running: false },
  target: null,
  unreadable: {},
  weekTitles: {},
};
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

export const STUDY_FILE = /\.(pdf|txt|md|tex)$/i;

/** Pfad (Mac-App) bzw. Id (Browser) einer Datei, unter dem ihre Auswertung liegt. */
export const fileKey = (f: { path?: string; id: string }) => f.path ?? f.id;

/** Alle lernbaren Dateien eines Moduls. */
export function studyFiles(course: Course) {
  return course.folders.flatMap((f) => f.files).filter((f) => STUDY_FILE.test(f.name));
}

// ------------------------------------------------------------------ Laden

let lastPaths: string[] = [];
let unsub: (() => void) | null = null;
let lastDone = -1;

/** Daten für die angegebenen Dateien laden (Kursseite: ein Modul, Study-Tab: alle). */
export async function loadStudy(paths: string[]) {
  lastPaths = [...new Set([...paths, ...lastPaths])];
  const a = api();
  if (!a) {
    set({ available: true, today: localToday(), ...demoData(paths) });
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
  const [status, data, sheets] = await Promise.all([a.status(), a.get(lastPaths), a.sheets(null)]);
  set({
    available: status.available,
    files: { ...state.files, ...data.files },
    cards: { ...state.cards, ...data.cards },
    today: data.today,
    job: data.state,
    stats: data.stats,
    sheets,
    sheetRun: state.sheetRun.running ? state.sheetRun : data.sheet,
    unreadable: { ...state.unreadable, ...data.unreadable },
    weekTitles: { ...data.weekTitles, ...state.weekTitles },
  });
}

async function refresh() {
  const a = api();
  if (!a || !lastPaths.length) return;
  const data = await a.get(lastPaths);
  set({
    files: { ...state.files, ...data.files },
    cards: { ...state.cards, ...data.cards },
    today: data.today,
    stats: data.stats,
    unreadable: { ...state.unreadable, ...data.unreadable },
  });
}

// ------------------------------------------------------------------ Navigation (Kursseite → Study-Tab)

export function openStudy(target: StudyTarget) {
  set({ target });
  if (typeof window !== "undefined") window.dispatchEvent(new Event("studi:open-study"));
}

export function takeTarget(): StudyTarget | null {
  const t = state.target;
  if (t) set({ target: null });
  return t;
}

// ------------------------------------------------------------------ Aktionen

export async function analyze(paths: string[], moduleName: string, math = false, course?: Course): Promise<string | null> {
  const a = api();
  if (!a) return "Summaries work in the Mac app.";
  // Übungsblätter und Klausuren bekommen eine Lernhilfe, mit den Vorlesungen des Kurses als Kontext („wo nachlesen“)
  const help: string[] = [];
  let context = "";
  if (course) {
    const entries = course.folders.flatMap((folder) => folder.files.map((file) => ({ file, type: docTypeOf(file, folder) })));
    for (const e of entries) if (isTaskDoc(e.type) && paths.includes(fileKey(e.file))) help.push(fileKey(e.file));
    context = entries
      .filter((e) => ["lecture", "notes", "exslides", "reading", "selfstudy"].includes(e.type))
      .map((e) => ({ e, an: state.files[fileKey(e.file)] }))
      .filter((x) => x.an && x.an.kind !== "help")
      .map(({ e, an }) => `${e.file.name.replace(/\.[a-z0-9]+$/i, "")}: ${an!.topics.join(", ")} | ${an!.keyPoints.slice(0, 2).map((k) => `${k.text.slice(0, 90)} (S. ${k.page})`).join("; ")}`)
      .join("\n");
  }
  const res = await a.analyze(paths, moduleName, { math, help, context });
  return res.ok ? null : res.message;
}

/** Dateien, die Lernstoff liefern (keine Orga, Videos, Daten). */
export function studyDocs(course: Course) {
  return course.folders.flatMap((folder) => folder.files.filter((f) => STUDY_FILE.test(f.name) && isStudyDoc(docTypeOf(f, folder))));
}

export async function cancelAnalyze() {
  await api()?.cancel();
}

const DAYS = [0, 0, 1, 3, 7, 14];

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function review(cardId: string, knew: boolean, practice = false) {
  const a = api();
  if (!a) {
    // Browser: nur im Speicher, gleiche Regel wie desktop/lib/study.js
    const cur = state.cards[cardId] ?? { box: 0, reviews: 0 };
    const due = !cur.due || cur.due <= state.today;
    const next =
      practice && !due && knew
        ? { ...cur, reviews: cur.reviews + 1 }
        : (() => {
            const box = knew ? Math.min(5, Math.max(1, cur.box) + 1) : 1;
            return { ...cur, box, due: addDays(state.today, DAYS[box]), reviews: cur.reviews + 1 };
          })();
    const fresh = !cur.box ? 1 : 0;
    set({
      cards: { ...state.cards, [cardId]: next },
      stats: { today: state.stats.today + 1, streak: Math.max(1, state.stats.streak), newToday: state.stats.newToday + fresh },
    });
    return;
  }
  const res = await a.review(cardId, knew, practice);
  if (res.ok) set({ cards: { ...state.cards, [cardId]: res.card }, stats: res.stats });
}

export async function suspendCard(cardId: string, suspended: boolean) {
  const cur = state.cards[cardId] ?? { box: 0, reviews: 0 };
  set({ cards: { ...state.cards, [cardId]: suspended ? { ...cur, suspended: true } : { ...cur, suspended: undefined } } });
  await api()?.suspend(cardId, suspended);
}

export async function resetCards(ids: string[]) {
  const next = { ...state.cards };
  for (const id of ids) delete next[id];
  set({ cards: next });
  await api()?.resetCards(ids);
}

export async function createSheet(opts: {
  moduleId: string;
  moduleName: string;
  paths: string[];
  focus?: string;
  include: Include;
  length: SheetLength;
  accent?: string;
  context?: string;
  math?: boolean;
}): Promise<{ sheet?: Sheet; error?: string }> {
  const a = api();
  if (!a) return { error: "Study sheets work in the Mac app." };
  set({ sheetRun: { running: true, startedAt: Date.now(), step: "reading", title: opts.moduleName } });
  const poll = setInterval(async () => {
    const s = await a.sheetState();
    if (s.running && state.sheetRun.running) set({ sheetRun: { ...state.sheetRun, step: s.step } });
  }, 2000);
  const res = await a.createSheet(opts);
  clearInterval(poll);
  set({ sheetRun: { running: false } });
  if (!res.ok) return { error: res.message };
  set({ sheets: [res.sheet, ...state.sheets] });
  return { sheet: res.sheet };
}

export async function openSheet(id: string, reveal = false): Promise<string | null> {
  const a = api();
  if (!a) return "PDFs work in the Mac app.";
  const res = await a.openSheet(id, reveal);
  if (!res.ok) return res.message;
  set({ sheets: state.sheets.map((s) => (s.id === id ? { ...s, pdf: res.path } : s)) });
  return null;
}

export async function deleteSheet(id: string) {
  set({ sheets: state.sheets.filter((s) => s.id !== id) });
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

export function cardsOf(paths: string[], s: Pick<StudyState, "files" | "cards">, moduleId?: string): Card[] {
  const out: Card[] = [];
  const seen = new Set<string>();
  for (const p of paths) {
    const a = s.files[p];
    if (!a || seen.has(a.id)) continue; // gleiche Datei in Übung und Gruppe nur einmal
    seen.add(a.id);
    a.cards.forEach((c, i) => {
      const id = `${a.id}:${i}`;
      out.push({ id, q: c.q, a: c.a, page: c.page, type: c.type, steps: c.steps, math: a.math, file: a.name, path: p, moduleId, state: s.cards[id] });
    });
  }
  return out;
}

/** Karten aller Module (für Kästen und den gemischten Kasten). */
export function allCards(courses: Course[], s: Pick<StudyState, "files" | "cards" | "today">): Card[] {
  return courses.flatMap((c) => {
    const hidden = hiddenKeys(c, s.today);
    return cardsOf(studyFiles(c).map(fileKey).filter((k) => !hidden.has(k)), s, c.id);
  });
}

export const active = (c: Card) => !c.state?.suspended;
export const isNew = (c: Card) => !c.state || !c.state.box;
/** Schon gelernte Karte, die heute wieder dran ist (neue Karten zählen nicht, siehe todaysSet). */
export const isDue = (c: Card, today: string) => active(c) && !isNew(c) && (!c.state?.due || c.state.due <= today);

/** Höchstens so viele Wiederholungen pro Tag; ein Rückstand verteilt sich auf die nächsten Tage (die ältesten zuerst). */
export const REVIEWS_PER_DAY = 80;
/** Grobe Zeit pro Karte (Sekunden) für „about 4 min“. */
export const SECONDS_PER_CARD = 12;
export const minutesFor = (n: number) => Math.max(1, Math.round((n * SECONDS_PER_CARD) / 60));

/** Was heute drankommt: fällige Wiederholungen (gedeckelt) plus neue Karten bis zum Tageslimit. */
export function todaysSet(cards: Card[], today: string, stats: StudyStats) {
  const reviewsLeft = Math.max(0, REVIEWS_PER_DAY - Math.max(0, stats.today - stats.newToday));
  const reviews = cards
    .filter((c) => isDue(c, today))
    .sort((a, b) => (a.state?.due ?? "").localeCompare(b.state?.due ?? ""))
    .slice(0, reviewsLeft);
  const budget = Math.max(0, NEW_PER_DAY - stats.newToday);
  // Neue Karten reihum aus allen Modulen, je Modul in Vorlesungsreihenfolge
  const seed = 1;
  const fresh = interleave(cards.filter((c) => active(c) && isNew(c)), seed, false).slice(0, budget);
  return { reviews, fresh, all: [...reviews, ...fresh] };
}

/** Verteilung auf die Fächer: [neu, Fach 1 … Fach 5]. */
export function boxes(cards: Card[]) {
  const counts = [0, 0, 0, 0, 0, 0];
  for (const c of cards) if (active(c)) counts[c.state?.box ?? 0] += 1;
  return counts;
}

/** Anteil „sitzt“ (Fach 3 und höher). */
export function mastery(cards: Card[]) {
  const act = cards.filter(active);
  if (!act.length) return 0;
  return act.filter((c) => (c.state?.box ?? 0) >= 3).length / act.length;
}

/**
 * Module abwechselnd (Interleaving), damit der gemischte Kasten wirklich gemischt ist.
 * shuffle = false behält die Reihenfolge innerhalb eines Moduls (neue Karten: Vorlesung 1 vor Vorlesung 6).
 */
export function interleave(cards: Card[], seed = 1, shuffle = true): Card[] {
  let x = seed % 233280;
  const rand = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  const list = [...cards];
  if (shuffle)
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  const groups = new Map<string, Card[]>();
  for (const c of list) {
    const k = c.moduleId ?? "";
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const out: Card[] = [];
  const lists = [...groups.values()];
  while (lists.some((l) => l.length)) for (const l of lists) if (l.length) out.push(l.shift()!);
  return out;
}

// ------------------------------------------------------------------ Ausgeblendete Wochen (Study-Tab, „⋯“ → Hide week)

const HIDDEN_KEY = "studi.hiddenWeeks";
let hiddenWeeks: Record<string, string[]> | null = null;
const hiddenListeners = new Set<() => void>();
let hiddenVersion = 0;

function loadHidden(): Record<string, string[]> {
  if (hiddenWeeks) return hiddenWeeks;
  try {
    hiddenWeeks = JSON.parse((typeof localStorage !== "undefined" && localStorage.getItem(HIDDEN_KEY)) || "{}") ?? {};
  } catch {
    hiddenWeeks = {};
  }
  return hiddenWeeks!;
}

export function hiddenWeeksOf(courseId: string): string[] {
  return loadHidden()[courseId] ?? [];
}

export function setWeekHidden(courseId: string, key: string, hidden: boolean) {
  const cur = loadHidden();
  const list = new Set(cur[courseId] ?? []);
  if (hidden) list.add(key);
  else list.delete(key);
  hiddenWeeks = { ...cur, [courseId]: [...list] };
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(hiddenWeeks));
  } catch {
    // egal
  }
  hiddenVersion += 1;
  for (const l of hiddenListeners) l();
}

export function useHiddenWeeks(courseId: string | null): string[] {
  useSyncExternalStore(
    (l) => {
      hiddenListeners.add(l);
      return () => hiddenListeners.delete(l);
    },
    () => hiddenVersion,
    () => 0,
  );
  return courseId ? hiddenWeeksOf(courseId) : [];
}

/** Dateien in ausgeblendeten Wochen (ihre Karten zählen nicht für „heute“ und den gemischten Kasten). */
function hiddenKeys(course: Course, today: string): Set<string> {
  const hidden = hiddenWeeksOf(course.id);
  if (!hidden.length) return new Set();
  const weeks = weeksOf(course, { today: today || localToday() });
  return new Set(weeks.filter((w) => hidden.includes(w.key)).flatMap((w) => w.files.map((x) => fileKey(x.file))));
}

// ------------------------------------------------------------------ Wochen als „durchgearbeitet“ markieren (Kursseite)

const REVIEWED_KEY = "studi.weeksReviewed";
let reviewed: Record<string, string[]> | null = null;
let reviewedVersion = 0;
const reviewedListeners = new Set<() => void>();
function loadReviewed(): Record<string, string[]> {
  if (reviewed) return reviewed;
  try {
    reviewed = JSON.parse((typeof localStorage !== "undefined" && localStorage.getItem(REVIEWED_KEY)) || "{}") ?? {};
  } catch {
    reviewed = {};
  }
  return reviewed!;
}
export function setWeekReviewed(courseId: string, key: string, on: boolean) {
  const cur = loadReviewed();
  const list = new Set(cur[courseId] ?? []);
  if (on) list.add(key);
  else list.delete(key);
  reviewed = { ...cur, [courseId]: [...list] };
  try {
    localStorage.setItem(REVIEWED_KEY, JSON.stringify(reviewed));
  } catch {
    // egal
  }
  reviewedVersion += 1;
  for (const l of reviewedListeners) l();
}
/** Wochen eines Kurses, die als durchgearbeitet markiert sind. */
export function useReviewedWeeks(courseId: string | null): string[] {
  useSyncExternalStore(
    (l) => {
      reviewedListeners.add(l);
      return () => reviewedListeners.delete(l);
    },
    () => reviewedVersion,
    () => 0,
  );
  return courseId ? (loadReviewed()[courseId] ?? []) : [];
}
export const reviewedWeeksOf = (courseId: string) => loadReviewed()[courseId] ?? [];

// ------------------------------------------------------------------ Heute dran (eine Menge für die ganze App)

/** Kurse dieses Semesters mit lernbaren Dateien (Study-Tab, Zähler). */
export function useStudyCourses(): Course[] {
  const app = useApp();
  return useMemo(() => app.courses.filter((c) => c.id !== "other" && c.semester !== "past" && studyFiles(c).length > 0), [app.courses]);
}

/**
 * Karten für heute über alle Kurse: fällige Wiederholungen + neue Karten bis zum Tageslimit (reihum aus den Kursen).
 * Kurs-Kacheln, Kurs-Seite und Wochen zeigen jeweils ihren Anteil daran, damit die Zahlen überall zusammenpassen.
 */
export function useTodayCards(): Card[] {
  const s = useStudy();
  const courses = useStudyCourses();
  useHiddenWeeks(null);
  return todaysSet(allCards(courses, s), s.today, s.stats).all;
}

// ------------------------------------------------------------------ Themenwochen

const askedTitles = new Map<string, string>(); // Modul → Signatur der zuletzt gefragten Stichwörter

/** Wochen eines Moduls (Regeln aus weeks.ts, Themen aus den Zusammenfassungen, Titel ggf. von Haiku). */
export function useWeeks(course: Course | null): Week[] {
  const app = useApp();
  const s = useStudy();
  const ai = course ? s.weekTitles[course.id] : undefined;
  const weeks = useMemo(
    () =>
      course
        ? weeksOf(course, {
            today: app.today || localToday(),
            topicsOf: (f) => s.files[fileKey(f)]?.topics ?? [],
            aiTitles: ai,
          })
        : [],
    [course, app.today, s.files, ai],
  );
  // Titel, die nur aus Dateinamen stammen, einmal von Haiku glätten lassen (nur Mac-App, zwischengespeichert)
  const ask = weeks.filter((w) => w.kind === "week" && w.titleFrom !== "ilias" && w.hints.length);
  const sig = ask.map((w) => `${w.key}:${w.hints.join("|")}`).join("\n");
  useEffect(() => {
    if (!course || !sig || s.available !== true || askedTitles.get(course.id) === sig) return;
    const a = api();
    if (!a) return;
    askedTitles.set(course.id, sig);
    const list = sig.split("\n").map((line) => {
      const [key, hints] = [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1)];
      return { key, title: "", hints: hints.split("|").filter(Boolean) };
    });
    void a.weekTitles(course.id, course.name, list).then((res) => {
      if (res.ok && Object.keys(res.titles).length) set({ weekTitles: { ...state.weekTitles, [course.id]: res.titles } });
    });
  }, [course, sig, s.available]);
  return weeks;
}

/** „Week 3–4“ / „Week 2, 5“ für eine Auswahl von Wochen (Titel des Lernzettels, Abfrage). */
export function weeksText(weeks: Week[]): string {
  const ns = weeks.filter((w) => w.kind === "week").map((w) => w.n ?? 0).sort((a, b) => a - b);
  const extra = weeks.filter((w) => w.kind !== "week").map((w) => weekLabel(w));
  if (!ns.length) return extra.join(", ");
  const contiguous = ns.every((n, i) => i === 0 || n === ns[i - 1] + 1);
  const base = ns.length === 1 ? `Week ${ns[0]}` : contiguous ? `Week ${ns[0]}–${ns[ns.length - 1]}` : `Week ${ns.join(", ")}`;
  return [base, ...extra].join(", ");
}

// ------------------------------------------------------------------ Beispieldaten (nur Browser)

function demoData(paths: string[]): Partial<StudyState> {
  const files: Record<string, Analysis | null> = { ...state.files };
  paths.forEach((p, i) => {
    if (p in files) return;
    const name = p.split("/").pop() ?? p;
    files[p] =
      i % 3 !== 2
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
            topics: [i % 2 ? "Topic one" : "Topic two"],
            terms: [{ term: "Key term", definition: "A one-sentence definition of the term.", page: 4 }],
            cards: [
              { q: `What does the key term in ${name} mean?`, a: "A one-sentence definition of the term.", page: 4 },
              { q: "How do you calculate a?", a: "a = b + c", page: 7 },
              { q: "Name the three steps of the example.", a: "Plan, do, check.", page: 12 },
            ],
          }
        : null;
  });
  return { files, job: IDLE };
}
