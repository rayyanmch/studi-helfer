"use client";

// Eine Datenquelle für die ganze Oberfläche.
//
//   Im Browser (npm run dev ohne Electron): Beispieldaten aus mock-data.ts, wie bisher.
//   In der Mac-App (Electron):             echte Daten über window.studi (desktop.ts).
//
// Komponenten lesen mit useApp() und rufen die Aktionen unten auf. Sie müssen nicht wissen, woher
// die Daten kommen. Formen sind die aus mock-data.ts (Course, Deadline, …).

import { useSyncExternalStore } from "react";
import * as mock from "./mock-data";
import type { Course, CourseColor, CourseFile, Deadline } from "./mock-data";
import {
  getDesktop,
  type DesktopCourse,
  type DesktopDeadline,
  type IliasCourse,
  type StudiDesktop,
  type SyncRunStatus,
  type SyncState,
} from "./desktop";

export type Mode = "loading" | "demo" | "desktop";
export type Problem = "none" | "offline" | "loginExpired" | "courseFailed";
export type LoginOutcome = { ok: true } | { ok: false; reason: "wrong" | "offline" | "error"; message: string };

export type JobRowStatus = "waiting" | "running" | "done" | "failed";
export interface StoreJob {
  kind: "import" | "sync";
  running: boolean;
  stopped: boolean;
  rows: { id: string; name: string; count: number; total: number; status: JobRowStatus }[];
}

export interface AppState {
  mode: Mode;
  user: string | null;
  loggedIn: boolean;
  configured: boolean;
  targetDir: string; // Anzeige, z. B. "~/Uni"
  targetPath: string | null; // absoluter Pfad
  courses: Course[]; // ausgewählte Kurse mit Dateien (Übersicht)
  setupCourses: Course[]; // alle Kurse aus ILIAS (Einrichtung)
  setupSelected: string[];
  setupStatus: "idle" | "loading" | "ready" | "error";
  setupError: string | null;
  deadlines: Deadline[];
  done: string[];
  digests: Record<string, string>;
  lastSync: string; // fertiger Text, z. B. "today, 09:41"
  lastStatus: SyncRunStatus | null;
  failedCourseIds: string[];
  problem: Problem;
  job: StoreJob | null;
  today: string; // "2026-11-20"
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
  done: [],
  digests: mock.digests,
  lastSync: `today, ${mock.LAST_SYNC}`,
  lastStatus: "ok",
  failedCourseIds: [],
  problem: "none",
  job: null,
  today: mock.TODAY,
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

// ------------------------------------------------------------------ Farben

const ORDER: CourseColor[] = ["blue", "orange", "green", "plum", "ochre", "teal", "rose", "indigo"];
let colorOrder: string[] = [];

/** Farbe eines Kurses: feste Reihenfolge nach den ausgewählten Kursen, damit Farben überall gleich bleiben. */
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

// ------------------------------------------------------------------ Hilfen

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localIso(d = new Date()) {
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

function toCourse(c: DesktopCourse): Course {
  return {
    id: c.id,
    name: c.name,
    lecturer: c.lecturer,
    total: c.total,
    folder: c.folder,
    folders: c.folders.map((f) => ({
      id: f.id,
      name: f.name,
      files: f.files.map(
        (x): CourseFile => ({
          id: x.id,
          name: x.name,
          kind: x.kind,
          size: x.size,
          updated: x.updated,
          isNew: x.isNew,
          path: x.path,
          changeNote: x.isChanged ? "Updated on ILIAS. Your old copy was kept." : undefined,
        }),
      ),
    })),
  };
}

function toSetupCourse(c: IliasCourse): Course {
  return {
    id: c.id,
    name: c.title,
    lecturer: "",
    total: 0,
    folders: [],
    semester: c.semester === "current" || c.selected ? "current" : "past",
    note: c.kind === "grp" ? "Group" : "Course",
  };
}

function toDeadline(d: DesktopDeadline): Deadline {
  // In der Oberfläche heißt source „wo“: Raum bei Terminen/Klausuren, Datei bei Fristen aus Übungsblättern.
  const source = d.location ?? (d.category === "sheet" || d.category === "ai" ? d.source : undefined);
  return { id: d.id, courseId: d.courseId, title: d.title, date: d.date, time: d.time, kind: d.kind, source };
}

/** Kurze Zusammenfassung pro Kurs ohne KI: neue/geänderte Dateien und die nächste Frist. */
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
      const wd = WEEKDAYS[new Date(`${next.date}T12:00:00`).getDay()];
      text += `${text ? " " : ""}Next up: ${next.title}, ${wd} ${next.time}.`;
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
    digests: {},
    done: [],
    job: null,
  });
  desktop.onSyncState(onSyncState);
  desktop.onDeadlinesChanged(() => void refreshDeadlines());
  await refresh();
  const sync = await desktop.getSyncState();
  onSyncState(sync);
  set({ mode: "desktop" });
}

/** Alles neu laden (Status, Dateien, Fristen). */
export async function refresh() {
  const d = api();
  const [status, files, runs] = await Promise.all([d.getStatus(), d.getFiles(), d.getRuns(1)]);
  const courses = files.map(toCourse);
  colorOrder = courses.map((c) => c.id);
  const last = runs[runs.length - 1];
  const failed = last
    ? Object.entries(last.courses ?? {})
        .filter(([, c]) => c.status === "error")
        .map(([id]) => id)
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
    lastStatus,
    failedCourseIds: failed,
    problem,
    today: localIso(),
  });
  await refreshDeadlines();
}

export async function refreshDeadlines() {
  const d = api();
  const [{ deadlines }, done] = await Promise.all([d.getDeadlines(), d.getDoneDeadlines()]);
  const list = deadlines.map(toDeadline);
  set({ deadlines: list, done, digests: buildDigests(state.courses, list, done, localIso()) });
}

// ------------------------------------------------------------------ Sync-Fortschritt

let importing = false;

function onSyncState(s: SyncState) {
  const prev = state.job;
  if (s.running) {
    const rows = (s.order ?? []).map((id) => {
      const c = s.courses?.[id];
      const status: JobRowStatus =
        c?.status === "running" ? "running" : c?.status === "done" ? "done" : c?.status === "error" ? "failed" : "waiting";
      return { id, name: (c?.title ?? id).replace(/^\s*\[[^\]]*\]\s*/, ""), count: c?.added ?? 0, total: 0, status };
    });
    set({ job: { kind: importing ? "import" : "sync", running: true, stopped: false, rows } });
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
    set({ job: { ...prev, running: false, stopped, rows } });
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

let iliasCourses: IliasCourse[] = [];

/** Kurse live von ILIAS holen (Einrichtung). */
export async function loadSetupCourses() {
  if (getDesktop() === null || state.setupStatus === "loading") return;
  set({ setupStatus: "loading", setupError: null });
  const res = await api().listCourses();
  if (!res.ok) {
    set({ setupStatus: "error", setupError: res.message });
    return;
  }
  iliasCourses = res.courses;
  set({
    setupStatus: "ready",
    setupCourses: res.courses.map(toSetupCourse),
    setupSelected: res.courses.filter((c) => c.selected).map((c) => c.id),
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
  if (iliasCourses.length === 0) return { ok: false, message: "Courses are still loading. Please wait a moment." };
  const d = api();
  const selected = new Set(state.setupSelected);
  const saved = await d.saveSetup({
    targetDir: state.targetPath ?? undefined,
    courses: iliasCourses.map((c) => ({
      id: c.id,
      kind: c.kind,
      refId: c.refId,
      title: c.title,
      selected: selected.has(c.id),
      videos: selected.has(c.id) && videos,
    })),
  });
  if (!saved.ok) return { ok: false, message: saved.message };
  importing = state.courses.length === 0;
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

export function openFile(path?: string) {
  if (state.mode === "desktop" && path) void api().openFile(path);
}

export function revealFile(path?: string) {
  if (state.mode === "desktop" && path) void api().revealFile(path);
}
