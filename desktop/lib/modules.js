// Module: fasst ILIAS-Kurse, die zusammengehören, zu einem Modul zusammen – ohne KI, nur mit Regeln.
//
//   „[WS26/27] Mathematik für Studierende der Informatik I“        ┐
//   „[WS26/27] Mathematik für Studierende der Informatik I - Übung“├─ Modul „Mathe I“
//   „Gruppe 05 WiSe 2026“ (Elternkurs laut ILIAS: die Übung)       ┘   Teile: Lecture, Exercises, Tutorial group 05
//
// Dazu: Kurznamen („Grundlagen der Betriebswirtschaftslehre“ → „BWL“), Art jeder Datei (Lecture slides,
// Exercises, Solutions …) und Termine aus fremden Kalendern einem Modul zuordnen.

// ------------------------------------------------------------------ Titel zerlegen

const SEMESTER_TAG = /^\s*\[([^\]]{1,20})\]\s*/;
const SEASON =
  "WiSe|WS|SoSe|SS|Wintersemester|Sommersemester|Winter(?:\\s+(?:term|semester))?|Summer(?:\\s+(?:term|semester))?|Fall|Spring|Autumn";
const SEMESTER_WORDS = new RegExp(`\\s*[(,]?\\s*\\b(${SEASON})\\s*'?\\d{2,4}(\\s*[/_-]\\s*\\d{2,4})?\\)?\\s*$`, "i");
// Semester vorn ohne Klammern (Moodle u. a.): „WS 26/27 Datenbanksysteme“, „SoSe 2027: Statistik II“, „Wintersemester 2026/27 – …“
const SEMESTER_LEAD = new RegExp(`^\\s*(?:${SEASON})\\s*'?\\d{2,4}(?:\\s*[/_-]\\s*\\d{2,4})?\\s*[-–:|]?\\s*`, "i");

/** Semester vergleichbar machen: „[WS26/27]“, „WiSe 2026/27“, „Winter 2026“, „Fall 2026“ → „w26“; „SoSe26“ → „s26“. */
function normSemester(s) {
  if (!s) return null;
  const t = String(s).toLowerCase();
  const year = t.match(/\d{2,4}/);
  const word = (t.match(/[a-zäöü]+/) || [""])[0];
  if (!year || !word) return null;
  const season = /^(wise|ws|winter|fall|autumn)/.test(word) ? "w" : /^(sose|ss|sommer|summer|spring)/.test(word) ? "s" : "?";
  return season + year[0].slice(-2);
}
const PART_SUFFIX =
  /\s*[-–:|]\s*(Übungen|Übung|Uebungen|Uebung|Exercises?|Tutorien|Tutorium|Tutorials?|Vorlesung|Lecture|Hausaufgaben|Homework|Praktikum|Lab)\s*$/i;
const PART_TRAILING_WORD = /\s+(Übungen|Übung|Uebungen|Uebung|Exercises?|Tutorium|Tutorial)\s*$/i;
const PART_PREFIX = /^(Tutorium|Tutorial|Übung|Uebung|Exercise|Vorlesung|Lecture|Praktikum)\s*[:\-–]\s*/i;
// „Übungen zur Linearen Algebra I“, „Übung zu Analysis II“, „Tutorium zur …“, „Exercises for Software Engineering“
const PART_PREFIX_TO =
  /^(Übungen|Übung|Uebungen|Uebung|Tutorien|Tutorium|Tutorials?|Exercises?|Exercise class(?:es)?)\s+(?:zu[rm]?|for|to)\s+(?:(?:der|die|das|den|dem|des|the)\s+)?/i;

function partLabelFromWord(word) {
  const w = word.toLowerCase();
  if (/^(vorlesung|lecture)/.test(w)) return "Lecture";
  if (/^(tutori)/.test(w)) return "Tutorial";
  if (/^(praktikum|lab)/.test(w)) return "Lab";
  return "Exercises";
}

/** „[WS26/27] Mathematik … I - Übung“ → { semester: "WS26/27", base: "Mathematik … I", part: "Exercises" } */
function splitTitle(title) {
  let rest = String(title || "").trim();
  let semester = null;
  const tag = rest.match(SEMESTER_TAG) || rest.match(SEMESTER_LEAD);
  if (tag) {
    semester = (tag[1] || tag[0]).replace(/[\s\-–:|]+$/, "").trim();
    rest = rest.slice(tag[0].length);
  }
  let part = null;
  const pre = rest.match(PART_PREFIX) || rest.match(PART_PREFIX_TO);
  if (pre) {
    part = partLabelFromWord(pre[1]);
    rest = rest.slice(pre[0].length);
  }
  // Semester hinten, auch vor dem Teil („Data Structures (Fall 2026) - Exercises“)
  const dropSemester = () => {
    const m = rest.match(SEMESTER_WORDS);
    if (!m) return;
    semester = semester || m[0].replace(/^[\s(,]+|[\s)]+$/g, "");
    rest = rest.slice(0, m.index).trim();
  };
  dropSemester();
  const suf = rest.match(PART_SUFFIX) || rest.match(PART_TRAILING_WORD);
  if (suf && !part) {
    part = partLabelFromWord(suf[1]);
    rest = rest.slice(0, suf.index).trim();
    dropSemester();
  }
  return { semester, base: rest || String(title).trim(), part };
}

// Gebeugte Endungen zählen beim Vergleich nicht („Übungen zur Linearen Algebra I“ ↔ „Lineare Algebra I“)
const keyOf = (semester, base) =>
  `${(semester || "").toLowerCase()}|${base
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w.length >= 5 && /e[nmrs]$/.test(w) ? w.slice(0, -1) : w))
    .join(" ")}`;

/** Bezeichnung einer Übungsgruppe: „Gruppe 05 WiSe 2026“ → „Tutorial group 05“, „Gruppe 7: Do 12 Uhr“ → „Tutorial group 7 (Do 12 Uhr)“ */
function groupLabel(title) {
  const t = String(title || "").replace(SEMESTER_WORDS, "").trim();
  if (/alt\s*klausur|old exams?/i.test(t)) return "Old exams";
  const m = t.match(/^(?:Übungs)?(?:gruppe|group|tutorium|tutorial)\s*0*(\d{1,3})\s*[:\-–]?\s*(.*)$/i);
  if (m) {
    const extra = m[2].replace(SEMESTER_WORDS, "").trim();
    return `Tutorial group ${m[1].padStart(2, "0")}${extra ? ` (${extra})` : ""}`;
  }
  return t;
}

// ------------------------------------------------------------------ Kurznamen

const PHRASES = [
  /\s+(für|fuer)\s+(Studierende|Studenten)\s+(der|des|im)\s+\S+(\s+(?![IVX\d]+$)\S+)?(?=\s+[IVX\d]+$|$)/i,
  /\s+(für|fuer)\s+(Informatiker|Wirtschaftsinformatiker|Wirtschaftswissenschaftler)(innen)?/i,
  /\s+for\s+(students\s+of\s+)?(computer\s+science|economics|business)(\s+students)?/i,
  /^(Grundlagen|Grundzüge)\s+(der|des|von)\s+/i,
  /^Einführung\s+in\s+(die|das|den)\s+/i,
  /^Einführung\s+in\s+/i,
  /^Introduction\s+to\s+(the\s+)?/i,
  /^Fundamentals\s+of\s+/i,
];
const WORDS = [
  [/Algorithmen und Datenstrukturen/i, "AlgoDat"],
  [/Lineare Algebra/i, "LinA"],
  [/Betriebswirtschaftslehre/i, "BWL"],
  [/Volkswirtschaftslehre/i, "VWL"],
  [/Wirtschaftsinformatik/i, "WI"],
  [/Mathematik/i, "Mathe"],
  [/Mathematics/i, "Math"],
  [/Wahrscheinlichkeitstheorie/i, "Stochastik"],
];
const STOP = new Set(["und", "and", "der", "die", "das", "des", "of", "for", "the", "in", "für", "im", "zur", "zum", "mit", "with", "a", "an", "to", "von"]);
const ROMAN = /^(I|II|III|IV|V|VI|\d+)$/;

function acronym(name) {
  const words = name.split(/\s+/).filter(Boolean);
  const tail = ROMAN.test(words[words.length - 1] || "") ? ` ${words.pop()}` : "";
  const letters = words.filter((w) => !STOP.has(w.toLowerCase()) && /^\p{L}/u.test(w)).map((w) => w[0].toUpperCase());
  return letters.length >= 3 ? letters.join("") + tail : null; // erst ab 3 Wörtern verständlich
}

function truncateWords(n, max) {
  if (n.length <= max) return n;
  const cut = n.slice(0, max - 1);
  const atSpace = cut.lastIndexOf(" ");
  return `${(atSpace > max * 0.5 ? cut.slice(0, atSpace) : cut).trimEnd()}…`;
}

/** Häufigstes Kürzel vorne in Dateinamen („ISM_WS26_27_VL08…“ → „ISM“), wenn es eindeutig ist. */
function fileAcronym(fileNames) {
  const counts = new Map();
  for (const n of fileNames) {
    const m = n.match(/^([A-Za-z]{2,5})(?=[_\- ]|\d)/);
    if (m && /[A-Z]{2}/.test(m[1])) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 3 && best[1] >= fileNames.length * 0.3 ? best[0].toUpperCase() : null;
}

/** Kurzname fürs Menü/Wochenstreifen (≤ 22 Zeichen), nur mit Regeln. */
function shortName(base, fileNames = []) {
  let n = base;
  for (const p of PHRASES) n = n.replace(p, "").trim();
  for (const [re, short] of WORDS) n = n.replace(re, short);
  n = n.replace(/\s+-\s+/g, " ").replace(/-\s+/g, "-").replace(/\s{2,}/g, " ").trim() || base;
  if (n.length <= 22) return n;
  const fa = fileAcronym(fileNames);
  if (fa && fa.length >= 2) return fa;
  const ac = acronym(n);
  if (ac && ac.length <= 10) return ac;
  return truncateWords(n, 22);
}

// ------------------------------------------------------------------ Module bilden

/**
 * @param {{id: string, kind: "crs"|"grp", refId: string, title: string, semester?: string, parent?: string|null}[]} courses
 * @param {Record<string, {name?: string, color?: string}>} custom  (config.modules)
 * @param {Record<string, string[]>} fileNamesByCourse  für Kürzel aus Dateinamen
 */
function buildModules(courses, custom = {}, fileNamesByCourse = {}) {
  const byKey = new Map();
  const moduleOfCourse = new Map();
  const info = new Map(courses.map((c) => [c.id, { ...c, ...splitTitle(c.title) }]));

  // 1. Kurse (crs) nach Grundname; verschiedene bekannte Semester trennen („[WS25/26] Mathe I“ ≠ „Mathe I (WiSe 2026/27)“),
  //    ein Kurs ohne Semester gehört zu dem einen bekannten („Introduction … (Winter 2026)“ + „Introduction … – Tutorials“)
  const crs = courses.filter((x) => x.kind !== "grp");
  const semesOf = new Map();
  for (const c of crs) {
    const t = info.get(c.id);
    const base = keyOf("", t.base);
    const sem = normSemester(t.semester);
    if (!semesOf.has(base)) semesOf.set(base, new Set());
    if (sem) semesOf.get(base).add(sem);
  }
  for (const c of crs) {
    const t = info.get(c.id);
    const base = keyOf("", t.base);
    const known = [...semesOf.get(base)];
    const sem = normSemester(t.semester) || (known.length === 1 ? known[0] : "?");
    const key = `${sem}${base}`;
    if (!byKey.has(key)) byKey.set(key, { key, base: t.base, semester: t.semester, parts: [] });
    byKey.get(key).parts.push({ courseId: c.id, label: t.part, kind: "crs" });
    moduleOfCourse.set(c.id, key);
  }
  // 2. Gruppen zum Modul ihres Elternkurses, sonst eigenes Modul
  for (const g of courses.filter((x) => x.kind === "grp")) {
    const parentKey = g.parent && moduleOfCourse.get(g.parent);
    if (parentKey) {
      byKey.get(parentKey).parts.push({ courseId: g.id, label: groupLabel(g.title), kind: "grp" });
      moduleOfCourse.set(g.id, parentKey);
    } else {
      const t = info.get(g.id);
      const key = `grp|${g.id}`;
      byKey.set(key, { key, base: t.base, semester: t.semester, parts: [{ courseId: g.id, label: null, kind: "grp" }] });
      moduleOfCourse.set(g.id, key);
    }
  }

  const modules = [];
  for (const m of byKey.values()) {
    // Hauptkurs: der ohne Zusatz („Lecture“), sonst der erste Kurs
    const main = m.parts.find((p) => p.kind === "crs" && !p.label) || m.parts.find((p) => p.kind === "crs") || m.parts[0];
    const multi = m.parts.length > 1;
    for (const p of m.parts) if (!p.label) p.label = multi ? "Lecture" : "Course";
    const order = { Lecture: 0, Exercises: 1, Tutorial: 2, Lab: 3 };
    m.parts.sort((a, b) => (order[a.label] ?? 5) - (order[b.label] ?? 5) || a.label.localeCompare(b.label));
    const id = `mod-${main.courseId}`;
    const files = m.parts.flatMap((p) => fileNamesByCourse[p.courseId] || []);
    const auto = shortName(m.base, files);
    const sem = courses.find((c) => c.id === main.courseId)?.semester;
    modules.push({
      id,
      fullName: m.base,
      autoName: auto,
      name: custom[id]?.name || auto,
      renamed: Boolean(custom[id]?.name),
      color: custom[id]?.color || null,
      semesterTag: m.semester,
      semester: sem === "past" ? "past" : sem === "current" ? "current" : "unknown",
      mainCourseId: main.courseId,
      parts: m.parts,
    });
  }
  // Gleiche Kurznamen im selben Semester unterscheiden (z. B. zwei „Mathe“): vollen Namen nehmen.
  for (const sem of ["current", "past", "unknown"]) {
    const same = new Map();
    for (const m of modules.filter((x) => x.semester === sem && !x.renamed)) {
      same.set(m.autoName, [...(same.get(m.autoName) || []), m]);
    }
    for (const list of same.values()) {
      if (list.length < 2) continue;
      for (const m of list) m.name = m.autoName = truncateWords(m.fullName, 26);
    }
  }
  return { modules, moduleOfCourse: new Map([...moduleOfCourse].map(([c, k]) => [c, modules.find((m) => m.parts.some((p) => p.courseId === c))?.id])) };
}

// ------------------------------------------------------------------ Art einer Datei

const CATEGORIES = [
  ["solutions", "Solutions", /(l(?:ö|oe|o)sung(?!s?(?:verfahren|menge|ans[aä]tz|strategie|raum|methode))|solution|musterlös|answers?(?![a-z]))/i],
  ["exams", "Exams", /(alt\s*klausur|probeklausur|klausur|exam|prüfung|pruefung)/i],
  ["selfstudy", "Self-study", /(selbststudium|selbstlern|self.?study)/i],
  ["readings", "Readings", /(begleittext|literatur|reading|paper|artikel|reader)/i],
  ["exercises", "Exercises", /(übung|uebung|ubung|exercise|blatt|sheet|homework|hausaufgabe|assignment|aufgabe|tutori|\bhw\s?\d|_ub\d|\bub\d|ü\s?\d|praktikum|\blab\b|fall)/i],
  ["lectures", "Lecture slides", /(vorlesung|lecture|folien|slides|\bvl\s?\d|_vl\d|skript|script|mitschrift|kapitel|chapter|\bv\d{1,2}[_\s])/i],
  ["info", "Info", /(orga|allgemein|general|syllabus|grundlegende|information|hinweis|überblick|overview|einführung)/i],
];
const VIDEO = /\.(mp4|mov|m4v|avi|mkv|webm)$/i;
const CATEGORY_ORDER = ["lectures", "exercises", "solutions", "readings", "selfstudy", "exams", "info", "recordings", "other"];
const CATEGORY_LABEL = Object.fromEntries([...CATEGORIES.map(([id, label]) => [id, label]), ["recordings", "Recordings"], ["other", "Other"]]);

/** Art einer Datei aus Dateiname (zuerst) und Ordnerpfad; partLabel hilft bei Übungskursen. */
function categoryOf(fileName, folderPath, partLabel) {
  if (VIDEO.test(fileName)) return "recordings";
  for (const [id, , re] of CATEGORIES) {
    if (!re.test(fileName)) continue;
    // „Über interne Informationen berichten“ im Ordner Selbststudium ist eine Lerneinheit, keine Kurs-Info
    if (id === "info" && CATEGORIES.find(([k]) => k === "selfstudy")[2].test(folderPath)) return "selfstudy";
    return id;
  }
  for (const [id, , re] of CATEGORIES) if (re.test(folderPath)) return id;
  if (partLabel === "Exercises" || /^Tutorial/.test(partLabel || "")) return "exercises";
  if (partLabel === "Lecture") return "lectures";
  return "other";
}

/** Nummer zum Sortieren („Woche 3“, „VL08“, „Exercise04“, „Blatt 7“) – sonst null. */
function unitNumber(fileName, folderPath) {
  const s = `${folderPath}/${fileName}`;
  const m =
    s.match(/(?:woche|week|kw)\s*0*(\d{1,2})/i) ||
    fileName.match(/(?:vl|v|lecture|vorlesung|kapitel|chapter|exercise|übung|uebung|ub|blatt|sheet|homework|hw|ha|aufgabe)[\s_\-]*0*(\d{1,2})(?!\d)/i) ||
    fileName.match(/^0*(\d{1,3})(?=[_\s\-.])/);
  return m ? Number(m[1]) : null;
}

// ------------------------------------------------------------------ Fremde Termine zuordnen

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Modul für einen Termin aus einem fremden Kalender (z. B. KLIPS): Name, Kurzname oder Kürzel im Titel. */
function matchModule(title, modules) {
  const t = ` ${norm(title)} `;
  let best = null;
  let bestScore = 0;
  for (const m of modules) {
    // Auch die Zwischenform ohne Floskeln, aber unabgekürzt („Mathematik I“)
    let plain = m.fullName;
    for (const p of PHRASES) plain = plain.replace(p, "").trim();
    const names = [m.fullName, m.autoName, m.name, plain].filter(Boolean).map(norm);
    let score = 0;
    for (const n of names) {
      if (n.length >= 3 && t.includes(` ${n} `)) score = Math.max(score, n.length + 10);
    }
    // Wortüberlappung mit dem vollen Namen (mind. 2 bedeutungstragende Wörter)
    const words = norm(m.fullName)
      .split(" ")
      .filter((w) => w.length > 3 && !STOP.has(w));
    const hits = words.filter((w) => t.includes(` ${w} `)).length;
    if (words.length && hits >= Math.min(2, words.length)) score = Math.max(score, hits * 3 + (hits === words.length ? 5 : 0));
    if (m.semester === "current") score += 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return bestScore >= 3 ? best : null;
}

module.exports = {
  splitTitle,
  groupLabel,
  shortName,
  buildModules,
  categoryOf,
  unitNumber,
  matchModule,
  CATEGORY_ORDER,
  CATEGORY_LABEL,
};
