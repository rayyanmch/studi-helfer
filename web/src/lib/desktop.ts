// Schnittstelle zwischen Oberfläche (web/) und Mac-App (desktop/).
//
// In der Electron-App gibt es `window.studi` (desktop/preload.js). Im normalen Browser
// (npm run dev ohne Electron) gibt es das nicht: getDesktop() liefert dann null und die
// Oberfläche nimmt weiter die Beispieldaten aus mock-data.ts.
//
//   const desktop = getDesktop();
//   if (desktop) { const files = await desktop.getFiles(); } else { /* Beispieldaten */ }
//
// Alle Texte, die von hier kommen (message, time, title, updated), sind englisch.
// Das Uni-Passwort geht nur an login() und landet im macOS-Schlüsselbund. Nie speichern oder loggen.

import type { ClassSlot, Course, CourseColor, CourseCredits, CourseFile, CustomEvent, Deadline, Folder } from "./mock-data";

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
  | "cancelled" // abgebrochen (z. B. Speichern-Dialog)
  | "no_ai" // Lernbereich: Claude Code fehlt oder ist nicht angemeldet
  | "no_text" // Lernbereich: Datei hat kaum Text (Folien als Bilder)
  | "unsupported"
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
  parent: string | null; // nur Gruppen: Kurs, zu dem die Gruppe gehört
}

/** Modul = Kurs + Übung + Übungsgruppe(n), ohne KI zusammengefasst (desktop/lib/modules.js). */
export interface SetupModule {
  id: string; // "mod-crs-6999275"
  name: string; // Kurzname, z. B. "Mathe I" (oder selbst vergebener Name)
  fullName: string; // "Mathematik für Studierende der Informatik I"
  semester: "current" | "past" | "unknown";
  parts: { courseId: string; label: string }[]; // "Lecture", "Exercises", "Tutorial group 05"
  suggested: boolean;
  selected: boolean;
  videos: boolean;
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
  etaSeconds?: number | null; // geschätzte Restzeit beim Zeitpunkt etaAt; null = noch keine Schätzung möglich
  etaAt?: number; // Sekunden (Unix); Restzeit jetzt ≈ etaSeconds − (jetzt − etaAt)
  initialCourses?: string[]; // Kurse, die zum ersten Mal geladen werden (= erster Import)
  // Nur wenn running = false:
  lastEnd?: number;
  lastStatus?: SyncRunStatus;
  interrupted?: boolean;
}

/** Wie oft automatisch geholt wird: alle 30 min / 1 h / 3 h oder täglich zur Uhrzeit `time`. */
export type SyncEvery = "30m" | "1h" | "3h" | "daily";

export interface DesktopStatus {
  loggedIn: boolean;
  username: string | null;
  targetDir: string | null;
  defaultTargetDir: string; // ~/Uni als absoluter Pfad
  configured: boolean; // Zielordner + mindestens ein Kurs gewählt
  schedule: { enabled: boolean; time: string; every?: SyncEvery; active: boolean }; // auch wenn die App zu ist
  lastSync: { at: number; status: SyncRunStatus; added: number; iliasDown?: boolean } | null; // at in Millisekunden; iliasDown = Internet ging, nur ILIAS nicht
  sync: SyncState;
  notifications: boolean;
  launchAtLogin: boolean;
}

/** Datei auf dem Mac: Form wie in mock-data.ts plus Pfad für Öffnen/Im Finder zeigen. */
export type FileCategory =
  | "lectures"
  | "exercises"
  | "solutions"
  | "readings"
  | "selfstudy"
  | "exams"
  | "info"
  | "recordings"
  | "other";

export interface DesktopFile extends CourseFile {
  path: string;
  modifiedAt: number;
  part: string | null; // Teil des Moduls ("Lecture", "Exercises" …), null bei nur einem Teil
  where: string; // Ordner in ILIAS, z. B. "Woche 3 - Absatzmärkte/Vorlesung"
  unit: number | null; // Nummer zum Sortieren (Woche 3, VL08 …)
  category: FileCategory;
  isChanged: boolean; // im letzten Sync durch eine neue Fassung aus ILIAS ersetzt
  previousVersion?: string; // Pfad zur gesicherten alten Fassung (für den KI-Unterschied)
}
/** Eine Art von Dateien im Modul („Lecture slides“, „Exercises“ …), schon sortiert. */
export interface DesktopFolder extends Omit<Folder, "files"> {
  category: FileCategory;
  files: DesktopFile[];
}
/** Modul mit Dateien (id = Modul-Id, z. B. "mod-crs-6999275"). */
export interface DesktopCourse extends Omit<Course, "folders" | "color" | "semester" | "parts"> {
  fullName: string;
  autoName: string; // automatischer Kurzname
  renamed: boolean; // name selbst vergeben
  color: CourseColor | null; // selbst gewählt, sonst null (Oberfläche vergibt eine)
  semester: "current" | "past" | "unknown";
  folder: string; // Modulordner auf dem Mac
  iliasUrl: string | null;
  parts: { courseId: string; label: string; folder: string | null }[];
  slots: ClassSlot[]; // Wochenplan aus den Orga-Folien (leer, wenn nichts gefunden)
  credits?: CourseCredits | null; // Leistungspunkte aus den Orga-Folien (orga.py), null = nicht gefunden
  folders: DesktopFolder[]; // lecturer ist leer, total = Anzahl lokaler Dateien
}

/**
 * Frist oder Termin aus dem ILIAS-Kalender. Form wie Deadline in mock-data.ts plus Extras.
 * kind "abgabe" = Abgabetermin einer Übung; "termin" = Sitzung (Vorlesung/Übung mit Ort) oder Anmeldeschluss.
 * time: "by 23:55", "by midnight", "10:00" or "all day" (English, shown as is). date: "2026-11-23" (Berlin time).
 * Kommen nur für ausgewählte Kurse, ab 14 Tagen in der Vergangenheit.
 */
export interface DesktopDeadline extends Deadline {
  // sheet = per Regeln lokal in einem Übungsblatt gefunden (source "Exercise sheet: <Datei>", dazu file + evidence)
  // ai = von der KI in einem Übungsblatt gefunden (nur mit Schlüssel; source "AI: <Datei>")
  // calendar = aus einem eingefügten Kalender (KLIPS-Stundenplan o. Ä.), moduleId per Namensabgleich (kann null sein)
  // schedule = Wochentermin aus den Orga-Folien (Vorlesung, eigene Gruppe, ausgewählter Wahltermin), source "Course info: <Datei>"
  category: "exercise" | "session" | "registration" | "sheet" | "calendar" | "ai" | "schedule" | "uni";
  moduleId: string | null; // Modul, zu dem der Termin gehört
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
  courses?: Record<string, { title: string; status: CourseSyncStatus; added: number; changed: number; problems: string[] }>;
}

export interface StudiDesktop {
  isDesktop: true;
  getStatus(): Promise<DesktopStatus>;
  /** Prüft den Login bei ILIAS (dauert ein paar Sekunden) und legt das Passwort im Schlüsselbund ab. */
  login(username: string, password: string): Promise<Ok<{ username: string }> | Fail>;
  /** Löscht den Schlüsselbund-Eintrag und schaltet den täglichen Sync aus. Dateien bleiben. */
  logout(): Promise<Ok>;
  /** Holt „Meine Kurse“ live von ILIAS (mehrere Sekunden). */
  listCourses(): Promise<Ok<{ courses: IliasCourse[]; modules: SetupModule[] }> | Fail>;
  /** Speichert Zielordner und Auswahl. Beim ersten Mal wird der tägliche Sync (07:00) eingeschaltet. */
  saveSetup(setup: {
    targetDir?: string;
    courses: (Pick<IliasCourse, "id" | "kind" | "refId" | "title" | "selected" | "videos"> &
      Partial<Pick<IliasCourse, "semester" | "parent">>)[];
  }): Promise<Ok | Fail>;
  /** Mac-Ordnerdialog. null = abgebrochen. */
  chooseFolder(): Promise<string | null>;
  /** Startet einen Sync im Hintergrund (läuft auch weiter, wenn die App geschlossen wird). */
  startSync(): Promise<Ok | Fail>;
  /** Bricht den laufenden Sync ab. Schon geladene Dateien bleiben, der Lauf endet mit Status "cancelled". */
  cancelSync(): Promise<Ok | Fail>;
  getSyncState(): Promise<SyncState>;
  onSyncState(callback: (state: SyncState) => void): () => void;
  /** Neue Dateien ohne Sync (PDFs der ILIAS-Selbstlerneinheiten, die die App nach dem Sync druckt) → getFiles() neu. Ältere Apps: fehlt. */
  onFilesChanged?(callback: () => void): () => void;
  getRuns(limit?: number): Promise<SyncRun[]>;
  getFiles(): Promise<DesktopCourse[]>;
  openFile(path: string): Promise<Ok | Fail>;
  revealFile(path: string): Promise<Ok | Fail>;
  setSchedule(schedule: { enabled: boolean; time?: string; every?: SyncEvery }): Promise<
    Ok<{ enabled: boolean; time?: string; every?: SyncEvery }> | Fail
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
  /** Modul umbenennen (leer = automatischer Name). Der Ordner auf dem Mac wird mit umbenannt. */
  renameModule(id: string, name: string): Promise<Ok<{ moved: number; deferred: boolean }> | Fail>;
  /** Farbe eines Moduls (null = automatisch). */
  setModuleColor(id: string, color: CourseColor | null): Promise<Ok | Fail>;
  /** Wahltermin („Exercise Mon 12:00 or Wed 17:45“) als eigenen markieren (on) oder abwählen. Danach getDeadlines()/getFiles() neu holen. */
  setSlotChoice(moduleId: string, key: string, on: boolean): Promise<Ok | Fail>;
  /** Eigene Termine und ausgeblendete erkannte Termine (Ids bzw. Serien, siehe recurrence.ts seriesOf). */
  getCustomEvents(): Promise<{ events: CustomEvent[]; hidden: string[] }>;
  /** Neu anlegen oder ersetzen (gleiche id). Gibt den gesäuberten Termin zurück. */
  saveCustomEvent(event: CustomEvent): Promise<Ok<{ event: CustomEvent }> | Fail>;
  deleteCustomEvent(id: string): Promise<Ok | Fail>;
  /** Erkannten Termin oder Serie ausblenden (hidden) bzw. wieder zeigen; key "*" zeigt alle wieder. */
  setEventHidden(key: string, hidden: boolean): Promise<Ok | Fail>;
  /** Kleines Vorschaubild (data:-URL) eines Mensa-Fotos von CloudMensa; null bei Fehler. Zwischengespeichert. */
  mensaThumb(url: string, size?: "small" | "large"): Promise<string | null>;
  /** Dateien als gesehen markieren (verschwinden aus „New“). */
  markSeen(fileIds: string[]): Promise<Ok>;
  setNotifications(on: boolean): Promise<Ok>;
  setLaunchAtLogin(on: boolean): Promise<Ok>;
  /** Eingefügte Kalender (z. B. KLIPS-Stundenplan als iCal-Link). */
  getCalendars(): Promise<{ id: string; name: string; url: string; ok: boolean | null; error: string | null; count: number }[]>;
  addCalendar(url: string, name: string): Promise<Ok<{ count: number }> | Fail>;
  removeCalendar(id: string): Promise<Ok>;
  openIlias(url: string): Promise<{ ok: boolean }>;
  /** Befehle aus dem App-Menü/Tastenkürzeln: "sync", "settings", "search", "week", "new", "courses". */
  onCommand(callback: (cmd: string) => void): () => void;
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
