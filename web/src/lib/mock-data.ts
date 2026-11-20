// Beispieldaten für die Oberfläche. Die Form (Kurs → Ordner → Datei) bleibt bewusst flach,
// damit der Hintergrundteil (desktop/) später dasselbe liefern kann.

export type FileKind = "pdf" | "zip" | "doc" | "other";

export interface CourseFile {
  id: string;
  name: string;
  kind: FileKind;
  size: string;
  updated: string; // fertig formatierter Text, z. B. "Heute, 09:14"
  isNew: boolean; // neu seit dem letzten Sync
}

export interface Folder {
  id: string;
  name: string;
  files: CourseFile[];
}

export interface Course {
  id: string;
  name: string;
  lecturer: string;
  total: number; // Dateien auf dem Server (für den Import)
  folders: Folder[];
}

export const LAST_SYNC = "Heute, 09:41";
export const TARGET_FOLDER = "~/Uni";

export const courses: Course[] = [
  {
    id: "softwaretechnik",
    name: "Softwaretechnik",
    lecturer: "Prof. Dr. Wagner",
    total: 31,
    folders: [
      {
        id: "st-vorlesung",
        name: "Vorlesung",
        files: [
          { id: "st1", name: "01 Einführung.pdf", kind: "pdf", size: "1,2 MB", updated: "12. Okt.", isNew: false },
          { id: "st2", name: "02 Anforderungen.pdf", kind: "pdf", size: "2,4 MB", updated: "19. Okt.", isNew: false },
          { id: "st3", name: "03 Entwurfsmuster.pdf", kind: "pdf", size: "3,1 MB", updated: "Heute, 08:55", isNew: true },
        ],
      },
      {
        id: "st-uebung",
        name: "Übung",
        files: [
          { id: "st4", name: "Übungsblatt 4.pdf", kind: "pdf", size: "310 KB", updated: "Heute, 09:14", isNew: true },
          { id: "st5", name: "Übungsblatt 3 Lösung.pdf", kind: "pdf", size: "540 KB", updated: "13. Nov.", isNew: false },
          { id: "st6", name: "Beispielprojekt.zip", kind: "zip", size: "4,8 MB", updated: "6. Nov.", isNew: false },
        ],
      },
    ],
  },
  {
    id: "bwl",
    name: "BWL",
    lecturer: "Prof. Dr. Brandt",
    total: 18,
    folders: [
      {
        id: "bwl-folien",
        name: "Folien",
        files: [
          { id: "bw1", name: "Kapitel 5 Kostenrechnung.pdf", kind: "pdf", size: "2,9 MB", updated: "Gestern", isNew: true },
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
    lecturer: "Prof. Dr. Lindner",
    total: 42,
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
          { id: "ma3", name: "Blatt 7.pdf", kind: "pdf", size: "180 KB", updated: "Heute, 07:30", isNew: true },
          { id: "ma4", name: "Blatt 6.pdf", kind: "pdf", size: "175 KB", updated: "13. Nov.", isNew: false },
        ],
      },
    ],
  },
  {
    id: "datenbanken",
    name: "Datenbanken",
    lecturer: "Prof. Dr. Krüger",
    total: 26,
    folders: [
      {
        id: "db-vorlesung",
        name: "Vorlesung",
        files: [
          { id: "db1", name: "SQL Grundlagen.pdf", kind: "pdf", size: "1,8 MB", updated: "7. Nov.", isNew: false },
          { id: "db2", name: "Normalformen.pdf", kind: "pdf", size: "1,4 MB", updated: "14. Nov.", isNew: false },
        ],
      },
    ],
  },
  {
    id: "rechnernetze",
    name: "Rechnernetze",
    lecturer: "Prof. Dr. Sommer",
    total: 12,
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

export function countFiles(course: Course): number {
  return course.folders.reduce((n, f) => n + f.files.length, 0);
}

export function countNew(course: Course): number {
  return course.folders.reduce((n, f) => n + f.files.filter((x) => x.isNew).length, 0);
}
