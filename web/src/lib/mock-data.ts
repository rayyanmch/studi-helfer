// Beispieldaten für die Oberfläche. Die Form (Kurs → Ordner → Datei) bleibt bewusst flach,
// damit der Hintergrundteil (desktop/) später dasselbe liefern kann.
// desktop.ts baut auf diesen Typen auf: neue Felder nur optional hinzufügen.

export type FileKind = "pdf" | "zip" | "doc" | "other";

export interface CourseFile {
  id: string;
  name: string;
  kind: FileKind;
  size: string;
  updated: string; // fertig formatierter Text, z. B. "today", "Nov 12"
  isNew: boolean; // neu seit dem letzten Sync
  changeNote?: string; // geänderte Datei: was die KI als Unterschied gefunden hat
  path?: string; // nur in der Mac-App: Pfad auf dem Mac (Öffnen, Im Finder zeigen)
  part?: string | null; // Teil des Moduls („Lecture“, „Exercises“, „Tutorial group 05“)
  where?: string; // Ordner in ILIAS, z. B. „Woche 3/Vorlesung“
  modifiedAt?: number; // ms, zum Sortieren nach Datum
}

export interface Folder {
  id: string;
  name: string;
  category?: string; // Art der Dateien („lectures“, „exercises“ …), in der Mac-App gesetzt
  files: CourseFile[];
}

export type CourseColor = "blue" | "orange" | "green" | "plum" | "ochre" | "teal" | "rose" | "indigo";

export interface Course {
  id: string;
  name: string;
  lecturer: string;
  total: number; // Dateien auf dem Server (für den Import)
  folders: Folder[];
  color?: CourseColor; // fehlt sie, vergibt die Oberfläche eine nach Reihenfolge
  short?: string; // Kurzname für enge Stellen ("Mathe I"); fehlt er, kürzt die Oberfläche selbst
  semester?: "current" | "past"; // wie IliasCourse.semester in desktop.ts; fehlt es, gilt "current"
  folder?: string; // nur in der Mac-App: Kursordner auf dem Mac (Im Finder zeigen)
  note?: string; // Zeile unter dem Namen auf der Einrichtungs-Kachel; fehlt sie: "Lehrende, N files"
  fullName?: string; // voller Name, wenn name ein Kurzname ist („Mathematik für Studierende der Informatik I“)
  parts?: { id: string; label: string }[]; // Teile des Moduls (Vorlesung, Übung, Übungsgruppe)
  renamed?: boolean; // Name selbst vergeben
  iliasUrl?: string | null; // Kursseite in ILIAS
  slots?: ClassSlot[]; // Wochenplan aus den Orga-Folien (nur Mac-App); Wahltermine lassen sich auswählen
}

/**
 * Wöchentlicher Termin aus den Orga-Folien („Exercise · Group 3, Tue 14:00–15:30, room S234“).
 * state: fixed = gilt für alle (Vorlesung), mine = eigene ILIAS-Gruppe, chosen = selbst ausgewählt,
 * option = Wahltermin, noch nicht ausgewählt (steht nicht im Kalender).
 */
export interface ClassSlot {
  key: string;
  type: "lecture" | "exercise" | "tutorial" | "seminar";
  label: string; // "Exercise · Group 3"
  weekday: number; // 0 = Montag
  start: string; // "14:00"
  end: string; // "15:30"
  room: string | null;
  group: number | null;
  state: "fixed" | "mine" | "chosen" | "option";
  source: string; // "Course info: 01_Introduction.pdf" oder "Your ILIAS group"
}

/** Frist aus dem ILIAS-Kalender oder von der KI in einem Übungsblatt gefunden. */
export interface Deadline {
  id: string;
  courseId: string;
  title: string;
  date: string; // "2026-11-23"
  time: string; // "by 10:00", "14:00" oder "all day" (wie deadlines.py)
  kind: "abgabe" | "termin" | "klausur"; // nur "abgabe" lässt sich abhaken
  source?: string; // wo die KI die Frist gefunden hat
  color?: CourseColor; // eigene Farbe (eigene Termine); fehlt sie, gilt die Kursfarbe
  customId?: string; // eigener Termin: Id in CustomEvent (zum Bearbeiten)
  seriesId?: string; // wiederkehrender erkannter Termin (zum Ausblenden der ganzen Serie)
  notes?: string; // Notiz zu eigenem Termin
  location?: string | null; // Ort (für den Termin-Dialog)
  /** Raum nur für diesen Tag per Mail geändert (lib/room-changes.ts); `was` = der normale Raum. */
  roomChange?: { was: string | null; mailId: string; subject: string };
}

/**
 * Selbst eingetragener Termin („Mathe tutorial group 05, every Thursday 10:00–11:30“).
 * Wird in der Mac-App gespeichert (custom-events.json), im Browser nur im Speicher.
 */
export interface CustomEvent {
  id: string; // "ev-…"
  title: string;
  moduleId: string | null; // Modul (Course.id) oder null = ohne Kurs
  color: CourseColor | null; // null = Farbe des Moduls
  kind: "termin" | "abgabe" | "klausur";
  date: string; // erster Tag, "2026-11-26"
  start: string | null; // "10:00"; null = ganztägig
  end: string | null; // "11:30"
  location: string;
  notes: string;
  repeat: "none" | "daily" | "weekly" | "biweekly" | "monthly";
  weekdays: number[]; // bei weekly/biweekly: 0 = Montag … 6 = Sonntag (leer = Wochentag von date)
  until: string | null; // letzter Tag; null = Ende der Vorlesungszeit (bei Wiederholung)
  skipHolidays: boolean; // Feiertage, Weihnachtspause, Rosenmontag auslassen
  exceptions: string[]; // einzelne ausgelassene Tage
}

export const TODAY = "2026-11-20";
export const LAST_SYNC = "09:41";
export const TARGET_FOLDER = "~/Uni";

export const courses: Course[] = [
  {
    id: "softwaretechnik",
    name: "Software Engineering",
    short: "SE",
    lecturer: "Prof. Dr. Wagner",
    total: 31,
    color: "blue",
    folders: [
      {
        id: "st-vorlesung",
        name: "Lectures",
        files: [
          { id: "st1", name: "01 Introduction.pdf", kind: "pdf", size: "1.2 MB", updated: "Oct 12", isNew: false },
          { id: "st2", name: "02 Requirements.pdf", kind: "pdf", size: "2.4 MB", updated: "Oct 19", isNew: false },
          { id: "st3", name: "03 Design Patterns.pdf", kind: "pdf", size: "3.1 MB", updated: "today", isNew: true },
        ],
      },
      {
        id: "st-uebung",
        name: "Exercises",
        files: [
          { id: "st4", name: "Exercise Sheet 4.pdf", kind: "pdf", size: "310 KB", updated: "today", isNew: true },
          {
            id: "st5",
            name: "Exercise Sheet 3.pdf",
            kind: "pdf",
            size: "290 KB",
            updated: "today",
            isNew: false,
            changeNote: "Task 2b has a new description.",
          },
          { id: "st6", name: "Sample Project.zip", kind: "zip", size: "4.8 MB", updated: "Nov 6", isNew: false },
        ],
      },
      {
        id: "st-loesung",
        name: "Solutions",
        files: [
          { id: "st8", name: "Exercise Sheet 3 Solution.pdf", kind: "pdf", size: "340 KB", updated: "yesterday", isNew: true },
        ],
      },
      {
        id: "st-selbst",
        name: "Self-study",
        files: [
          { id: "st7", name: "Self-study 3 Observer.pdf", kind: "pdf", size: "860 KB", updated: "Nov 12", isNew: false },
        ],
      },
    ],
  },
  {
    id: "bwl",
    name: "Business Administration",
    short: "BA",
    lecturer: "Prof. Dr. Brandt",
    total: 18,
    color: "orange",
    slots: [
      { key: "lecture|4|10:00|", type: "lecture", label: "Lecture", weekday: 4, start: "10:00", end: "11:30", room: "hybrid", group: null, state: "fixed", source: "Course info: BWL_Begleittext_Woche_0.pdf" },
      { key: "exercise|0|12:00|", type: "exercise", label: "Exercise", weekday: 0, start: "12:00", end: "13:30", room: "hybrid", group: null, state: "option", source: "Course info: BWL_Begleittext_Woche_0.pdf" },
      { key: "exercise|2|17:45|", type: "exercise", label: "Exercise", weekday: 2, start: "17:45", end: "19:15", room: "hybrid", group: null, state: "option", source: "Course info: BWL_Begleittext_Woche_0.pdf" },
      { key: "tutorial|3|10:00|", type: "tutorial", label: "Tutorial", weekday: 3, start: "10:00", end: "11:30", room: null, group: null, state: "option", source: "Course info: BWL_Begleittext_Woche_0.pdf" },
      { key: "tutorial|3|14:00|", type: "tutorial", label: "Tutorial", weekday: 3, start: "14:00", end: "15:30", room: null, group: null, state: "chosen", source: "Course info: BWL_Begleittext_Woche_0.pdf" },
      { key: "tutorial|3|16:00|", type: "tutorial", label: "Tutorial", weekday: 3, start: "16:00", end: "17:30", room: null, group: null, state: "option", source: "Course info: BWL_Begleittext_Woche_0.pdf" },
    ],
    folders: [
      {
        id: "bwl-folien",
        name: "Slides",
        files: [
          { id: "bw1", name: "Chapter 5 Cost Accounting.pdf", kind: "pdf", size: "2.9 MB", updated: "yesterday", isNew: true },
          { id: "bw2", name: "Chapter 4 Marketing.pdf", kind: "pdf", size: "2.2 MB", updated: "Nov 9", isNew: false },
        ],
      },
      {
        id: "bwl-fallstudien",
        name: "Case Studies",
        files: [
          { id: "bw3", name: "Case Study Logistics.docx", kind: "doc", size: "86 KB", updated: "Nov 2", isNew: false },
        ],
      },
    ],
  },
  {
    id: "mathe",
    name: "Mathematics for Computer Science I",
    short: "Math I",
    lecturer: "Prof. Dr. Lindner",
    total: 42,
    color: "green",
    folders: [
      {
        id: "ma-skript",
        name: "Lecture Notes",
        files: [
          { id: "ma1", name: "Lecture Notes Part 2.pdf", kind: "pdf", size: "5.6 MB", updated: "Nov 14", isNew: false },
          { id: "ma2", name: "Formula Sheet.pdf", kind: "pdf", size: "420 KB", updated: "Oct 30", isNew: false },
        ],
      },
      {
        id: "ma-blaetter",
        name: "Exercise Sheets",
        files: [
          { id: "ma3", name: "Sheet 7.pdf", kind: "pdf", size: "180 KB", updated: "today", isNew: true },
          { id: "ma4", name: "Sheet 6.pdf", kind: "pdf", size: "175 KB", updated: "Nov 13", isNew: false },
          { id: "ma5", name: "Solution Sheet 6.pdf", kind: "pdf", size: "210 KB", updated: "Nov 18", isNew: false },
        ],
      },
    ],
  },
  {
    id: "datenbanken",
    name: "Databases",
    short: "DB",
    lecturer: "Prof. Dr. Krüger",
    total: 26,
    color: "plum",
    folders: [
      {
        id: "db-vorlesung",
        name: "Lectures",
        files: [
          { id: "db1", name: "SQL Basics.pdf", kind: "pdf", size: "1.8 MB", updated: "Nov 7", isNew: false },
          { id: "db2", name: "Normal Forms.pdf", kind: "pdf", size: "1.4 MB", updated: "yesterday", isNew: true },
        ],
      },
    ],
  },
  {
    id: "rechnernetze",
    name: "Computer Networks",
    short: "Networks",
    lecturer: "Prof. Dr. Sommer",
    total: 12,
    color: "ochre",
    folders: [
      {
        id: "rn-folien",
        name: "Slides",
        files: [
          { id: "rn1", name: "Layer Model.pdf", kind: "pdf", size: "2.0 MB", updated: "Nov 10", isNew: false },
        ],
      },
    ],
  },
  {
    id: "programmierung",
    name: "Programming I",
    short: "Prog I",
    lecturer: "Prof. Dr. Albers",
    total: 54,
    color: "teal",
    semester: "past",
    folders: [
      {
        id: "pr-folien",
        name: "Slides",
        files: [
          { id: "pr1", name: "Exam Prep.pdf", kind: "pdf", size: "1.1 MB", updated: "Feb 3", isNew: false },
        ],
      },
    ],
  },
  {
    id: "linalg",
    name: "Linear Algebra",
    short: "LinAlg",
    lecturer: "Prof. Dr. Hofmann",
    total: 38,
    color: "rose",
    semester: "past",
    folders: [
      {
        id: "la-skript",
        name: "Lecture Notes",
        files: [
          { id: "la1", name: "Complete Lecture Notes.pdf", kind: "pdf", size: "7.4 MB", updated: "Jan 28", isNew: false },
        ],
      },
    ],
  },
  {
    id: "englisch",
    name: "English for IT",
    short: "English",
    lecturer: "Dr. Carter",
    total: 9,
    color: "indigo",
    semester: "past",
    folders: [
      {
        id: "en-material",
        name: "Material",
        files: [
          { id: "en1", name: "Vocabulary List.pdf", kind: "pdf", size: "240 KB", updated: "Jan 15", isNew: false },
        ],
      },
    ],
  },
];

export const deadlines: Deadline[] = [
  { id: "d0", courseId: "softwaretechnik", title: "Tutorial", date: "2026-11-20", time: "14:00", kind: "termin", location: "106 Seminarraum 2" },
  { id: "d1", courseId: "mathe", title: "Submit Sheet 7", date: "2026-11-23", time: "by 10:00", kind: "abgabe" },
  { id: "d2", courseId: "softwaretechnik", title: "Submit Exercise Sheet 4", date: "2026-11-25", time: "by 23:59", kind: "abgabe" },
  { id: "d3", courseId: "bwl", title: "Upload Case Study", date: "2026-11-26", time: "by 12:00", kind: "abgabe" },
  {
    id: "d4",
    courseId: "datenbanken",
    title: "Register for the exam",
    date: "2026-11-26",
    time: "all day",
    kind: "abgabe",
    source: "Normal Forms.pdf, slide 2",
  },
  { id: "d5", courseId: "datenbanken", title: "Submit Sheet 5", date: "2026-11-27", time: "by 18:00", kind: "abgabe" },
  { id: "d6", courseId: "mathe", title: "Submit Sheet 8", date: "2026-11-30", time: "by 10:00", kind: "abgabe" },
  { id: "d7", courseId: "softwaretechnik", title: "Submit Exercise Sheet 5", date: "2026-12-02", time: "by 23:59", kind: "abgabe" },
  { id: "d8", courseId: "softwaretechnik", title: "Tutorial", date: "2026-12-04", time: "14:00", kind: "termin", location: "106 Seminarraum 2" },
  { id: "d11", courseId: "softwaretechnik", title: "Tutorial", date: "2026-11-27", time: "14:00", kind: "termin", location: "106 Seminarraum 2" },
  { id: "d12", courseId: "mathe", title: "Lecture", date: "2026-11-24", time: "10:00 to 11:30", kind: "termin", location: "100 Aula 1" },
  { id: "d9", courseId: "datenbanken", title: "Exam", date: "2026-12-10", time: "10:00", kind: "klausur", source: "Lecture Hall C" },
  { id: "d10", courseId: "bwl", title: "Midterm", date: "2026-12-11", time: "12:00", kind: "klausur" },
];

/** Kurze Zusammenfassung pro Kurs nach dem Sync (später von der KI). */
export const digests: Record<string, string> = {
  softwaretechnik: "New topic: design patterns. Observer and Strategy show up right away in Exercise Sheet 4.",
  bwl: "Chapter 5 on cost accounting is online. Thursday's case study builds on it.",
  mathe: "Sheet 7 is about eigenvalues. For task 3 you need theorem 4.2 from the lecture notes.",
  datenbanken: "The slides on normal forms include the deadline for exam registration.",
};

export function countFiles(course: Course): number {
  return course.folders.reduce((n, f) => n + f.files.length, 0);
}

export function countNew(course: Course): number {
  return course.folders.reduce((n, f) => n + f.files.filter((x) => x.isNew || x.changeNote).length, 0);
}
