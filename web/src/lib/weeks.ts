// Themenwochen: ordnet die Dateien eines Moduls den Wochen der Vorlesungszeit zu, so wie die Uni es tut
// („Woche 3: Absatzmärkte gestalten“ = Vorlesung + Übung + Lösung + Begleittext).
//
// Ohne KI, in dieser Reihenfolge (die erste Regel, die greift, gewinnt):
//   1. „Woche 3“ / „Week 3“ / „KW 45“ im ILIAS-Ordner oder im Dateinamen
//   2. Übungen, Lösungen, Begleittexte … mit denselben Themenwörtern wie eine Vorlesung → Woche dieser Vorlesung
//      (bei mehreren: die letzte Vorlesung vor der Datei; „Homework 2 – Requirements“ → Woche der Requirements-Vorlesung)
//   3. Datum der ILIAS-Sitzung („2026-10-15, 10:00 – 11:30: Vorlesung“), sonst Datum der Datei → Vorlesungswoche
// Organisatorisches und Modulinfos kommen in „Course info“, Altklausuren in „Exam prep“.
// Titel: ILIAS-Wochentitel > aufgeräumte Dateinamen der Vorlesungen > Themen aus den KI-Zusammenfassungen > KI-Titel.
// Bewusst ohne Abhängigkeiten, damit es auch in Node getestet werden kann.

import type { Course, CourseFile, Folder } from "./mock-data";

export type Role = "lecture" | "exercise" | "solution" | "reading" | "selfstudy" | "recording" | "info" | "exam" | "other";

export interface WeekFile {
  file: CourseFile;
  folder: Folder;
  role: Role;
  how: "ilias" | "name" | "topic" | "session" | "date" | "group";
}

export interface Week {
  key: string; // "w3", "info", "exam"
  kind: "week" | "info" | "exam";
  n: number | null; // Vorlesungswoche (1 = erste Woche)
  title: string; // "Absatzmärkte gestalten" oder "" (dann nur „Week 3“)
  titleFrom: "ilias" | "names" | "topics" | "ai" | "none";
  hints: string[]; // Stichwörter für einen KI-Titel (Dateinamen, Themen)
  range: string | null; // "Oct 19 – 23"
  current: boolean; // diese Woche
  files: WeekFile[];
}

export interface WeekOptions {
  today: string; // YYYY-MM-DD
  topicsOf?: (f: CourseFile) => string[]; // Themen aus den Zusammenfassungen (KI)
  aiTitles?: Record<string, string>; // key → Titel (z. B. von Haiku)
}

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ------------------------------------------------------------------ Kalender

const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};
const monday = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7), 12);

function nthMonday(year: number, month: number, n: number) {
  const first = new Date(year, month, 1, 12);
  const offset = (8 - first.getDay()) % 7; // erster Montag
  return new Date(year, month, 1 + offset + (n - 1) * 7, 12);
}

/** Beginn der Vorlesungszeit (gleiche Faustregel wie lecturePeriod in recurrence.ts: WiSe 2. Mo Okt, SoSe 2. Mo Apr). */
export function semesterStart(today: string): Date {
  const t = parse(today);
  const m = t.getMonth();
  if (m >= 7 || m <= 1) return nthMonday(m >= 7 ? t.getFullYear() : t.getFullYear() - 1, 9, 2);
  return nthMonday(t.getFullYear(), 3, 2);
}

/** Weihnachtspause (24.12.–06.01.) zählt nicht als Vorlesungswoche. */
function breakOf(start: Date) {
  if (start.getMonth() !== 9) return null;
  return { from: monday(new Date(start.getFullYear(), 11, 24, 12)), to: new Date(start.getFullYear() + 1, 0, 6, 12), weeks: 2 };
}

/** Datum → Vorlesungswoche (1, 2, …). Vor Semesterbeginn = 1. */
export function lectureWeek(date: Date, start: Date): number {
  const brk = breakOf(start);
  let d = date;
  if (brk && d >= brk.from && d <= brk.to) d = new Date(brk.from.getTime() - DAY);
  let n = Math.floor((monday(d).getTime() - monday(start).getTime()) / (7 * DAY)) + 1;
  if (brk && d > brk.to) n -= brk.weeks;
  return Math.max(1, n);
}

/** Vorlesungswoche → „Oct 19 – 23“. */
export function weekRange(n: number, start: Date): string {
  const brk = breakOf(start);
  let mon = new Date(monday(start).getTime() + (n - 1) * 7 * DAY);
  if (brk && mon >= brk.from) mon = new Date(mon.getTime() + brk.weeks * 7 * DAY);
  const fri = new Date(mon.getTime() + 4 * DAY);
  const a = `${MONTHS[mon.getMonth()]} ${mon.getDate()}`;
  return fri.getMonth() === mon.getMonth() ? `${a} – ${fri.getDate()}` : `${a} – ${MONTHS[fri.getMonth()]} ${fri.getDate()}`;
}

/** Kalenderwoche (ISO) → Montag. */
function isoWeekMonday(year: number, kw: number) {
  const jan4 = new Date(year, 0, 4, 12);
  return new Date(monday(jan4).getTime() + (kw - 1) * 7 * DAY);
}

// ------------------------------------------------------------------ Art der Datei

const WEEK_RE = /\b(woche|week|wk)\s*[-_ ]?\s*(\d{1,2})\b/i;
const SOLUTION = /(lösung|loesung|losung|solution|musterl)/i;
const INFO = /(organisator|(?:^|[^a-zäöü])orga(?:[^a-zäöü]|$)|modulinfo|modul-?information|allgemeines|general information|course info|syllabus)/i;
/** ILIAS-Ordner für Allgemeines („Grundlegende Informationen zum Modul“, „Organisatorisches“ …). */
const INFO_FOLDER = /^(grundlegende informationen|allgemein|organisator|orga\b|course info|course information|general|modul ?info|informationen zum modul|info\b)/i;
const EXAM = /(altklausur|klausur|exam|prüfung|pruefung|probeklausur)/i;

function roleOf(file: CourseFile, folder: Folder): Role {
  const cat = folder.category ?? "";
  const name = file.name;
  if (cat === "exams" || (EXAM.test(name) && !/(übung|uebung|exercise)/i.test(name))) return "exam";
  if (SOLUTION.test(name) || cat === "solutions") return "solution";
  if (cat === "info" || INFO.test(name) || (INFO_FOLDER.test(file.where ?? "") && !WEEK_RE.test(file.where ?? ""))) return "info";
  if (cat === "lectures") return "lecture";
  if (cat === "exercises") return "exercise";
  if (cat === "readings") return "reading";
  if (cat === "selfstudy") return "selfstudy";
  if (cat === "recordings" || /\.(mp4|mov|avi|m4v|webm|mkv)$/i.test(name)) return "recording";
  return "other";
}

// ------------------------------------------------------------------ Hinweise aus Namen und ILIAS-Ordnern

const KW_RE = /\bkw\s*[-_ ]?\s*(\d{1,2})\b/i;
const SESSION_RE = /^(\d{4}-\d{2}-\d{2}),/; // ILIAS-Sitzung: „2026-10-15, 10:00 - 11:30: …“

/** „Woche 3 - Absatzmärkte gestalten/Vorlesung“ → { n: 3, title: "Absatzmärkte gestalten" } */
function explicitWeek(file: CourseFile, start: Date): { n: number; title: string | null; from: "ilias" | "name" } | null {
  const where = file.where ?? "";
  for (const [text, from] of [
    [where, "ilias"],
    [file.name.replace(/_/g, " "), "name"],
  ] as const) {
    const m = text.match(WEEK_RE);
    if (m) {
      const after = from === "ilias" ? text.slice((m.index ?? 0) + m[0].length).split("/")[0] : "";
      const title = after.replace(/^\s*[-–:·]\s*/, "").trim() || null;
      return { n: Number(m[2]), title, from };
    }
    const kw = text.match(KW_RE);
    if (kw) return { n: lectureWeek(isoWeekMonday(start.getFullYear() + (Number(kw[1]) < 30 && start.getMonth() === 9 ? 1 : 0), Number(kw[1])), start), title: null, from };
  }
  return null;
}

function dateOf(file: CourseFile): Date | null {
  const s = (file.where ?? "").match(SESSION_RE);
  if (s) return parse(s[1]);
  return file.modifiedAt ? new Date(file.modifiedAt) : null;
}

// Wörter, die nichts über das Thema sagen (deutsch und englisch, Dateinamen-Floskeln)
const STOP = new Set(
  (
    "folien slides slide vorlesung vorlesungen lecture lectures uebung übung uebungen übungen exercise exercises homework hausaufgabe " +
    "blatt sheet sheets teil part wise sose wintersemester sommersemester woche week loesung lösung loesungen lösungen solution solutions " +
    "musterlösung information informationen info material materialien kapitel chapter version final deutsch english tutorial tutorium " +
    "aufgaben aufgabe daten data notes mitschrift mitschriften skript script präsentation presentation gruppe group einheit unit " +
    "allgemeines allgemein introduction einführung einfuehrung overview übersicht uebersicht begleittext literatur selbststudium " +
    "fall fallstudie case study studie umfassende lehramtsstudierenden"
  ).split(" "),
);

/** Themenwörter eines Dateinamens: „SSE_Homework 2 -Requirements“ → ["requir"]. Wortstamm = erste 6 Buchstaben. */
function topicWords(name: string, courseWords: Set<string>): string[] {
  const base = name
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/([a-zäöü])([A-ZÄÖÜ])/g, "$1 $2") // CamelCase trennen
    .replace(/([a-zäöü])(\d)/gi, "$1 $2")
    .toLowerCase();
  const words = base.split(/[^a-zäöüß]+/).filter((w) => w.length >= 5 && !STOP.has(w) && !courseWords.has(w));
  return [...new Set(words.map((w) => w.slice(0, 6)))];
}

// Für Titel nur Floskeln weglassen („Introduction“ oder „Version Control“ sind gute Titel)
const TITLE_STOP = new Set(
  "folien slides slide vorlesung vorlesungen lecture lectures mitschrift mitschriften notes skript script wise sose final deutsch english teil part uebung übung exercise homework blatt sheet".split(
    " ",
  ),
);

/** Aufgeräumter Titel aus einem Dateinamen: „ISM_WS26_27_VL03_IS_Strategie_und_Organisation“ → „IS Strategie und Organisation“. */
export function cleanTitle(name: string, courseWords: Set<string>): string {
  let s = name.replace(/\.[a-z0-9]{1,5}$/i, "");
  s = s.replace(/([a-zäöü])([A-ZÄÖÜ])/g, "$1 $2").replace(/([a-zäöü])(\d)/gi, "$1 $2").replace(/[_+]+/g, " ").replace(/\s*-\s*/g, " ");
  s = s
    .replace(/\b(WS|SS|WiSe|SoSe|W|S)\s?\d{2,4}(\s?\d{2})?\b/gi, " ") // Semester
    .replace(/\b\d{4}\b/g, " ") // Jahre
    .replace(/\b[A-Za-z]{0,3}\d{1,4}[a-z]?(\.\d+)?\b/g, " "); // VL03, V05, 01, 0103, 06a, V01.2
  const words = s.split(/\s+/).filter((w) => w && !TITLE_STOP.has(w.toLowerCase()) && !courseWords.has(w.toLowerCase()));
  // Teil-Nummern (Requirements I/II) weglassen, die Woche fasst die Teile zusammen; kurze Reste weg
  const out = words.filter((w) => w.length > 1 && !/^(I|II|III|IV|V|VI)$/.test(w)).join(" ");
  return /[a-zäöü]{4}/i.test(out) ? out.trim() : "";
}

/** Kurs-eigene Wörter (Kürzel, Name), die in fast jedem Dateinamen stehen: ISM, BWL, Vis, SSE … */
function courseWordsOf(course: Course, files: CourseFile[]): Set<string> {
  const set = new Set<string>();
  for (const w of [course.name, course.short ?? "", course.fullName ?? ""].join(" ").toLowerCase().split(/[^a-zäöüß]+/)) if (w.length >= 2) set.add(w);
  // Wörter, die in mehr als der Hälfte der Dateinamen vorkommen, sagen nichts über das Thema
  const counts = new Map<string, number>();
  for (const f of files)
    for (const w of new Set(f.name.toLowerCase().split(/[^a-zäöüß]+/).filter((x) => x.length >= 2))) counts.set(w, (counts.get(w) ?? 0) + 1);
  const nameWords = [...set].filter((w) => w.length >= 5);
  for (const [w, n] of counts) {
    if (files.length >= 6 && n > files.length / 2) set.add(w);
    // kurze Kürzel in mehreren Dateinamen (ISM, SSE, Vis, BWL) oder Anfang des Kursnamens („vis“ → „visualisierung“)
    else if (w.length <= 4 && (n >= 3 || nameWords.some((x) => x.startsWith(w)))) set.add(w);
  }
  return set;
}

// ------------------------------------------------------------------ Zuordnung

export function weeksOf(course: Course, opts: WeekOptions): Week[] {
  const start = semesterStart(opts.today);
  const todayWeek = lectureWeek(parse(opts.today), start);
  const all = course.folders.flatMap((folder) => folder.files.map((file) => ({ file, folder, role: roleOf(file, folder) })));
  const courseWords = courseWordsOf(course, all.map((x) => x.file));

  const placed = new Map<string, { n: number | "info" | "exam"; how: WeekFile["how"]; title?: string | null }>();
  const fallbackWeek = (f: CourseFile) => {
    const d = dateOf(f);
    return { n: d ? lectureWeek(d, start) : 1, how: ((f.where ?? "").match(SESSION_RE) ? "session" : "date") as WeekFile["how"] };
  };

  // 1. Feste Gruppen und ausdrückliche Wochen
  for (const x of all) {
    const ex = explicitWeek(x.file, start);
    if (ex && ex.n === 0 && x.role !== "exam") placed.set(x.file.id, { n: "info", how: "group" });
    else if (ex && x.role !== "exam") placed.set(x.file.id, { n: ex.n, how: ex.from, title: ex.title });
    else if (x.role === "info" && !ex) placed.set(x.file.id, { n: "info", how: "group" });
    else if (x.role === "exam") placed.set(x.file.id, { n: "exam", how: "group" });
  }

  // 2. Vorlesungen: ausdrücklich oder nach Datum (sie sind die Anker der Wochen)
  const lectures: { file: CourseFile; n: number; words: string[] }[] = [];
  for (const x of all.filter((y) => y.role === "lecture")) {
    if (!placed.has(x.file.id)) placed.set(x.file.id, fallbackWeek(x.file));
    const p = placed.get(x.file.id)!;
    if (typeof p.n === "number") lectures.push({ file: x.file, n: p.n, words: topicWords(x.file.name, courseWords) });
  }

  // 3. Alles andere: gleiche Themenwörter wie eine Vorlesung, sonst Datum
  for (const x of all) {
    if (placed.has(x.file.id)) continue;
    const own = fallbackWeek(x.file);
    const words = x.role === "recording" ? [] : topicWords(x.file.name, courseWords);
    const matches = words.length ? lectures.filter((l) => l.words.some((w) => words.includes(w))) : [];
    if (matches.length) {
      // die letzte passende Vorlesung, die nicht nach der Datei liegt (Übung folgt der Vorlesung)
      const before = matches.filter((l) => l.n <= own.n).sort((a, b) => b.n - a.n)[0];
      const pick = before ?? matches.sort((a, b) => a.n - b.n)[0];
      placed.set(x.file.id, { n: pick.n, how: "topic" });
    } else placed.set(x.file.id, own);
  }

  // 3b. Abgaben/Übungen mit Blattnummer, die nur nach Datum liegen (z. B. eigene Abgabe, später hochgeladen):
  //     gleiche Nummer wie ein sicher zugeordnetes Blatt → dessen Woche („uebung_1_rayyan“ → Woche von „0101_Beweise“)
  const sure = all.filter((x) => (x.role === "exercise" || x.role === "solution") && ["topic", "ilias", "name"].includes(placed.get(x.file.id)!.how));
  for (const x of all) {
    const p = placed.get(x.file.id)!;
    if ((x.role !== "exercise" && x.role !== "solution") || (p.how !== "date" && p.how !== "session")) continue;
    const num = sheetNumber(x.file.name);
    if (num == null) continue;
    const partner = sure.find((y) => y.file.id !== x.file.id && sheetNumber(y.file.name) === num);
    if (partner) placed.set(x.file.id, { n: placed.get(partner.file.id)!.n, how: "topic" });
  }

  // 4. Wochen bauen
  const groups = new Map<string, Week>();
  const get = (n: number | "info" | "exam") => {
    const key = typeof n === "number" ? `w${n}` : n;
    let w = groups.get(key);
    if (!w) {
      w = {
        key,
        kind: typeof n === "number" ? "week" : n,
        n: typeof n === "number" ? n : null,
        title: "",
        titleFrom: "none",
        hints: [],
        range: typeof n === "number" ? weekRange(n, start) : null,
        current: n === todayWeek,
        files: [],
      };
      groups.set(key, w);
    }
    return w;
  };
  const iliasTitles = new Map<string, Map<string, number>>();
  for (const x of all) {
    const p = placed.get(x.file.id)!;
    const w = get(p.n);
    w.files.push({ file: x.file, folder: x.folder, role: x.role, how: p.how });
    if (p.title) {
      const m = iliasTitles.get(w.key) ?? new Map<string, number>();
      m.set(p.title, (m.get(p.title) ?? 0) + 1);
      iliasTitles.set(w.key, m);
    }
  }

  // 5. Titel
  const ORDER: Role[] = ["lecture", "selfstudy", "reading", "exercise", "solution", "recording", "other", "info", "exam"];
  for (const w of groups.values()) {
    w.files.sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role) || a.file.name.localeCompare(b.file.name, "de", { numeric: true }));
    if (w.kind !== "week") continue;
    const ilias = iliasTitles.get(w.key);
    const lecturesHere = w.files.filter((f) => f.role === "lecture");
    const doc = (f: WeekFile) => f.file.kind === "pdf" || f.file.kind === "doc";
    const source = lecturesHere.some(doc) ? lecturesHere.filter(doc) : w.files.filter((f) => doc(f) && f.role !== "solution");
    const fromNames = uniqueTitles(source.map((f) => cleanTitle(f.file.name, courseWords)).filter(Boolean));
    const fromTopics = uniqueTitles(source.flatMap((f) => opts.topicsOf?.(f.file).slice(0, 1) ?? []));
    w.hints = [...fromNames, ...source.flatMap((f) => opts.topicsOf?.(f.file).slice(0, 2) ?? [])].slice(0, 8);
    if (ilias?.size) {
      w.title = [...ilias.entries()].sort((a, b) => b[1] - a[1])[0][0];
      w.titleFrom = "ilias";
    } else if (opts.aiTitles?.[w.key]) {
      w.title = opts.aiTitles[w.key];
      w.titleFrom = "ai";
    } else if (fromNames.length) {
      w.title = fromNames.slice(0, 2).join(" · ");
      w.titleFrom = "names";
    } else if (fromTopics.length) {
      w.title = fromTopics.slice(0, 2).join(" · ");
      w.titleFrom = "topics";
    }
  }

  const weeks = [...groups.values()].filter((w) => w.kind === "week").sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
  // keine Woche genau heute (z. B. noch nichts hochgeladen): die neueste vergangene markieren
  if (!weeks.some((w) => w.current)) {
    const latest = [...weeks].reverse().find((w) => (w.n ?? 0) <= todayWeek);
    if (latest) latest.current = true;
  }
  return [...weeks, ...["info", "exam"].map((k) => groups.get(k)).filter((w): w is Week => Boolean(w))];
}

/** Blattnummer: „Übung 3“, „Homework_2“, „Blatt 04“, „0103_…“ (Reihe 01, Blatt 03) → 3, 2, 4, 3. */
function sheetNumber(name: string): number | null {
  const m = name.match(/(?:blatt|sheet|übung|uebung|ubung|exercise|homework|hausaufgabe|aufgabenblatt|assignment)\s*[-_ ]?\s*0*(\d{1,2})(?!\d)/i);
  if (m) return Number(m[1]);
  const four = name.match(/^(\d{2})(\d{2})[_\s-]/);
  return four ? Number(four[2]) : null;
}

/** Doppelte Titel weg (gleicher Wortstamm), „Abbildungen“ und „Abbildungen Gleichungen“ → beide nur einmal. */
function uniqueTitles(list: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of list) {
    const stems = t.toLowerCase().split(/\s+/).filter((w) => w.length >= 4).map((w) => w.slice(0, 6));
    const fresh = stems.filter((s) => !seen.has(s));
    if (!fresh.length) continue;
    stems.forEach((s) => seen.add(s));
    out.push(t);
  }
  return out;
}

/** Anzeigename einer Woche: „Week 3 · Absatzmärkte gestalten“, „Course info“, „Exam prep“. */
export function weekLabel(w: Pick<Week, "kind" | "n" | "title">, withTitle = true) {
  if (w.kind === "info") return "Course info";
  if (w.kind === "exam") return "Exam prep";
  return withTitle && w.title ? `Week ${w.n} · ${w.title}` : `Week ${w.n}`;
}

export const ROLE_LABEL: Record<Role, string> = {
  lecture: "Lecture",
  exercise: "Exercise",
  solution: "Solution",
  reading: "Reading",
  selfstudy: "Self-study",
  recording: "Video",
  info: "Info",
  exam: "Exam",
  other: "File",
};

