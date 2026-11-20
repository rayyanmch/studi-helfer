// Schnittstelle zwischen Oberfläche (web/) und Mac-App (desktop/).
//
// In der Electron-App gibt es `window.studi` (desktop/preload.js). Im normalen Browser
// (npm run dev ohne Electron) gibt es das nicht: getDesktop() liefert dann null und die
// Oberfläche nimmt weiter die Beispieldaten aus mock-data.ts.
//
//   const desktop = getDesktop();
//   if (desktop) { const files = await desktop.getFiles(); } else { /* Beispieldaten */ }
//
// Das Uni-Passwort geht nur an login() und landet im macOS-Schlüsselbund. Nie speichern oder loggen.

import type { Course, CourseFile, Folder } from "./mock-data";

/** Fehlercodes, die die Oberfläche übersetzen sollte. */
export type DesktopErrorCode =
  | "wrong_password" // Kennung/Passwort falsch
  | "unreachable" // ILIAS nicht erreichbar / offline
  | "not_logged_in" // kein Passwort im Schlüsselbund → Login-Screen
  | "not_configured" // Zielordner oder Kurse fehlen → Einrichtung
  | "busy" // Sync läuft schon
  | "keychain" // Schlüsselbund verweigert
  | "unexpected" // ILIAS-Seite sieht anders aus (z. B. Nutzungsbedingungen bestätigen)
  | "invalid"
  | "setup" // Python-Umgebung fehlt (nur Entwicklung)
  | "timeout"
  | "internal";

export type Fail = { ok: false; code: DesktopErrorCode; message: string };
export type Ok<T = object> = { ok: true } & T;

/** Ein Kurs oder eine Gruppe aus „Meine Kurse“ in ILIAS (für den Einrichtungs-Screen). */
export interface IliasCourse {
  id: string; // "crs-6997658" oder "grp-6999276"
  kind: "crs" | "grp";
  refId: string;
  title: string;
  semester: "current" | "past" | "unknown";
  suggested: boolean; // vom Programm vorgeschlagen (aktuelles Semester)
  selected: boolean; // gespeicherte Auswahl (bei Ersteinrichtung = suggested)
  videos: boolean; // Videos mitladen (Standard aus)
}

export type SyncRunStatus = "ok" | "error" | "offline" | "login";
export type CourseSyncStatus = "waiting" | "running" | "done" | "error";

/** Laufender Sync. Kommt über onSyncState() etwa jede Sekunde, solange sich etwas ändert. */
export interface SyncState {
  running: boolean;
  trigger?: "manual" | "auto";
  startedAt?: number; // Sekunden (Unix)
  waitingUntil?: number; // automatischer Lauf wartet zufällig ein paar Minuten
  retryAt?: number; // offline: nächster Versuch
  currentCourse?: string | null;
  order?: string[]; // Kurs-IDs in Sync-Reihenfolge
  courses?: Record<
    string,
    { title: string; status: CourseSyncStatus; added: number; changed: number; problems: string[] }
  >;
  // Nur wenn running = false:
  lastEnd?: number;
  lastStatus?: SyncRunStatus;
  interrupted?: boolean;
}

export interface DesktopStatus {
  loggedIn: boolean;
  username: string | null;
  targetDir: string | null;
  defaultTargetDir: string; // ~/Uni als absoluter Pfad
  configured: boolean; // Zielordner + mindestens ein Kurs gewählt
  schedule: { enabled: boolean; time: string; active: boolean }; // täglich, auch wenn die App zu ist
  lastSync: { at: number; status: SyncRunStatus; added: number } | null; // at in Millisekunden
  sync: SyncState;
}

/** Datei auf dem Mac: Form wie in mock-data.ts plus Pfad für Öffnen/Im Finder zeigen. */
export interface DesktopFile extends CourseFile {
  path: string;
  modifiedAt: number;
}
export interface DesktopFolder extends Omit<Folder, "files"> {
  files: DesktopFile[]; // name = Pfad im Kurs, z. B. "Vorlesung/Woche 1"; Dateien direkt im Kurs: "Allgemein"
}
export interface DesktopCourse extends Omit<Course, "folders"> {
  folder: string; // Kursordner auf dem Mac
  folders: DesktopFolder[]; // lecturer ist leer, total = Anzahl lokaler Dateien
}

export interface SyncRun {
  id: string;
  start: number;
  end: number;
  duration: number;
  trigger: "manual" | "auto";
  status: SyncRunStatus;
  added: { course: string; path: string }[];
  changed: { course: string; path: string }[];
  problems: { course: string | null; message: string }[];
}

export interface StudiDesktop {
  isDesktop: true;
  getStatus(): Promise<DesktopStatus>;
  /** Prüft den Login bei ILIAS (dauert ein paar Sekunden) und legt das Passwort im Schlüsselbund ab. */
  login(username: string, password: string): Promise<Ok<{ username: string }> | Fail>;
  /** Löscht den Schlüsselbund-Eintrag und schaltet den täglichen Sync aus. Dateien bleiben. */
  logout(): Promise<Ok>;
  /** Holt „Meine Kurse“ live von ILIAS (mehrere Sekunden). */
  listCourses(): Promise<Ok<{ courses: IliasCourse[] }> | Fail>;
  /** Speichert Zielordner und Auswahl. Beim ersten Mal wird der tägliche Sync (07:00) eingeschaltet. */
  saveSetup(setup: {
    targetDir?: string;
    courses: Pick<IliasCourse, "id" | "kind" | "refId" | "title" | "selected" | "videos">[];
  }): Promise<Ok | Fail>;
  /** Mac-Ordnerdialog. null = abgebrochen. */
  chooseFolder(): Promise<string | null>;
  /** Startet einen Sync im Hintergrund (läuft auch weiter, wenn die App geschlossen wird). */
  startSync(): Promise<Ok | Fail>;
  getSyncState(): Promise<SyncState>;
  onSyncState(callback: (state: SyncState) => void): () => void;
  getRuns(limit?: number): Promise<SyncRun[]>;
  getFiles(): Promise<DesktopCourse[]>;
  openFile(path: string): Promise<Ok | Fail>;
  revealFile(path: string): Promise<Ok | Fail>;
  setSchedule(schedule: { enabled: boolean; time?: string }): Promise<
    Ok<{ enabled: boolean; time?: string }> | Fail
  >;
}

declare global {
  interface Window {
    studi?: StudiDesktop;
  }
}

/** Zugriff auf die Mac-App. null im normalen Browser oder beim Server-Rendering. */
export function getDesktop(): StudiDesktop | null {
  if (typeof window === "undefined") return null;
  return window.studi ?? null;
}
