// Beispieldaten für die Oberfläche. Die Form (Kurs → Ordner → Datei) bleibt bewusst flach,
// damit der Hintergrundteil (desktop/) später dasselbe liefern kann.
// desktop.ts baut auf diesen Typen auf: neue Felder nur optional hinzufügen.

export type FileKind = "pdf" | "zip" | "doc" | "other";

export interface CourseFile {
  id: string;
  name: string;
  kind: FileKind;
  size: string;
  updated: string; // fertig formatierter Text, z. B. "Heute, 09:14"
  isNew: boolean; // neu seit dem letzten Sync
  changeNote?: string; // geänderte Datei: was die KI als Unterschied gefunden hat
}

export interface Folder {
  id: string;
  name: string;
  files: CourseFile[];
}

export type CourseColor = "blue" | "orange" | "green" | "plum" | "ochre";

export interface Course {
  id: string;
  name: string;
  lecturer: string;
  total: number; // Dateien auf dem Server (für den Import)
  folders: Folder[];
  color?: CourseColor; // fehlt sie, vergibt die Oberfläche eine nach Reihenfolge
  short?: string; // Kurzname für enge Stellen ("Mathe I"); fehlt er, kürzt die Oberfläche selbst
}

/** Frist aus dem ILIAS-Kalender oder von der KI in einem Übungsblatt gefunden. */
export interface Deadline {
  id: string;
  courseId: string;
  title: string;
  date: string; // "2026-11-23"
  time: string; // "bis 10:00", "14:00" oder "ganztägig"
  kind: "abgabe" | "termin";
  source?: string; // wo die KI die Frist gefunden hat
}

export const TODAY = "2026-11-20";
export const LAST_SYNC = "09:41";
export const TARGET_FOLDER = "~/Uni";

export const courses: Course[] = [
  {
    id: "softwaretechnik",
    name: "Softwaretechnik",
    short: "SWT",
    lecturer: "Prof. Dr. Wagner",
    total: 31,
    color: "blue",
    folders: [
      {
        id: "st-vorlesung",
        name: "Vorlesung",
        files: [
          { id: "st1", name: "01 Einführung.pdf", kind: "pdf", size: "1,2 MB", updated: "12. Okt.", isNew: false },
          { id: "st2", name: "02 Anforderungen.pdf", kind: "pdf", size: "2,4 MB", updated: "19. Okt.", isNew: false },
          { id: "st3", name: "03 Entwurfsmuster.pdf", kind: "pdf", size: "3,1 MB", updated: "heute", isNew: true },
        ],
      },
      {
        id: "st-uebung",
        name: "Übung",
        files: [
          { id: "st4", name: "Übungsblatt 4.pdf", kind: "pdf", size: "310 KB", updated: "heute", isNew: true },
          {
            id: "st5",
            name: "Übungsblatt 3.pdf",
            kind: "pdf",
            size: "290 KB",
            updated: "heute",
            isNew: false,
            changeNote: "Aufgabe 2b hat eine neue Angabe.",
          },
          { id: "st6", name: "Beispielprojekt.zip", kind: "zip", size: "4,8 MB", updated: "6. Nov.", isNew: false },
        ],
      },
      {
        id: "st-selbst",
        name: "Selbstlernen",
        files: [
          { id: "st7", name: "Selbstlerneinheit 3 Beobachter.pdf", kind: "pdf", size: "860 KB", updated: "12. Nov.", isNew: false },
        ],
      },
    ],
  },
  {
    id: "bwl",
    name: "BWL",
    short: "BWL",
    lecturer: "Prof. Dr. Brandt",
    total: 18,
    color: "orange",
    folders: [
      {
        id: "bwl-folien",
        name: "Folien",
        files: [
          { id: "bw1", name: "Kapitel 5 Kostenrechnung.pdf", kind: "pdf", size: "2,9 MB", updated: "gestern", isNew: true },
          { id: "bw2", name: "Kapitel 4 Marketing.pdf", kind: "pdf", size: "2,2 MB", updated: "9. Nov.", isNew: false },
        ],
      },
      {
        id: "bwl-fallstudien",
        name: "Fallstudien",
        files: [
          { id: "bw3", name: "Fallstudie Logistik.docx", kind: "doc", size: "86 KB", updated: "2. Nov.", isNew: false },
        ],
      },
    ],
  },
  {
    id: "mathe",
    name: "Mathematik für Informatik I",
    short: "Mathe I",
    lecturer: "Prof. Dr. Lindner",
    total: 42,
    color: "green",
    folders: [
      {
        id: "ma-skript",
        name: "Skript",
        files: [
          { id: "ma1", name: "Skript Teil 2.pdf", kind: "pdf", size: "5,6 MB", updated: "14. Nov.", isNew: false },
          { id: "ma2", name: "Formelsammlung.pdf", kind: "pdf", size: "420 KB", updated: "30. Okt.", isNew: false },
        ],
      },
      {
        id: "ma-blaetter",
        name: "Übungsblätter",
        files: [
          { id: "ma3", name: "Blatt 7.pdf", kind: "pdf", size: "180 KB", updated: "heute", isNew: true },
          { id: "ma4", name: "Blatt 6.pdf", kind: "pdf", size: "175 KB", updated: "13. Nov.", isNew: false },
        ],
      },
    ],
  },
  {
    id: "datenbanken",
    name: "Datenbanken",
    short: "DB",
    lecturer: "Prof. Dr. Krüger",
    total: 26,
    color: "plum",
    folders: [
      {
        id: "db-vorlesung",
        name: "Vorlesung",
        files: [
          { id: "db1", name: "SQL Grundlagen.pdf", kind: "pdf", size: "1,8 MB", updated: "7. Nov.", isNew: false },
          { id: "db2", name: "Normalformen.pdf", kind: "pdf", size: "1,4 MB", updated: "gestern", isNew: true },
        ],
      },
    ],
  },
  {
    id: "rechnernetze",
    name: "Rechnernetze",
    short: "Netze",
    lecturer: "Prof. Dr. Sommer",
    total: 12,
    color: "ochre",
    folders: [
      {
        id: "rn-folien",
        name: "Folien",
        files: [
          { id: "rn1", name: "Schichtenmodell.pdf", kind: "pdf", size: "2,0 MB", updated: "10. Nov.", isNew: false },
        ],
      },
    ],
  },
];

export const deadlines: Deadline[] = [
  { id: "d0", courseId: "softwaretechnik", title: "Tutorium", date: "2026-11-20", time: "14:00", kind: "termin" },
  { id: "d1", courseId: "mathe", title: "Blatt 7 abgeben", date: "2026-11-23", time: "bis 10:00", kind: "abgabe" },
  { id: "d2", courseId: "softwaretechnik", title: "Übungsblatt 4 abgeben", date: "2026-11-25", time: "bis 23:59", kind: "abgabe" },
  { id: "d3", courseId: "bwl", title: "Fallstudie hochladen", date: "2026-11-26", time: "bis 12:00", kind: "abgabe" },
  {
    id: "d4",
    courseId: "datenbanken",
    title: "Zur Klausur anmelden",
    date: "2026-11-26",
    time: "ganztägig",
    kind: "abgabe",
    source: "Normalformen.pdf, Folie 2",
  },
];

/** Kurze Zusammenfassung pro Kurs nach dem Sync (später von der KI). */
export const digests: Record<string, string> = {
  softwaretechnik: "Neues Thema Entwurfsmuster. Beobachter und Strategie kommen direkt in Übungsblatt 4 dran.",
  bwl: "Kapitel 5 zur Kostenrechnung ist online. Die Fallstudie am Donnerstag baut darauf auf.",
  mathe: "Blatt 7 zu Eigenwerten. Für Aufgabe 3 brauchst du Satz 4.2 aus dem Skript.",
  datenbanken: "In den Folien zu Normalformen steht die Frist für die Klausuranmeldung.",
};

export function countFiles(course: Course): number {
  return course.folders.reduce((n, f) => n + f.files.length, 0);
}

export function countNew(course: Course): number {
  return course.folders.reduce((n, f) => n + f.files.filter((x) => x.isNew || x.changeNote).length, 0);
}
