// Art eines Dokuments (Vorlesung, Übungsblatt, Tutorium …) ohne KI, aus Ordner-Art, ILIAS-Pfad und Dateinamen.
// Nutzer können die Art pro Datei ändern (gespeichert im Browser-Speicher der App, localStorage „studi.docTypes“).
// Eine Quelle für alles: Tags an Dateien, Themenwochen (weeks.ts), Lernhilfe statt Zusammenfassung bei Blättern.
// Bewusst ohne React-Abhängigkeit im Kern, damit weeks.ts in Node testbar bleibt.

import type { CourseFile, Folder } from "./mock-data";

export type DocType =
  | "lecture"
  | "notes"
  | "sheet"
  | "exslides"
  | "tutorial"
  | "solution"
  | "reading"
  | "selfstudy"
  | "exam"
  | "info"
  | "video"
  | "data"
  | "other";

export const DOC_TYPES: { type: DocType; label: string; hint: string; tone: string }[] = [
  { type: "lecture", label: "Lecture", hint: "Slides from the lecture", tone: "blue" },
  { type: "notes", label: "Lecture notes", hint: "Notes, script or handwritten notes", tone: "indigo" },
  { type: "sheet", label: "Exercise sheet", hint: "Tasks to work on (sheet, homework, case)", tone: "orange" },
  { type: "exslides", label: "Exercise slides", hint: "Slides from the exercise session", tone: "ochre" },
  { type: "tutorial", label: "Tutorial", hint: "Material from the tutorial", tone: "teal" },
  { type: "solution", label: "Solution", hint: "Solutions to a sheet", tone: "green" },
  { type: "reading", label: "Reading", hint: "Texts, papers, literature", tone: "plum" },
  { type: "selfstudy", label: "Self-study", hint: "Material to work through on your own", tone: "plum" },
  { type: "exam", label: "Exam", hint: "Old exams and exam info", tone: "rose" },
  { type: "info", label: "Course info", hint: "Organisation, rules, dates", tone: "gray" },
  { type: "video", label: "Video", hint: "Recordings", tone: "gray" },
  { type: "data", label: "Data", hint: "Data, code or archives for exercises", tone: "gray" },
  { type: "other", label: "File", hint: "Anything else", tone: "gray" },
];

export const DOC_LABEL = Object.fromEntries(DOC_TYPES.map((d) => [d.type, d.label])) as Record<DocType, string>;

/** Blätter und Klausuren werden nicht zusammengefasst, sondern bekommen eine Lernhilfe (Ansatz, Hinweise, wo nachlesen). */
export const isTaskDoc = (t: DocType) => t === "sheet" || t === "exam";
/** Diese Arten liefern Lernstoff (Zusammenfassung, Karten). */
export const isStudyDoc = (t: DocType) => !["info", "video", "data", "other"].includes(t);

const RE = {
  // „answers_week3“ zählt, „Lösungsverfahren“/„Lösungsmengen“ (Vorlesungsthemen) nicht
  solution: /(l(?:ö|oe|o)sung(?!s?(?:verfahren|menge|ans[aä]tz|strategie|raum|methode))|solution|musterl|answers?(?![a-z])|antworten)/i,
  exam: /(altklausur|probeklausur|klausur|exam\b|exams\b|prüfung|pruefung|testat|midterm|final exam)/i,
  info: /(organisator|(?:^|[^a-zäöü])orga(?:[^a-zäöü]|$)|modulinfo|modul-?information|allgemeines|general information|course info|syllabus|einführungsveranstaltung)/i,
  infoFolder: /^(grundlegende informationen|allgemein|organisator|orga\b|course info|course information|general|modul ?info|informationen zum modul|info\b)/i,
  tutorial: /(tutorium|tutorial|tutorien|\btut\b)/i,
  notes: /(mitschrift|skript|script\b|lecture notes|vorlesungsnotizen|handout|tafelbild|notes\b)/i,
  sheet: /(übungsblatt|uebungsblatt|aufgabenblatt|\bblatt\b|sheet|homework|hausaufgabe|assignment|aufgaben|übungsaufgabe|uebungsaufgabe|exercise ?sheet|\bfall\b|fallstudie|case study|\bha ?\d|problem set|worksheet)/i,
  // auch mit Nummer oder Wörtern dazwischen: „Exercise 3 Slides“, „Exercise_05_slides“, „Slides Exercise Session 7“
  exslides:
    /(übungsfolien|uebungsfolien|übung.*folien|folien.*übung|\bub\d{1,2}\b|_ub\d|(?:exercise|uebung)(?:[\s_\-]+[\w.]+){0,2}[\s_\-]+(?:slides|folien)|(?:slides|folien)(?:[\s_\-]+[\w.]+){0,1}[\s_\-]+(?:exercise|uebung))/i,
  reading: /(begleittext|literatur|reading|paper|artikel|article|kapitel aus|chapter from|lektüre|lektuere)/i,
  selfstudy: /(selbststudium|selbstlern|self-?study|lerneinheit)/i,
  video: /\.(mp4|mov|avi|m4v|webm|mkv)$/i,
  image: /\.(gif|png|jpe?g|svg|webp|bmp|tiff?|heic)$/i,
  data: /\.(json|csv|zip|xlsx?|py|r|ipynb|java|c|cpp|js|ts|sql|txt)$/i,
};

/** Automatische Art (ohne Änderungen des Nutzers). */
export function autoDocType(file: Pick<CourseFile, "name" | "where" | "kind">, folder?: Pick<Folder, "category" | "name">): DocType {
  const name = file.name;
  const where = file.where ?? "";
  const both = `${where} ${name}`;
  const cat = folder?.category ?? "";
  if (RE.video.test(name) || cat === "recordings") return "video";
  if (RE.data.test(name) && file.kind !== "pdf") return "data";
  // Bilder (Abbildung, Animation, Screenshot) sind keine Vorlesung, auch im Vorlesungsordner
  if (RE.image.test(name)) return /(video|aufzeichnung|recording)/i.test(where) ? "video" : "other";
  if (RE.solution.test(name) || cat === "solutions") return "solution";
  if (cat === "exams" || RE.exam.test(name)) return "exam";
  if (cat === "info" || RE.info.test(name) || (RE.infoFolder.test(where) && !/(woche|week)\s*\d/i.test(where) && cat !== "exams")) return "info";
  if (RE.tutorial.test(name)) return "tutorial";
  if (cat === "readings" || RE.reading.test(name)) return "reading";
  if (cat === "selfstudy" || RE.selfstudy.test(both)) return "selfstudy";
  if (cat === "lectures") return RE.notes.test(both) ? "notes" : "lecture";
  if (cat === "exercises" || /(übung|uebung|exercise|tutorium)/i.test(both)) {
    if (RE.exslides.test(both) || /exercise slides|übungsfolien/i.test(where)) return "exslides";
    if (RE.tutorial.test(where)) return "tutorial";
    return "sheet";
  }
  if (RE.notes.test(both)) return "notes";
  if (RE.sheet.test(name)) return "sheet";
  if (/(folien|slides|vorlesung|lecture|\bvl\s?\d)/i.test(both)) return "lecture";
  return "other";
}

// ------------------------------------------------------------------ Änderungen des Nutzers

const KEY = "studi.docTypes";
let overrides: Record<string, DocType> | null = null;
const listeners = new Set<() => void>();
let version = 0;

function load(): Record<string, DocType> {
  if (overrides) return overrides;
  try {
    overrides = JSON.parse((typeof localStorage !== "undefined" && localStorage.getItem(KEY)) || "{}") ?? {};
  } catch {
    overrides = {};
  }
  return overrides!;
}

export function docTypeOverride(fileId: string): DocType | null {
  return load()[fileId] ?? null;
}

export function setDocType(fileId: string, type: DocType | null) {
  const next = { ...load() };
  if (type) next[fileId] = type;
  else delete next[fileId];
  overrides = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Browser-Speicher nicht verfügbar
  }
  version += 1;
  for (const l of listeners) l();
}

export const docTypeStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  version: () => version,
};

/** Art mit Änderung des Nutzers. */
export function docTypeOf(file: Pick<CourseFile, "id" | "name" | "where" | "kind">, folder?: Pick<Folder, "category" | "name">): DocType {
  return docTypeOverride(file.id) ?? autoDocType(file, folder);
}
