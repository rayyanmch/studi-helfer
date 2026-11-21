"use client";

// Eine Datenquelle für die ganze Oberfläche.
//
//   Im Browser (npm run dev ohne Electron): Beispieldaten aus mock-data.ts, wie bisher.
//   In der Mac-App (Electron):             echte Daten über window.studi (desktop.ts).
//
// Komponenten lesen mit useApp() und rufen die Aktionen unten auf. Sie müssen nicht wissen, woher
// die Daten kommen. Formen sind die aus mock-data.ts (Course, Deadline, …).
//
// In der Mac-App ist ein „Course“ hier ein **Modul**: Vorlesung + Übung + Übungsgruppe(n) zusammengefasst
// (desktop/lib/modules.js), mit Kurznamen („Mathe I“) und Dateien nach Art sortiert (Lecture slides …).

import { useEffect, useSyncExternalStore } from "react";
import * as mock from "./mock-data";
import type { ClassSlot, Course, CourseColor, CourseFile, CustomEvent, Deadline } from "./mock-data";
import { composeDeadlines, parseIso } from "./recurrence";
import {
  getDesktop,
  type DesktopCourse,
  type DesktopDeadline,
  type SetupModule,
  type StudiDesktop,
  type SyncEvery,
  type SyncRunStatus,
  type SyncState,
} from "./desktop";
import { displayName } from "./names";

export type Mode = "loading" | "demo" | "desktop";
export type Problem = "none" | "offline" | "loginExpired" | "courseFailed";
export type LoginOutcome = { ok: true } | { ok: false; reason: "wrong" | "offline" | "error"; message: string };

export type JobRowStatus = "waiting" | "running" | "done" | "failed";
export interface StoreJob {
  kind: "import" | "sync";
  running: boolean;
  stopped: boolean;
  etaSeconds: number | null; // Restzeit zum Zeitpunkt etaAt (ms)
  etaAt: number;
  rows: { id: string; moduleId: string | null; name: string; count: number; total: number; status: JobRowStatus }[];
}

export interface CalendarInfo {
  id: string;
  name: string;
  url: string;
  ok: boolean | null;
  error: string | null;
  count: number;
}

export interface AppState {
  mode: Mode;
  user: string | null;
  loggedIn: boolean;
  configured: boolean;
  targetDir: string; // Anzeige, z. B. "~/Uni"
  targetPath: string | null; // absoluter Pfad
  courses: Course[]; // Module mit Dateien (Übersicht)
  setupCourses: Course[]; // Module zur Auswahl (Einrichtung)
  setupSelected: string[];
  setupStatus: "idle" | "loading" | "ready" | "error";
  setupError: string | null;
  deadlines: Deadline[]; // alles für Kalender und Listen: erkannte (ohne ausgeblendete) + eigene Termine
  autoDeadlines: Deadline[]; // erkannte Termine (ILIAS, Übungsblätter, Orga-Folien, Kalender-Abos)
  customEvents: CustomEvent[]; // selbst eingetragene Termine (mit Wiederholung)
  hiddenEvents: string[]; // ausgeblendete erkannte Termine (Id oder Serie)
  done: string[];
  digests: Record<string, string>;
  lastSync: string; // fertiger Text, z. B. "today, 9:41 AM"
  lastSyncAt: number | null;
  lastStatus: SyncRunStatus | null;
  failedCourseIds: string[]; // Modul-Ids, bei denen der letzte Sync scheiterte
  problem: Problem;
  job: StoreJob | null;
  today: string; // "2026-11-20"
  schedule: { enabled: boolean; time: string; every: SyncEvery };
  notifications: boolean;
  launchAtLogin: boolean;
  calendars: CalendarInfo[];
}

const DEMO: AppState = {
  mode: "demo",
  user: "mmuster1",
  loggedIn: false,
  configured: false,
  targetDir: mock.TARGET_FOLDER,
  targetPath: null,
  courses: mock.courses,
  setupCourses: mock.courses,
  setupSelected: mock.courses.filter((c) => c.semester !== "past").map((c) => c.id),
  setupStatus: "ready",
  setupError: null,
  deadlines: mock.deadlines,
  autoDeadlines: mock.deadlines,
  customEvents: [],
  hiddenEvents: [],
  done: [],
  digests: mock.digests,
  lastSync: `today, ${mock.LAST_SYNC}`,
  lastSyncAt: null,
  lastStatus: "ok",
  failedCourseIds: [],
  problem: "none",
  job: null,
  today: mock.TODAY,
  schedule: { enabled: true, time: "07:00", every: "daily" },
  notifications: true,
  launchAtLogin: false,
  calendars: [],
};

const INITIAL: AppState = { ...DEMO, mode: "loading" };

let state: AppState = INITIAL;
const listeners = new Set<() => void>();

function set(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Aktueller Stand, neu gerendert bei jeder Änderung. */
export function useApp(): AppState {
  return useSyncExternalStore(subscribe, () => state, () => INITIAL);
}

/** Für Hilfsfunktionen außerhalb von Komponenten (z. B. Farben, „heute“). */
export const appStore = { get: () => state };

// ------------------------------------------------------------------ Menübefehle (⌘R, ⌘, …)

const commandListeners = new Set<(cmd: string) => void>();

/** Auf Befehle aus dem App-Menü reagieren („sync“, „settings“, „search“, „week“, „new“, „courses“). */
export function useCommand(handler: (cmd: string) => void) {
  useEffect(() => {
    commandListeners.add(handler);
    return () => {
      commandListeners.delete(handler);
    };
  }, [handler]);
}

// ------------------------------------------------------------------ Farben

const ORDER: CourseColor[] = ["blue", "orange", "green", "plum", "ochre", "teal", "rose", "indigo"];
let colorOrder: string[] = [];

/** Farbe eines Moduls: feste Reihenfolge nach den ausgewählten Modulen, damit Farben überall gleich bleiben. */
export function colorFor(id: string): CourseColor {
  if (state.mode !== "desktop") {
    const i = mock.courses.findIndex((c) => c.id === id);
    return ORDER[(i < 0 ? 0 : i) % ORDER.length];
  }
  let i = colorOrder.indexOf(id);
  if (i < 0) {
    colorOrder = [...colorOrder, id];
    i = colorOrder.length - 1;
  }
  return ORDER[i % ORDER.length];
}

export const COURSE_COLORS = ORDER;

// ------------------------------------------------------------------ Hilfen

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function localIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tildePath(p: string | null): string {
  if (!p) return "~/Uni";
  return p.replace(/^\/Users\/[^/]+/, "~");
}

function lastSyncLabel(at: number | null): string {
  if (!at) return "not yet";
  const d = new Date(at);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const days = Math.round((new Date(localIso()).getTime() - new Date(localIso(d)).getTime()) / 86_400_000);
  if (days === 0) return `today, ${time}`;
  if (days === 1) return `yesterday, ${time}`;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

/** „about 3 min left“ – Restzeit lesbar, mit Rundung, damit die Zahl nicht zappelt. */
export function etaLabel(job: StoreJob | null, now = Date.now()): string | null {
  if (!job || !job.running) return null;
  if (job.etaSeconds == null) return "Estimating time…";
  const left = Math.max(0, job.etaSeconds - (now - job.etaAt) / 1000);
  if (left < 20) return "Almost done";
  if (left < 60) return "Less than a minute left";
  const min = Math.round(left / 60);
  if (min < 60) return `About ${min} min left`;
  const h = Math.floor(min / 60);
  return `About ${h} h ${min % 60} min left`;
}

// Kurzform nur für enge Stellen (Wochenstreifen, 4 Wochen). Der Name selbst (und damit der Ordner in ~/Uni) bleibt.
const ABBREVIATIONS: [RegExp, string][] = [
  [/\bSoftwaretechnik\b/i, "SE"],
  [/\bSoftware Engineering\b/i, "SE"],
];
function abbreviate(name: string): string {
  let n = name;
  for (const [re, short] of ABBREVIATIONS) n = n.replace(re, short);
  return n;
}

function toCourse(c: DesktopCourse): Course {
  return {
    id: c.id,
    name: c.name,
    short: c.renamed ? c.name : abbreviate(c.name), // selbst gewählter Name gilt überall
    fullName: c.fullName,
    renamed: c.renamed,
    lecturer: "",
    total: c.total,
    folder: c.folder,
    iliasUrl: c.iliasUrl,
    color: c.color ?? undefined,
    semester: c.semester === "past" ? "past" : "current",
    parts: c.parts.map((p) => ({ id: p.courseId, label: p.label })),
    slots: c.slots ?? [],
    folders: c.folders.map((f) => ({
      id: f.id,
      name: f.name,
      category: f.category,
      files: f.files.map(
        (x): CourseFile => ({
          id: x.id,
          name: x.name,
          kind: x.kind,
          size: x.size,
          updated: x.updated,
          isNew: x.isNew,
          path: x.path,
          part: x.part,
          where: x.where,
          modifiedAt: x.modifiedAt,
          changeNote: x.isChanged ? "Updated on ILIAS. Your old copy was kept." : undefined,
        }),
      ),
    })),
  };
}

function toSetupModule(m: SetupModule): Course {
  return {
    id: m.id,
    name: m.name,
    short: m.name,
    fullName: m.fullName,
    lecturer: "",
    total: 0,
    folders: [],
    semester: m.semester === "current" || m.selected ? "current" : "past",
    parts: m.parts.map((p) => ({ id: p.courseId, label: p.label })),
    note:
      m.parts.length > 1
        ? m.parts.map((p) => p.label).join(" · ")
        : m.fullName.replace(/[\s-]+/g, "").toLowerCase() !== m.name.replace(/[\s-]+/g, "").toLowerCase()
          ? m.fullName
          : m.parts[0]?.courseId.startsWith("grp-")
            ? "Group"
            : "Course",
  };
}

const OTHER_ID = "other";

function toDeadline(d: DesktopDeadline): Deadline {
  // In der Oberfläche heißt source „wo“: Raum bei Terminen/Klausuren, Datei bei Fristen aus Übungsblättern.
  const fromFile = d.file ? `Found in “${displayName(d.file.split("/").pop() ?? "")}”` : undefined; // „Found in “0 Folien”“: klar eine Datei
  const source =
    d.location ??
    (d.category === "uni" ? "Found in “University dates”" : d.category === "sheet" || d.category === "ai" || d.category === "schedule" ? fromFile : undefined);
  // ILIAS-Sitzungen einer Reihe („ISM - Vorlesung“, jeden Donnerstag 10:00) lassen sich zusammen ausblenden
  const seriesId =
    d.category === "session" ? `sess|${d.moduleId ?? OTHER_ID}|${d.title.toLowerCase()}|${new Date(`${d.date}T12:00:00`).getDay()}|${d.time}` : undefined;
  const title = d.kind === "klausur" ? examTitle(d.title) : d.title; // nur Anzeige, die Id bleibt
  return { id: d.id, courseId: d.moduleId ?? OTHER_ID, title, date: d.date, time: d.time, kind: d.kind, source, seriesId, location: d.location ?? undefined };
}

const ORDINAL: Record<string, string> = { first: "1st", second: "2nd", third: "3rd" };
/** „1st date“, „First exam“, „Exam (2nd date)“ → „Exam · 1st date“; allein sagten sie nicht, dass es um die Klausur geht. */
function examTitle(title: string): string {
  const m = title.trim().match(/^(?:exam\s*\(\s*)?(first|second|third|\d+(?:st|nd|rd|th))\s+(?:date|exam|attempt)\s*\)?$/i);
  if (!m) return title;
  return `Exam · ${ORDINAL[m[1].toLowerCase()] ?? m[1].toLowerCase()} date`;
}

/** Kalender neu zusammensetzen (erkannte − ausgeblendete + eigene Termine), Sammelmodul „Other“ und Digest anpassen. */
function applyCalendar(patch: Partial<Pick<AppState, "autoDeadlines" | "customEvents" | "hiddenEvents" | "done">> = {}) {
  const next = { ...state, ...patch };
  const list = composeDeadlines(next.autoDeadlines, next.customEvents, next.hiddenEvents, parseIso(next.today || localIso()));
  // Termine ohne passendes Modul (Kalender-Abo, eigene ohne Kurs) landen unter „Other“
  const hasOther = list.some((x) => x.courseId === OTHER_ID);
  const courses = next.courses.filter((c) => c.id !== OTHER_ID);
  if (hasOther) courses.push({ id: OTHER_ID, name: "Other", short: "Other", lecturer: "", total: 0, folders: [], color: "indigo", semester: "current" });
  set({ ...patch, courses, deadlines: list, digests: buildDigests(courses, list, next.done, next.today || localIso()) });
}

/** Kurze Zusammenfassung pro Modul ohne KI: neue/geänderte Dateien und die nächste Frist. */
function buildDigests(courses: Course[], deadlines: Deadline[], done: string[], today: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of courses) {
    const files = c.folders.flatMap((f) => f.files);
    const fresh = files.filter((f) => f.isNew).length;
    const changed = files.filter((f) => f.changeNote).length;
    const next = deadlines
      .filter((d) => d.courseId === c.id && d.kind !== "termin" && d.date >= today && !done.includes(d.id))
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    const parts: string[] = [];
    if (fresh) parts.push(`${fresh} new ${fresh === 1 ? "file" : "files"}`);
    if (changed) parts.push(`${changed} updated`);
    let text = parts.length ? `${parts.join(", ")}.` : "";
    if (next) {
      const d = new Date(`${next.date}T12:00:00`);
      const days = Math.round((d.getTime() - new Date(`${today}T12:00:00`).getTime()) / 86_400_000);
      const when =
        days === 0 ? "today" : days === 1 ? "tomorrow" : days < 7 ? WEEKDAYS[d.getDay()] : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const time = next.time === "all day" ? "" : ` ${next.time}`;
      const label = next.kind === "klausur" ? (/^exam\b/i.test(next.title) ? next.title : `Exam: ${next.title}`) : `Next up: ${next.title}`;
      text += `${text ? " " : ""}${label}, ${when}${time}.`;
    }
    if (text) out[c.id] = text;
  }
  return out;
}

function api(): StudiDesktop {
  const d = getDesktop();
  if (!d) throw new Error("Not running in the desktop app");
  return d;
}

// ------------------------------------------------------------------ Laden

let started = false;
let courseToModule = new Map<string, { moduleId: string; label: string; name: string }>();

/** Einmal beim Start aufrufen (AppShell). Erkennt Browser oder Mac-App und lädt die Daten. */
export async function initApp() {
  if (started) return;
  started = true;
  const desktop = getDesktop();
  if (!desktop) {
    set({ ...DEMO });
    return;
  }
  // Beispieldaten verwerfen, bevor echte Daten kommen (sonst zeigt die Einrichtung Beispielkurse).
  set({
    user: null,
    courses: [],
    setupCourses: [],
    setupSelected: [],
    setupStatus: "idle",
    deadlines: [],
    autoDeadlines: [],
    customEvents: [],
    hiddenEvents: [],
    digests: {},
    done: [],
    job: null,
  });
  desktop.onSyncState(onSyncState);
  desktop.onDeadlinesChanged(() => void refreshDeadlines());
  desktop.onCommand((cmd) => {
    for (const l of commandListeners) l(cmd);
  });
  await refresh();
  const sync = await desktop.getSyncState();
  onSyncState(sync);
  set({ mode: "desktop" });
}

/** Alles neu laden (Status, Dateien, Fristen, Einstellungen). */
export async function refresh() {
  const d = api();
  const [status, files, runs, calendars] = await Promise.all([d.getStatus(), d.getFiles(), d.getRuns(1), d.getCalendars()]);
  const courses = files.map(toCourse);
  colorOrder = courses.map((c) => c.id);
  courseToModule = new Map(
    files.flatMap((m) => m.parts.map((p) => [p.courseId, { moduleId: m.id, label: p.label, name: m.name }] as const)),
  );
  const last = runs[runs.length - 1];
  const failed = last
    ? [
        ...new Set(
          Object.entries(last.courses ?? {})
            .filter(([, c]) => c.status === "error")
            .map(([id]) => courseToModule.get(id)?.moduleId ?? id),
        ),
      ]
    : [];
  const lastStatus = status.lastSync?.status ?? null;
  const problem: Problem =
    lastStatus === "offline" ? "offline" : lastStatus === "login" ? "loginExpired" : failed.length ? "courseFailed" : "none";
  set({
    user: status.username,
    loggedIn: status.loggedIn,
    configured: status.configured,
    targetPath: status.targetDir ?? status.defaultTargetDir,
    targetDir: tildePath(status.targetDir ?? status.defaultTargetDir),
    courses,
    lastSync: lastSyncLabel(status.lastSync?.at ?? null),
    lastSyncAt: status.lastSync?.at ?? null,
    lastStatus,
    failedCourseIds: failed,
    problem,
    today: localIso(),
    schedule: { enabled: status.schedule.enabled, time: status.schedule.time, every: status.schedule.every ?? "daily" },
    notifications: status.notifications,
    launchAtLogin: status.launchAtLogin,
    calendars,
  });
  try {
    await refreshDeadlines();
  } catch (e) {
    // Fristen kaputt? Die App öffnet trotzdem (mit Dateien), statt leer zu bleiben.
    console.error("[deadlines]", e);
  }
}

export async function refreshDeadlines() {
  const d = api();
  const [{ deadlines }, done, custom] = await Promise.all([
    d.getDeadlines(),
    d.getDoneDeadlines(),
    d.getCustomEvents ? d.getCustomEvents() : Promise.resolve({ events: [], hidden: [] }),
  ]);
  applyCalendar({ autoDeadlines: deadlines.map(toDeadline), done, customEvents: custom.events, hiddenEvents: custom.hidden });
}

// ------------------------------------------------------------------ Eigene Termine, Kalender bearbeiten

/** Eigenen Termin anlegen oder ändern. Im Browser nur im Speicher. */
export async function saveEvent(ev: CustomEvent): Promise<{ ok: boolean; message?: string }> {
  const before = state.customEvents;
  const exists = before.some((e) => e.id === ev.id);
  applyCalendar({ customEvents: exists ? before.map((e) => (e.id === ev.id ? ev : e)) : [...before, ev] });
  if (state.mode !== "desktop") return { ok: true };
  const res = await api().saveCustomEvent(ev);
  if (!res.ok) {
    applyCalendar({ customEvents: before });
    return { ok: false, message: res.message };
  }
  applyCalendar({ customEvents: state.customEvents.map((e) => (e.id === ev.id ? res.event : e)) });
  return { ok: true };
}

export async function deleteEvent(id: string) {
  applyCalendar({ customEvents: state.customEvents.filter((e) => e.id !== id) });
  if (state.mode === "desktop") await api().deleteCustomEvent(id);
}

/** Nur einen Tag eines wiederkehrenden eigenen Termins auslassen. */
export async function skipOccurrence(id: string, day: string) {
  const ev = state.customEvents.find((e) => e.id === id);
  if (ev) await saveEvent({ ...ev, exceptions: [...new Set([...ev.exceptions, day])] });
}

/** Erkannten Termin (Id) oder ganze Serie ausblenden bzw. wieder zeigen; "*" zeigt alle wieder. */
export async function hideEvent(key: string, hidden = true) {
  const set0 = new Set(state.hiddenEvents);
  if (key === "*") set0.clear();
  else if (hidden) set0.add(key);
  else set0.delete(key);
  applyCalendar({ hiddenEvents: [...set0] });
  if (state.mode === "desktop") await api().setEventHidden(key, hidden);
}

/** Module, die in der Kursübersicht erscheinen (ohne Sammelmodul „Other“). */
export function realCourses(courses: Course[]) {
  return courses.filter((c) => c.id !== OTHER_ID);
}

// ------------------------------------------------------------------ Sync-Fortschritt

let importing = false;

function rowName(courseId: string, title: string) {
  const m = courseToModule.get(courseId);
  if (m) return m.label && m.label !== "Course" ? `${m.name} · ${m.label}` : m.name;
  return title.replace(/^\s*\[[^\]]*\]\s*/, "");
}

let doneCount = 0;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function onSyncState(s: SyncState) {
  const prev = state.job;
  if (s.running) {
    // Sobald ein Kurs fertig ist, seine Dateien schon zeigen (nicht erst am Ende)
    const finished = Object.values(s.courses ?? {}).filter((c) => c.status === "done").length;
    if (finished > doneCount && !refreshTimer) {
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void refresh();
      }, 800);
    }
    doneCount = finished;
    const rows = (s.order ?? []).map((id) => {
      const c = s.courses?.[id];
      const status: JobRowStatus =
        c?.status === "running" ? "running" : c?.status === "done" ? "done" : c?.status === "error" ? "failed" : "waiting";
      return {
        id,
        moduleId: courseToModule.get(id)?.moduleId ?? null,
        name: rowName(id, c?.title ?? id),
        count: c?.added ?? 0,
        total: 0,
        status,
      };
    });
    // Erster Import: alle Kurse werden zum ersten Mal geladen
    const first = importing || (s.initialCourses?.length ?? 0) >= Math.max(1, (s.order?.length ?? 0) / 2);
    set({
      job: {
        kind: first ? "import" : "sync",
        running: true,
        stopped: false,
        etaSeconds: s.etaSeconds ?? null,
        etaAt: (s.etaAt ?? Date.now() / 1000) * 1000,
        rows,
      },
    });
    return;
  }
  if (prev?.running) {
    // Gerade fertig geworden: letzten Stand behalten, Daten neu laden.
    const stopped = s.lastStatus === "cancelled";
    const rows = prev.rows.map((r) => ({
      ...r,
      status: (r.status === "running" || r.status === "waiting" ? (stopped ? "waiting" : "done") : r.status) as JobRowStatus,
    }));
    importing = false;
    doneCount = 0;
    set({ job: { ...prev, running: false, stopped, etaSeconds: 0, rows } });
    void refresh();
  }
}

// ------------------------------------------------------------------ Aktionen

export async function login(username: string, password: string): Promise<LoginOutcome> {
  const res = await api().login(username, password);
  if (res.ok) {
    await refresh();
    return { ok: true };
  }
  const reason = res.code === "wrong_password" ? "wrong" : res.code === "unreachable" ? "offline" : "error";
  return { ok: false, reason, message: res.message };
}

export async function logout() {
  if (state.mode !== "desktop") return;
  await api().logout();
  set({ loggedIn: false, user: null, configured: false, setupStatus: "idle", setupCourses: [], setupSelected: [] });
}

let setupModules: SetupModule[] = [];
let iliasCourses: Awaited<ReturnType<StudiDesktop["listCourses"]>> | null = null;

/** Module live von ILIAS holen (Einrichtung). */
export async function loadSetupCourses() {
  if (getDesktop() === null || state.setupStatus === "loading") return;
  set({ setupStatus: "loading", setupError: null });
  const res = await api().listCourses();
  if (!res.ok) {
    set({ setupStatus: "error", setupError: res.message });
    return;
  }
  iliasCourses = res;
  setupModules = res.modules;
  set({
    setupStatus: "ready",
    setupCourses: res.modules.map(toSetupModule),
    setupSelected: res.modules.filter((m) => m.selected || (state.courses.length === 0 && m.suggested)).map((m) => m.id),
  });
}

export function setSetupSelected(ids: string[]) {
  set({ setupSelected: ids });
}

export async function chooseFolder() {
  if (state.mode !== "desktop") return;
  const dir = await api().chooseFolder();
  if (dir) set({ targetPath: dir, targetDir: tildePath(dir) });
}

/** Auswahl speichern und den ersten Import (bzw. nach Kursänderung einen Sync) starten. */
export async function startImport(videos: boolean): Promise<{ ok: boolean; message?: string }> {
  if (state.mode !== "desktop") return { ok: true };
  // Sicherung: ohne frisch geladene ILIAS-Kurse nie speichern (würde die Auswahl leeren).
  if (!iliasCourses || !iliasCourses.ok || setupModules.length === 0) {
    return { ok: false, message: "Courses are still loading. Please wait a moment." };
  }
  const d = api();
  const chosen = new Set(state.setupSelected);
  const selectedCourses = new Set(setupModules.filter((m) => chosen.has(m.id)).flatMap((m) => m.parts.map((p) => p.courseId)));
  const saved = await d.saveSetup({
    targetDir: state.targetPath ?? undefined,
    courses: iliasCourses.courses.map((c) => ({
      id: c.id,
      kind: c.kind,
      refId: c.refId,
      title: c.title,
      semester: c.semester,
      parent: c.parent,
      selected: selectedCourses.has(c.id),
      videos: selectedCourses.has(c.id) && videos,
    })),
  });
  if (!saved.ok) return { ok: false, message: saved.message };
  importing = state.courses.filter((c) => c.id !== OTHER_ID).length === 0;
  await refresh();
  const started = await d.startSync();
  return started.ok || started.code === "busy" ? { ok: true } : { ok: false, message: started.message };
}

export async function syncNow() {
  if (state.mode !== "desktop") return;
  await api().startSync();
}

export async function cancelSync() {
  if (state.mode !== "desktop") return;
  await api().cancelSync();
}

export function dismissJob() {
  set({ job: null });
}

export async function toggleDone(id: string) {
  if (state.mode !== "desktop") return;
  const isDone = state.done.includes(id);
  const done = isDone ? state.done.filter((x) => x !== id) : [...state.done, id];
  set({ done, digests: buildDigests(state.courses, state.deadlines, done, state.today) });
  const res = await api().setDeadlineDone(id, !isDone);
  if (!res.ok) await refreshDeadlines();
}

/** Dateien als gesehen markieren (sofort in der Oberfläche, dann gespeichert). */
export async function markSeen(ids: string[]) {
  if (state.mode !== "desktop" || ids.length === 0) return;
  const set_ = new Set(ids);
  const courses = state.courses.map((c) => ({
    ...c,
    folders: c.folders.map((f) => ({
      ...f,
      files: f.files.map((x) => (set_.has(x.id) ? { ...x, isNew: false, changeNote: undefined } : x)),
    })),
  }));
  set({ courses, digests: buildDigests(courses, state.deadlines, state.done, state.today) });
  await api().markSeen(ids);
}

export function openFile(path?: string, id?: string) {
  if (state.mode !== "desktop" || !path) return;
  void api().openFile(path);
  if (id) void markSeen([id]);
}

export function revealFile(path?: string) {
  if (state.mode === "desktop" && path) void api().revealFile(path);
}

export function openIlias(url?: string | null) {
  if (state.mode === "desktop" && url) void api().openIlias(url);
}

export async function renameModule(id: string, name: string): Promise<{ ok: boolean; message?: string }> {
  if (state.mode !== "desktop") return { ok: true };
  // Sofort anzeigen, dann speichern (Ordner wird im Hintergrund mit umbenannt)
  const clean = name.replace(/\s+/g, " ").trim();
  set({ courses: state.courses.map((c) => (c.id === id ? { ...c, name: clean || c.name, short: clean || c.short, renamed: Boolean(clean) } : c)) });
  const res = await api().renameModule(id, clean);
  await refresh();
  return res.ok ? { ok: true } : { ok: false, message: res.message };
}

export async function setModuleColor(id: string, color: CourseColor | null) {
  if (state.mode !== "desktop") return;
  set({ courses: state.courses.map((c) => (c.id === id ? { ...c, color: color ?? undefined } : c)) });
  await api().setModuleColor(id, color);
}

/** Wahltermin als eigenen markieren: erscheint dann jede Woche im Kalender. */
export async function chooseSlot(moduleId: string, key: string, on: boolean) {
  const picked: ClassSlot["state"] = on ? "chosen" : "option";
  set({
    courses: state.courses.map((c) => (c.id === moduleId ? { ...c, slots: (c.slots ?? []).map((s) => (s.key === key ? { ...s, state: picked } : s)) } : c)),
  });
  if (state.mode !== "desktop") return;
  await api().setSlotChoice(moduleId, key, on);
  await Promise.all([refresh(), refreshDeadlines()]);
}

export async function setSchedule(enabled: boolean, time: string, every: SyncEvery = state.schedule.every) {
  if (state.mode !== "desktop") return { ok: true };
  set({ schedule: { enabled, time, every } });
  const res = await api().setSchedule({ enabled, time, every });
  if (!res.ok) await refresh();
  return res;
}

export async function setNotifications(on: boolean) {
  if (state.mode !== "desktop") return;
  set({ notifications: on });
  await api().setNotifications(on);
}

export async function setLaunchAtLogin(on: boolean) {
  if (state.mode !== "desktop") return;
  set({ launchAtLogin: on });
  await api().setLaunchAtLogin(on);
}

export async function addCalendar(url: string, name: string): Promise<{ ok: boolean; message?: string; count?: number }> {
  if (state.mode !== "desktop") return { ok: false, message: "Only in the Mac app." };
  const res = await api().addCalendar(url, name);
  set({ calendars: await api().getCalendars() });
  await refreshDeadlines();
  return res.ok ? { ok: true, count: res.count } : { ok: false, message: res.message };
}

export async function removeCalendar(id: string) {
  if (state.mode !== "desktop") return;
  set({ calendars: state.calendars.filter((c) => c.id !== id) });
  await api().removeCalendar(id);
  await refreshDeadlines();
}
