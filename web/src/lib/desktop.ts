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

import type { Course, CourseFile, Deadline, Folder } from "./mock-data";

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
  | "no_key" // KI: kein Schlüssel eingerichtet
  | "rate_limited" // KI: gerade ausgelastet
  | "ai_error"
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

export type SyncRunStatus = "ok" | "error" | "offline" | "login" | "cancelled"; // login = Anmeldung abgelaufen
export type CourseSyncStatus = "waiting" | "running" | "done" | "error" | "cancelled";

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
  isChanged: boolean; // im letzten Sync durch eine neue Fassung aus ILIAS ersetzt
  previousVersion?: string; // Pfad zur gesicherten alten Fassung (für den KI-Unterschied)
}
export interface DesktopFolder extends Omit<Folder, "files"> {
  files: DesktopFile[]; // name = Pfad im Kurs, z. B. "Vorlesung/Woche 1"; Dateien direkt im Kurs: "Allgemein"
}
export interface DesktopCourse extends Omit<Course, "folders"> {
  folder: string; // Kursordner auf dem Mac
  folders: DesktopFolder[]; // lecturer ist leer, total = Anzahl lokaler Dateien
}

/**
 * Frist oder Termin aus dem ILIAS-Kalender. Form wie Deadline in mock-data.ts plus Extras.
 * kind "abgabe" = Abgabetermin einer Übung; "termin" = Sitzung (Vorlesung/Übung mit Ort) oder Anmeldeschluss.
 * time: "bis 23:55", "bis 24:00", "10:00" oder "ganztägig". date: "2026-11-23" (Berliner Zeit).
 * Kommen nur für ausgewählte Kurse, ab 14 Tagen in der Vergangenheit.
 */
export interface DesktopDeadline extends Deadline {
  // sheet = per Regeln lokal in einem Übungsblatt gefunden (source "Übungsblatt: <Datei>", dazu file + evidence)
  // ai = von der KI in einem Übungsblatt gefunden (nur mit Schlüssel; source "KI: <Datei>")
  category: "exercise" | "session" | "registration" | "sheet" | "ai";
  start: string; // ISO-Zeitpunkt, z. B. "2026-11-23T10:00:00+01:00"
  url: string | null; // ILIAS-Seite (Übung/Sitzung), z. B. für „In ILIAS öffnen“
  location: string | null; // Raum bei Sitzungen
  done: boolean; // abgehakt (setDeadlineDone)
  file?: string; // sheet/ai: Pfad des Übungsblatts (für „Öffnen“)
  evidence?: string; // sheet/ai: kurze Textstelle, auf der die Frist beruht (z. B. "Deadline: 23.11.2026, 10:00")
}

export interface SyncRun {
  id: string;
  start: number;
  end: number;
  duration: number;
  trigger: "manual" | "auto";
  status: SyncRunStatus;
  added: { course: string; path: string }[];
  changed: { course: string; path: string; previous?: string }[];
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
  /** Bricht den laufenden Sync ab. Schon geladene Dateien bleiben, der Lauf endet mit Status "cancelled". */
  cancelSync(): Promise<Ok | Fail>;
  getSyncState(): Promise<SyncState>;
  onSyncState(callback: (state: SyncState) => void): () => void;
  getRuns(limit?: number): Promise<SyncRun[]>;
  getFiles(): Promise<DesktopCourse[]>;
  openFile(path: string): Promise<Ok | Fail>;
  revealFile(path: string): Promise<Ok | Fail>;
  setSchedule(schedule: { enabled: boolean; time?: string }): Promise<
    Ok<{ enabled: boolean; time?: string }> | Fail
  >;
  /** Letzter Stand der Fristen (sofort, ohne Netz). Wird bei jedem Sync automatisch aktualisiert. */
  getDeadlines(): Promise<{ updatedAt: number | null; deadlines: DesktopDeadline[] }>;
  /** Fristen jetzt neu holen: ILIAS-Kalender + Übungsblätter per Regeln (ca. 5–30 Sekunden). Danach getDeadlines(). */
  refreshDeadlines(): Promise<Ok<{ count: number }> | Fail>;
  /**
   * Übungsblätter der letzten 4 Wochen, die noch nicht ausgewertet sind, an die KI schicken (je Datei nur einmal).
   * Läuft automatisch nach jedem Sync und kurz nach dem App-Start; danach meldet onDeadlinesChanged.
   * Fehlercode "no_key": kein KI-Schlüssel eingerichtet.
   */
  refreshAiDeadlines(): Promise<
    Ok<{ analyzed: number; found: number }> | (Fail & { analyzed: number; found: number })
  >;
  /** Fristen haben sich geändert (Sync fertig oder KI hat neue gefunden) → getDeadlines() neu aufrufen. */
  onDeadlinesChanged(callback: () => void): () => void;
  /** Ids aller abgehakten Fristen. Lokal in den App-Daten gespeichert, übersteht Neustarts und Syncs. */
  getDoneDeadlines(): Promise<string[]>;
  /** Frist abhaken (done = true) oder wieder öffnen. Id am besten mit deadlineId() bilden. */
  setDeadlineDone(id: string, done: boolean): Promise<Ok | Fail>;
}

declare global {
  interface Window {
    studi?: StudiDesktop;
  }
}

/**
 * Stabile Id für eine Frist: bleibt über Syncs gleich, solange Kurs, Titel und Datum gleich bleiben.
 * Dieselbe Regel nutzt später der Import aus dem ILIAS-Kalender.
 */
export function deadlineId(courseId: string, title: string, date: string): string {
  const norm = (s: string) => s.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
  return `${courseId}|${norm(title)}|${date}`;
}

/** Zugriff auf die Mac-App. null im normalen Browser oder beim Server-Rendering. */
export function getDesktop(): StudiDesktop | null {
  if (typeof window === "undefined") return null;
  return window.studi ?? null;
}
