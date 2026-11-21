"use client";

// Lern-Tracker (Tab „Progress“): Wie viel Stoff sieht jedes Modul diese Woche vor, und ist man bis zur Klausur im Plan?
//
// Stoffmenge ohne KI-Aufruf: je Datei Seiten (aus den Study-Auswertungen, sonst geschätzt) × Minuten je Seite nach Art
// (Folien 2,5, Begleittext 5, Skript 4 …), Übungsblätter nach Zahl der Aufgaben (aus der Lernhilfe), Mathe langsamer.
// Anteil eines Moduls in einer Woche = halb nach Leistungspunkten (ECTS, mit der Schwere dieser Woche gewichtet),
// halb nach der tatsächlichen Stoffmenge dieser Woche im Vergleich zu den anderen Modulen.
// Fortschritt je Woche stuft der Nutzer in Vierteln ein (0–4); ohne Einstufung zählt „Mark reviewed“ von der Kursseite
// als fertig, sonst das, was die Karteikarten der Woche sagen (höchstens „Almost“, Karten sind nicht das Blatt).

import { useMemo, useSyncExternalStore } from "react";
import { useApp } from "./app-store";
import type { Course, Deadline } from "./mock-data";
import type { DocType } from "./doctype";
import { lecturePeriod } from "./recurrence";
import {
  type Analysis,
  type CardState,
  type Sheet,
  active,
  cardsOf,
  fileKey,
  reviewedWeeksOf,
  setWeekReviewed,
  sheetFor,
  STUDY_FILE,
  useReviewedWeeks,
  useStudy,
  useStudyCourses,
} from "./study";
import { type Week, lectureWeek, semesterStart, weekRange, weeksOf } from "./weeks";

// ------------------------------------------------------------------ Einstellungen (Browser-Speicher)

export interface ProgressPrefs {
  levels: Record<string, Record<string, number>>; // Modul → Wochen-Key → 0–4
  ects: Record<string, number>; // selbst eingetragene Leistungspunkte
  hours: number | null; // eigene Lernzeit pro Woche (ohne Vorlesungen)
}

const KEY = "studi.progress";
let prefs: ProgressPrefs | null = null;
let version = 0;
const listeners = new Set<() => void>();

function loadPrefs(): ProgressPrefs {
  if (prefs) return prefs;
  try {
    const raw = JSON.parse((typeof localStorage !== "undefined" && localStorage.getItem(KEY)) || "null");
    prefs = { levels: raw?.levels ?? {}, ects: raw?.ects ?? {}, hours: typeof raw?.hours === "number" ? raw.hours : null };
  } catch {
    prefs = { levels: {}, ects: {}, hours: null };
  }
  return prefs!;
}

function savePrefs(next: ProgressPrefs) {
  prefs = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Browser-Speicher nicht verfügbar: gilt bis zum Neuladen
  }
  version += 1;
  for (const l of listeners) l();
}

export function useProgressPrefs(): ProgressPrefs {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => 0,
  );
  return loadPrefs();
}

export const LEVELS = [
  { value: 0, label: "Not yet", hint: "Haven’t looked at it yet" },
  { value: 1, label: "Started", hint: "Skimmed the slides" },
  { value: 2, label: "Halfway", hint: "Lecture worked through" },
  { value: 3, label: "Almost", hint: "Sheet mostly done too" },
  { value: 4, label: "Done", hint: "Understood, sheet done" },
] as const;

/** Woche einstufen (0–4) oder mit null auf automatisch zurücksetzen. „Done“ setzt auch „Mark reviewed“ auf der Kursseite. */
export function setWeekLevel(courseId: string, weekKey: string, level: number | null) {
  const cur = loadPrefs();
  const mine = { ...(cur.levels[courseId] ?? {}) };
  if (level == null) delete mine[weekKey];
  else mine[weekKey] = Math.max(0, Math.min(4, Math.round(level)));
  savePrefs({ ...cur, levels: { ...cur.levels, [courseId]: mine } });
  const reviewed = reviewedWeeksOf(courseId).includes(weekKey);
  if (level === 4 && !reviewed) setWeekReviewed(courseId, weekKey, true);
  if (level !== 4 && reviewed) setWeekReviewed(courseId, weekKey, false);
}

/** Mehrere Wochen auf einmal („mark all done“) und Rückgängig: level null = automatisch, reviewed = „Mark reviewed“. */
export function applyLevels(courseId: string, changes: { key: string; level: number | null; reviewed: boolean }[]) {
  const cur = loadPrefs();
  const mine = { ...(cur.levels[courseId] ?? {}) };
  for (const c of changes) {
    if (c.level == null) delete mine[c.key];
    else mine[c.key] = c.level;
  }
  savePrefs({ ...cur, levels: { ...cur.levels, [courseId]: mine } });
  const reviewed = reviewedWeeksOf(courseId);
  for (const c of changes) if (reviewed.includes(c.key) !== c.reviewed) setWeekReviewed(courseId, c.key, c.reviewed);
}

export function setModuleEcts(courseId: string, value: number | null) {
  const cur = loadPrefs();
  const ects = { ...cur.ects };
  if (value == null) delete ects[courseId];
  else ects[courseId] = value;
  savePrefs({ ...cur, ects });
}

export function setStudyHours(hours: number) {
  savePrefs({ ...loadPrefs(), hours: Math.max(2, Math.min(60, Math.round(hours))) });
}

export const DEFAULT_HOURS = 15;
export const DEFAULT_ECTS = 6;
export const ECTS_CHOICES = [3, 4, 5, 6, 7.5, 8, 9, 10, 12, 15];

// ------------------------------------------------------------------ Stoffmenge je Datei

/** Minuten je Seite und angenommene Seiten, wenn die Datei noch nicht ausgewertet ist. */
const RATES: Record<DocType, { perPage: number; pages: number; max?: number }> = {
  lecture: { perPage: 2.5, pages: 30 }, // Folien lesen und verstehen
  notes: { perPage: 4, pages: 15 }, // Skript, Mitschrift
  reading: { perPage: 5, pages: 12 }, // Begleittext, Paper: dichter Text
  selfstudy: { perPage: 4, pages: 10 },
  sheet: { perPage: 35, pages: 3, max: 240 }, // Übungsblatt selbst lösen
  exslides: { perPage: 1.5, pages: 20 },
  tutorial: { perPage: 1.5, pages: 10 },
  solution: { perPage: 1, pages: 4, max: 30 }, // mit der eigenen Lösung vergleichen
  other: { perPage: 1, pages: 6 },
  video: { perPage: 0, pages: 0 },
  exam: { perPage: 0, pages: 0 }, // Altklausuren gehören zur Klausurvorbereitung
  info: { perPage: 0, pages: 0 },
  data: { perPage: 0, pages: 0 },
};
const MINUTES_PER_TASK = 25;
/** Lange Foliensätze haben viele Aufbau-Folien: ab 40 Seiten zählt jede Seite halb. */
const effPages = (p: number) => (p <= 40 ? p : 40 + (p - 40) * 0.5);

export interface FileLoad {
  minutes: number;
  pages: number | null; // bekannt aus der Auswertung
  guessed: boolean; // Seiten geschätzt
}

export function fileLoad(type: DocType, an: Analysis | null | undefined, unreadable: boolean): FileLoad {
  const rate = RATES[type];
  if (!rate.perPage) return { minutes: 0, pages: an?.pages ?? null, guessed: false };
  const pages = an?.pages && an.pages > 0 ? an.pages : null;
  let minutes: number;
  if (type === "sheet" && an?.tasks?.length) minutes = Math.max(45, an.tasks.length * MINUTES_PER_TASK);
  else minutes = effPages(pages ?? (unreadable ? Math.round(rate.pages * 0.6) : rate.pages)) * rate.perPage;
  if (an?.math) minutes *= type === "sheet" ? 1.2 : 1.4; // Mathe liest sich langsamer
  minutes += Math.min(15, an?.formulas?.length ?? 0) * 3; // jede Formel will verstanden sein
  if (type === "sheet") minutes = Math.max(45, minutes);
  if (rate.max) minutes = Math.min(rate.max, minutes);
  return { minutes, pages, guessed: !pages && !(type === "sheet" && an?.tasks?.length) };
}

export interface WeekLoad {
  minutes: number;
  guessedMinutes: number;
  parts: { type: DocType; count: number; pages: number }[]; // für „2 lectures · 58 p.“
}

const PART_ORDER: DocType[] = ["lecture", "notes", "reading", "selfstudy", "sheet", "exslides", "tutorial", "solution", "other"];

export function weekLoad(week: Week, files: Record<string, Analysis | null>, unreadable: Record<string, boolean>): WeekLoad {
  const parts = new Map<DocType, { count: number; pages: number }>();
  let minutes = 0;
  let guessedMinutes = 0;
  const hasLecture = week.files.some((x) => x.type === "lecture" || x.type === "notes");
  for (const x of week.files) {
    if (x.type === "video") {
      // Aufzeichnung zählt nur, wenn es keine Folien gibt (sonst derselbe Stoff zweimal)
      if (!hasLecture) {
        minutes += 60;
        guessedMinutes += 60;
        const p = parts.get("video") ?? { count: 0, pages: 0 };
        parts.set("video", { count: p.count + 1, pages: 0 });
      }
      continue;
    }
    if (!STUDY_FILE.test(x.file.name)) continue;
    const key = fileKey(x.file);
    const load = fileLoad(x.type, files[key], Boolean(unreadable[key]));
    if (!load.minutes) continue;
    minutes += load.minutes;
    if (load.guessed) guessedMinutes += load.minutes;
    const p = parts.get(x.type) ?? { count: 0, pages: 0 };
    parts.set(x.type, { count: p.count + 1, pages: p.pages + (load.pages ?? 0) });
  }
  return {
    minutes,
    guessedMinutes,
    parts: [...parts.entries()]
      .sort((a, b) => (PART_ORDER.indexOf(a[0]) + 1 || 99) - (PART_ORDER.indexOf(b[0]) + 1 || 99))
      .map(([type, p]) => ({ type, ...p })),
  };
}

// ------------------------------------------------------------------ Plan je Modul und Woche

export type Status = "none" | "ahead" | "ontrack" | "slightly" | "behind";

export interface WeekPlan {
  key: string; // "w3"
  n: number;
  title: string;
  range: string;
  week: Week | null; // null = noch keine Dateien
  load: WeekLoad | null;
  minutes: number; // Stoff in Minuten (bei zukünftigen Wochen ohne Dateien: Durchschnitt)
  estimated: boolean; // keine Dateien, Durchschnitt angenommen
  heavy: number; // Stoff im Vergleich zu einer durchschnittlichen Woche des Moduls (1 = normal)
  share: number; // Anteil an der Lernzeit dieser Woche über alle Module (0–1)
  hours: number; // Plan-Stunden bei der eigenen Lernzeit
  level: number | null; // eigene Einstufung 0–4
  auto: number; // aus den Karteikarten 0–1
  progress: number; // wirksam 0–1
  source: "you" | "reviewed" | "cards" | "none";
  reviewed: boolean; // „Mark reviewed“ auf der Kursseite
  cards: { total: number; seen: number; learned: number };
  sheet: Sheet | undefined; // Einseiter dieser Woche
  past: boolean;
  current: boolean;
}

export interface ModulePlan {
  course: Course;
  ects: number;
  ectsFrom: "you" | "slides" | "guess";
  ectsEvidence: string | null; // „12 Leistungspunkte“ in „BWL26_0_Folien.pdf“
  weeks: WeekPlan[]; // Vorlesungswochen 1 … letzte
  exam: { date: string; days: number; assumed: boolean; title: string };
  prepHours: number; // Klausurvorbereitung nach der Vorlesungszeit
  rated: boolean; // irgendeine Einstufung, „reviewed“ oder Karten gelernt
  due: number; // Stunden der vergangenen Wochen
  done: number; // davon geschafft
  behind: number; // Stunden zum Aufholen (nur eingestufte Wochen)
  unrated: number[]; // vergangene Wochen ohne Einstufung
  status: Status;
  remaining: number; // Stunden bis zur Klausur (Rückstand + restliche Wochen + Vorbereitung)
  needPerWeek: number; // so viel pro Woche bis zur Klausur
  planPerWeek: number; // so viel sieht der Plan im Schnitt pro Woche vor
  thisWeek: WeekPlan | null;
}

export interface Step {
  module: ModulePlan;
  week: WeekPlan;
  left: number; // Stunden
  kind: "now" | "catchup";
  fits: boolean; // passt noch in die eigene Lernzeit dieser Woche
}

export interface ProgressModel {
  modules: ModulePlan[];
  currentWeek: number; // 1 … lastWeek (+1 = Prüfungszeit)
  lastWeek: number;
  breakAfter: number | null; // Weihnachtspause nach dieser Woche
  range: string; // „Nov 16 – 20“
  hours: number;
  hoursSet: boolean;
  anyRated: boolean;
  steps: Step[];
  guessedEcts: ModulePlan[];
  lectureEnd: string;
}

const DAY = 86_400_000;
const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / DAY);
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Nächste Klausur des Moduls; ohne Termin: angenommen 10 Tage nach Vorlesungsende. */
function examOf(courseId: string, deadlines: Deadline[], today: string, lectureEnd: string): ModulePlan["exam"] {
  const all = deadlines.filter((d) => d.courseId === courseId && d.kind === "klausur" && d.date >= isoOf(semesterStart(today)));
  const next = all.filter((d) => d.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? all.sort((a, b) => b.date.localeCompare(a.date))[0];
  if (next) return { date: next.date, days: daysBetween(today, next.date), assumed: false, title: next.title };
  const d = parse(lectureEnd);
  d.setDate(d.getDate() + 10);
  const date = isoOf(d);
  return { date, days: daysBetween(today, date), assumed: true, title: "Exam" };
}

export function buildProgress(
  courses: Course[],
  study: { files: Record<string, Analysis | null>; cards: Record<string, CardState>; unreadable: Record<string, boolean>; sheets: Sheet[]; weekTitles: Record<string, Record<string, string>> },
  p: ProgressPrefs,
  today: string,
  deadlines: Deadline[],
): ProgressModel {
  const start = semesterStart(today);
  const period = lecturePeriod(parse(today));
  const lastWeek = Math.max(1, lectureWeek(parse(period.end), start));
  const todayWeek = parse(today) < start ? 1 : lectureWeek(parse(today), start);
  const currentWeek = Math.min(lastWeek + 1, todayWeek);
  const breakAfter = start.getMonth() === 9 ? lectureWeek(new Date(start.getFullYear(), 11, 18, 12), start) : null;
  const hours = p.hours ?? DEFAULT_HOURS;

  // 1. Stoff je Modul und Woche
  const raw = courses.map((course) => {
    const weeks = weeksOf(course, { today, topicsOf: (f) => study.files[fileKey(f)]?.topics ?? [], aiTitles: study.weekTitles[course.id] });
    const byN = new Map<number, Week>();
    for (const w of weeks) {
      const n = w.kind === "week" && w.n != null ? Math.min(lastWeek, w.n) : null;
      if (n != null && !byN.has(n)) byN.set(n, w);
    }
    // Dateien nach der letzten Vorlesungswoche zählen zur letzten Woche
    const loads = new Map<number, WeekLoad>();
    for (const w of weeks) {
      if (w.kind !== "week" || w.n == null) continue;
      const n = Math.min(lastWeek, w.n);
      const l = weekLoad(w, study.files, study.unreadable);
      const prev = loads.get(n);
      loads.set(n, prev ? { minutes: prev.minutes + l.minutes, guessedMinutes: prev.guessedMinutes + l.guessedMinutes, parts: [...prev.parts, ...l.parts] } : l);
    }
    const known = [...loads.values()].filter((l) => l.minutes > 0).map((l) => l.minutes);
    const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 150;
    const own = p.ects[course.id];
    const found = course.credits?.value;
    const ects = own ?? found ?? DEFAULT_ECTS;
    return {
      course,
      byN,
      loads,
      avg,
      ects,
      ectsFrom: (own != null ? "you" : found != null ? "slides" : "guess") as ModulePlan["ectsFrom"],
      ectsEvidence: own == null && course.credits ? `“${course.credits.evidence}” in ${course.credits.source}` : null,
    };
  });

  // 2. Minuten je Woche (vergangene Wochen ohne Dateien = keine Vorlesung; diese und kommende: Durchschnitt)
  const minutesOf = (r: (typeof raw)[number], n: number) => {
    const l = r.loads.get(n);
    if (l && l.minutes > 0) return { minutes: l.minutes, estimated: false };
    return n >= currentWeek ? { minutes: r.avg, estimated: true } : { minutes: 0, estimated: false };
  };
  const totalEcts = raw.reduce((a, r) => a + r.ects, 0) || 1;

  // 3. Anteil je Woche: halb Leistungspunkte (× Schwere der Woche), halb tatsächlicher Stoff im Vergleich der Module
  const shareOf = new Map<string, number>();
  for (let n = 1; n <= lastWeek; n++) {
    const ms = raw.map((r) => minutesOf(r, n).minutes);
    const totalM = ms.reduce((a, b) => a + b, 0);
    const scores = raw.map((r, i) => {
      const heavy = r.avg ? clamp(ms[i] / r.avg, 0, 2) : 0;
      return 0.5 * (r.ects / totalEcts) * heavy + 0.5 * (totalM ? ms[i] / totalM : 0);
    });
    const sum = scores.reduce((a, b) => a + b, 0);
    raw.forEach((r, i) => shareOf.set(`${r.course.id}|${n}`, sum ? scores[i] / sum : 0));
  }

  // 4. Fortschritt, Status, Klausur
  const modules: ModulePlan[] = raw.map((r) => {
    const reviewed = reviewedWeeksOf(r.course.id);
    const levels = p.levels[r.course.id] ?? {};
    const weeks: WeekPlan[] = [];
    for (let n = 1; n <= lastWeek; n++) {
      const key = `w${n}`;
      const week = r.byN.get(n) ?? null;
      const { minutes, estimated } = minutesOf(r, n);
      const share = shareOf.get(`${r.course.id}|${n}`) ?? 0;
      const keys = new Set(week ? week.files.map((x) => fileKey(x.file)) : []);
      const cards = cardsOf([...keys], study, r.course.id).filter(active);
      const seen = cards.filter((c) => (c.state?.box ?? 0) >= 1).length;
      const learned = cards.filter((c) => (c.state?.box ?? 0) >= 3).length;
      const rawAuto = cards.length ? Math.min(0.75, 0.5 * (seen / cards.length) + 0.5 * (learned / cards.length)) : 0;
      const auto = rawAuto >= 0.125 ? rawAuto : 0; // unter einem Achtel zeigt der Kreis ohnehin nichts
      const level = levels[key] ?? null;
      const isReviewed = reviewed.includes(key);
      const progress = level != null ? level / 4 : isReviewed ? 1 : auto;
      weeks.push({
        key,
        n,
        title: week?.title ?? "",
        range: weekRange(n, start),
        week,
        load: r.loads.get(n) ?? null,
        minutes,
        estimated,
        heavy: r.avg ? minutes / r.avg : 1,
        share,
        hours: hours * share,
        level,
        auto,
        progress,
        source: level != null ? "you" : isReviewed ? "reviewed" : auto > 0 ? "cards" : "none",
        reviewed: isReviewed,
        cards: { total: cards.length, seen, learned },
        sheet: week ? sheetFor(study.sheets, r.course.id, key) : undefined,
        past: n < currentWeek,
        current: n === currentWeek,
      });
    }
    const lectureHours = weeks.reduce((a, w) => a + w.hours, 0);
    const prepHours = lectureHours * 0.25;
    // Status nur über eingestufte Wochen (oder mit gelernten Karten); nicht eingestufte vergangene Wochen stehen extra
    const past = weeks.filter((w) => w.past && w.hours > 0 && w.source !== "none");
    const unrated = weeks.filter((w) => w.past && w.hours > 0 && w.source === "none").map((w) => w.n);
    const due = past.reduce((a, w) => a + w.hours, 0);
    const done = past.reduce((a, w) => a + w.hours * w.progress, 0);
    const ahead = weeks.filter((w) => !w.past).reduce((a, w) => a + w.hours * w.progress, 0);
    // Eingestuft = mindestens eine Woche selbst bewertet oder „reviewed“; Karten allein machen noch keinen Rückstand
    const rated = weeks.some((w) => w.source === "you" || w.source === "reviewed");
    const ratio = due ? done / due : 1;
    const thisWeek = weeks.find((w) => w.current) ?? null;
    const status: Status = !rated
      ? "none"
      : ratio >= 0.9
        ? ratio >= 0.99 && (thisWeek?.progress ?? 0) >= 0.75 && ahead > 0
          ? "ahead"
          : "ontrack"
        : ratio >= 0.6
          ? "slightly"
          : "behind";
    const exam = examOf(r.course.id, deadlines, today, period.end);
    const remaining = due - done + unrated.reduce((a, n) => a + weeks[n - 1].hours, 0) + weeks.filter((w) => !w.past).reduce((a, w) => a + w.hours * (1 - w.progress), 0) + prepHours;
    const weeksLeft = Math.max(0.5, exam.days / 7);
    return {
      course: r.course,
      ects: r.ects,
      ectsFrom: r.ectsFrom,
      ectsEvidence: r.ectsEvidence,
      weeks,
      exam,
      prepHours,
      rated,
      due,
      done,
      behind: Math.max(0, due - done),
      unrated,
      status,
      remaining,
      needPerWeek: remaining / weeksLeft,
      planPerWeek: (lectureHours + prepHours) / (lastWeek + Math.max(1, daysBetween(period.end, exam.date) / 7)),
      thisWeek,
    };
  });

  // 5. Was diese Woche dran ist: aktuelle Woche je Modul, dazu Rückstand (nur Module, die schon eingestuft sind)
  const items: Omit<Step, "fits">[] = [];
  for (const m of modules) {
    const cw = m.thisWeek;
    if (cw && cw.hours * (1 - cw.progress) >= 0.1) items.push({ module: m, week: cw, left: cw.hours * (1 - cw.progress), kind: "now" });
    if (!m.rated) continue;
    for (const w of m.weeks) if (w.past && w.hours > 0 && w.hours * (1 - w.progress) >= 0.1) items.push({ module: m, week: w, left: w.hours * (1 - w.progress), kind: "catchup" });
  }
  const urgent = (s: Omit<Step, "fits">) => s.kind === "catchup" && s.module.exam.days <= 28;
  items.sort((a, b) => {
    if (urgent(a) !== urgent(b)) return urgent(a) ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === "now" ? -1 : 1;
    if (a.kind === "now") return b.left - a.left;
    return a.week.n - b.week.n || a.module.exam.days - b.module.exam.days;
  });
  let sum = 0;
  const steps: Step[] = items.map((s) => {
    sum += s.left;
    return { ...s, fits: sum <= hours + 0.25 };
  });

  return {
    modules,
    currentWeek,
    lastWeek,
    breakAfter: breakAfter != null && breakAfter < lastWeek ? breakAfter : null,
    range: currentWeek <= lastWeek ? weekRange(currentWeek, start) : "",
    hours,
    hoursSet: p.hours != null,
    anyRated: modules.some((m) => m.rated),
    steps,
    guessedEcts: modules.filter((m) => m.ectsFrom === "guess"),
    lectureEnd: period.end,
  };
}

/** Alles für den Progress-Tab, neu berechnet, wenn sich Dateien, Karten, Einstufungen oder Fristen ändern. */
export function useProgress(): ProgressModel {
  const app = useApp();
  const study = useStudy();
  const courses = useStudyCourses();
  const p = useProgressPrefs();
  useReviewedWeeks(null); // abonniert Änderungen an „Mark reviewed“
  const reviewedAll = courses.map((c) => reviewedWeeksOf(c.id).join(",")).join("|");
  const today = app.today || isoOf(new Date());
  return useMemo(
    () => buildProgress(courses, study, p, today, app.deadlines),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [courses, study.files, study.cards, study.unreadable, study.sheets, study.weekTitles, p, today, app.deadlines, reviewedAll],
  );
}

/** „1 h 20 min“, „45 min“, „3 h“. */
export function hoursLabel(h: number): string {
  const min = Math.round((h * 60) / 5) * 5;
  if (min < 60) return `${Math.max(5, min)} min`;
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return mm ? `${hh} h ${mm} min` : `${hh} h`;
}

/** Kurz: „1.5 h“, „40 min“. */
export function hoursShort(h: number): string {
  if (h < 0.95) return `${Math.max(5, Math.round((h * 60) / 5) * 5)} min`;
  return `${Math.round(h * 2) / 2} h`;
}
