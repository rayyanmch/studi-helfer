// Lernzettel als PDF im Stil der „Lernhilfe“ (Vorbild: Rayyans Lernhilfen aus einem Claude-Projekt):
// Inhaltsverzeichnis, Teile mit „Zusammenfassung in Abschnitten“, „Erklärung für Anfänger“, Analogien,
// Beispiele, Missverständnisse, Kontrollfragen, Tabellen und am Ende die Kernideen.
// Welche Bausteine vorkommen, wählt der Nutzer (SECTIONS). Gerendert wird HTML → PDF mit Electron (printToPDF).

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const katex = require("katex");
const V = require("./sheet-visuals");

/** Bausteine, die der Nutzer an- und ausschalten kann (Reihenfolge = Reihenfolge im PDF). */
const SECTIONS = {
  summary: "a summary in short paragraphs, each starting with a bold lead-in (e.g. **Was ist Marketing?**)",
  beginner: "an explanation for beginners: 2–4 simple 'why/what' questions answered in plain words",
  analogies: "everyday analogies (clearly an analogy, e.g. 'Marketing-Mix: wie ein Rezept')",
  examples: "concrete practical examples, preferably from the material",
  tables: "comparison tables where the material has phases, types, pros/cons or criteria",
  terms: "key terms with a one-sentence definition",
  mnemonics: "memory hooks / mnemonics (Eselsbrücken) for lists and orders",
  misconceptions: "common misconceptions: the wrong belief and why it is wrong",
  anecdotes: "short stories or anecdotes that make the topic memorable; only well-known, true facts (e.g. about a company or person in the material), skip if unsure",
  questions: "review questions (Kontrollfragen) a lecturer could ask in the exam",
  answers: "short model answers to the review questions",
  bigPicture: "at the end: the 3–6 core ideas that connect all parts",
  visuals: "diagrams and plots (see VISUALS)",
  figures: "slide pages as figures (see FIGURES)",
};

/** Bausteine für Mathe-Fächer (eigene Herangehensweise: Definitionen, Sätze, Formeln, Rezepte, Rechenwege). */
const MATH_SECTIONS = {
  summary: "a short overview in 2–4 paragraphs with bold lead-ins: what this part is about and why it matters",
  intuition: "the intuition behind it: what it means, geometric or everyday picture, 1–3 short points",
  definitions: "every important definition, exactly as in the material, with notation",
  theorems: "theorems, rules and properties (Sätze), with all conditions, exactly as in the material",
  formulas: "a formula sheet: each formula with what the symbols mean / when to use it",
  methods: "recipes: step-by-step procedures for the standard task types (e.g. 'Polarform bestimmen: 1. … 2. …')",
  examples: "fully worked examples from the material or exercise sheets: task, every step on its own line with the reason, result",
  tasks: "typical exam task types seen in the exercise sheets and how to approach each",
  mistakes: "typical mistakes (forgotten conditions, sign errors, wrong case distinctions) and the correct way",
  proofs: "proof ideas: the key trick of important proofs in 1–3 sentences",
  practice: "practice problems of the same type as in the material",
  answers: "full solutions to the practice problems, step by step",
  bigPicture: "at the end: how the parts connect (3–6 points)",
  visuals: "diagrams and plots (see VISUALS)",
  figures: "slide pages as figures (see FIGURES)",
};

const MATH_RULES = [
  "This is a mathematics course. Write ALL mathematics in LaTeX: inline as $...$, displayed formulas as $$...$$.",
  "Use proper notation (\\mathbb{R}, \\mathbb{C}, \\frac{}{}, \\sum, \\lim, \\le, \\Rightarrow). Never write math with Unicode symbols like ², ≤, ∑ outside LaTeX.",
  "Definitions and theorems must be exact and complete, including all conditions. Do not simplify them into something false.",
  "In worked examples, every step is its own line and says why (e.g. 'mit dem konjugierten Nenner erweitern').",
  "Calculations must be correct; check each step. If the material has no solution, solve it yourself carefully and say 'eigene Lösung'.",
  "The material is extracted PDF text, so symbols like overlines, hats or arrows may be missing. Silently write the correct notation; never mention the PDF, the extraction or missing symbols.",
].join(" ");

// Längen: Studis wollen lernen, nicht lesen. „short“ = ein A4-Spickzettel (zweispaltig), „normal“ = 2–3 Seiten.
const LENGTHS = {
  short:
    "ONE PAGE ONLY (a cheat sheet, about 350–450 words in total): 2–3 parts, each with the 2–4 most exam-relevant facts. Telegraph style, no full paragraphs, no introductions.",
  normal: "COMPACT: about 2–3 pages (roughly 900–1200 words in total), 3–4 parts. Short sentences, no filler.",
  detailed: "DETAILED: cover every important point of the material; 6–12 pages are fine.",
  exam: "EXAM CHEAT SHEET, MAX 2 PAGES in two dense columns (about 700–900 words in total): 4–6 parts, one per main topic of the course, each with only the 2–3 facts, formulas or models most likely to be asked. Telegraph style.",
};

/** Prüfungsfokus: gilt für alle Längen, damit auch „Detailed“ nicht ausufert. */
const EXAM_FOCUS = [
  "EXAM FOCUS: this sheet is for learning for the exam, not for reading.",
  "Prioritize what the exam will ask: task types from the exercise sheets and old exams, definitions, formulas, models and lists the lecturer marks as important, typical traps.",
  "Leave out: course organisation, history, motivation slides, long examples, anything repeated in another section.",
  "Each point is one line where possible (max ~25 words). Prefer a table, list or diagram over a paragraph.",
].join(" ");

/** Lernzettel („Study sheet“, wie Rayyans Lernhilfen): verstehen und verbinden statt nur abfragen. */
const STUDY_FOCUS = [
  "UNDERSTANDING FIRST: this study sheet should make the student understand the topic and see how everything fits together, so they can then remember it for the exam.",
  "Explain why and how, not only what. Leave out course organisation, history slides and filler.",
  "Mark what the exam will likely ask with **bold** or a 'tip' callout (only exam tips that are in the material).",
].join(" ");

/** Schreibstil (gilt für Lernzettel und Spickzettel). */
const TONES = {
  simple:
    "WRITING STYLE: very simple. Write for someone who is new to the topic or finds it hard: short sentences, everyday words, explain every technical term the first time (in brackets), one concrete example per idea, analogies welcome. Never assume prior knowledge.",
  focused:
    "WRITING STYLE: for a student who attends the lectures: clear and direct, use the technical terms of the course without re-explaining basics, focus on how things work and why.",
  academic:
    "WRITING STYLE: formal and academic, like a good textbook or a model exam answer: precise definitions as in the literature, exact terminology (keep the English terms where the course uses them), name the authors and models from the material, no colloquial language, no analogies or jokes.",
};

/** Seitenziel für Lernzettel: kommt aus der Oberfläche (Materialmenge × Tiefe). */
function studyLength(pages) {
  const p = Math.max(2, Math.min(16, Math.round(Number(pages) || 5)));
  const parts = Math.max(2, Math.min(8, Math.round(p / 1.4)));
  const visuals = Math.max(1, Math.round(p / 2));
  return `LENGTH: about ${p} A4 pages in total. That is roughly ${p * 250} words of text (not more), about ${parts} parts and at most ${visuals} diagrams or figures in the whole sheet. Fill the pages with explanation, examples and connections, not with repetition. Keep each list short (2–3 items per section).`;
}

/** Mehrere Materialien zu denselben Themen verbinden und auf Folien verweisen. */
function connectPrompt(count, legend) {
  return [
    legend ? `THE FILES: ${legend}` : "",
    count > 1
      ? "CONNECT THE MATERIAL: the files are different kinds of material on the same topics (e.g. lecture slides, tutorial slides, exercise sheets, readings). Structure by topic, never file by file. In each part, bring together what each file contributes: the lecture's definition, the tutorial's example or exercise, the reading's detail. Say explicitly how they connect (e.g. 'Das Tutorium übt genau das an …', 'Für Aufgabe 2 auf Blatt 5 brauchst du …')."
      : "",
    "REFERENCES: cite the material inline, directly after the statement, in exactly this form: [F2 p.14] or [F2 p.14-16] (file number and PDF page number from the '--- Page N ---' markers). About one reference per paragraph, example or table, so the student can jump to the slide. Never invent pages.",
    "thread (the 'red thread' at the start): one row per part, in the same order: topic (short), where (only references like '[F1 p.4-12] [F3 p.2]'), link (one sentence: how the materials connect or what builds on what).",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Kurze Namen für Dateien im PDF („VL 9“, „Tut 5“), Art und Woche kommen aus der Oberfläche. */
const FILE_ABBR = {
  de: { lecture: "VL", notes: "Skript", sheet: "Blatt", exslides: "Übung", tutorial: "Tut", solution: "Lösung", reading: "Text", selfstudy: "SLE", exam: "Klausur", info: "Orga", other: "Datei" },
  en: { lecture: "Lecture", notes: "Notes", sheet: "Sheet", exslides: "Exercise", tutorial: "Tutorial", solution: "Solution", reading: "Reading", selfstudy: "Self-study", exam: "Exam", info: "Info", other: "File" },
};
function fileLabels(files, info, lang) {
  if (!info?.some((x) => x?.type)) return null; // ohne Arten: Dateinamen zeigen
  const A = FILE_ABBR[lang] || FILE_ABBR.de;
  const raw = files.map((f, i) => {
    const meta = info?.[i] || {};
    const base = String(f.name || "").replace(/\.[a-z0-9]+$/i, "");
    // Semester und Jahre zuerst weg („BWL26_05_Folien_WiSe_2026_27“ → „BWL_05_Folien_WiSe_“), dann die erste Zahl 1–99
    // („09-System Modeling II“ → 9, „BWL_W2026_02“ → 2)
    const stripped = base
      .replace(/(?:19|20)\d{2}(?:[_/-]\d{2})?/g, " ")
      .replace(/(?:WiSe|SoSe|WS|SS|Wi|So)[\s_-]?\d{2}(?:[_/-]\d{2})?/gi, " ")
      .replace(/^([A-Za-zÄÖÜäöü]{2,6})\d{2}(?=[_\s-])/, "$1 ");
    const num = stripped.match(/(?:^|[^\d])(\d{1,2})(?![\d.])/)?.[1];
    const n = num != null ? Number(num) : meta.week ?? null;
    const abbr = A[meta.type] || null;
    if (!abbr) return base.length > 22 ? `${base.slice(0, 20)}…` : base;
    return n != null ? `${abbr} ${n}` : abbr;
  });
  // Doppelte unterscheiden („VL 6a“, „VL 6b“)
  const seen = {};
  for (const l of raw) seen[l] = (seen[l] || 0) + 1;
  const k = {};
  return raw.map((l) => (seen[l] > 1 ? `${l}${String.fromCharCode(97 + (k[l] = (k[l] ?? -1) + 1))}` : l));
}

/** Harte Grenzen je Länge, falls die KI mehr liefert (Anzahl pro Abschnitt, Teile). */
const CAPS = {
  short: { parts: 3, each: 2, terms: 3, formulas: 3, definitions: 2, theorems: 1, methods: 1, examples: 1, intuition: 1, practice: 1, mistakes: 1, misconceptions: 1, questions: 2, steps: 4, rows: 5, visuals: 1, visualsTotal: 2, callouts: 1, bigPicture: 2 },
  exam: { parts: 6, each: 2, terms: 3, formulas: 3, definitions: 2, theorems: 1, methods: 1, examples: 1, intuition: 1, practice: 0, mistakes: 1, misconceptions: 1, questions: 1, steps: 3, rows: 4, visuals: 1, visualsTotal: 2, callouts: 1, bigPicture: 0 },
  normal: { parts: 4, each: 3, summary: 3, terms: 5, formulas: 6, definitions: 3, theorems: 2, intuition: 1, beginner: 1, analogies: 1, examples: 2, methods: 2, tasks: 2, practice: 2, mistakes: 2, misconceptions: 2, proofs: 1, questions: 2, tables: 1, steps: 6, rows: 6, visuals: 1, visualsTotal: 3, callouts: 1, bigPicture: 4 },
};

function trim(data, length) {
  const c = CAPS[length];
  if (!c) return data;
  const cap = (a, n) => (Array.isArray(a) ? a.slice(0, n) : a);
  const parts = (data.parts || []).slice(0, c.parts).map((p) => {
    const out = { ...p };
    for (const k of Object.keys(out)) if (Array.isArray(out[k]) && k !== "sources") out[k] = cap(out[k], c[k] ?? c.each);
    if (out.tables) out.tables = out.tables.map((t) => ({ ...t, rows: cap(t.rows, c.rows) }));
    if (out.methods) out.methods = out.methods.map((m) => ({ ...m, steps: cap(m.steps, c.steps) }));
    if (out.examples) out.examples = out.examples.map((e) => (typeof e === "object" && e ? { ...e, steps: cap(e.steps, c.steps) } : e));
    return out;
  });
  // Abbildungen insgesamt begrenzen (drei UML-Diagramme sprengen sonst die eine Seite)
  if (c.visualsTotal != null) {
    let left = c.visualsTotal;
    for (const p of parts) {
      if (!Array.isArray(p.visuals)) continue;
      p.visuals = p.visuals.slice(0, Math.max(0, left));
      left -= p.visuals.length;
    }
  }
  return { ...data, parts, bigPicture: cap(data.bigPicture, c.bigPicture) };
}

const lead = { type: "object", properties: { lead: { type: "string" }, text: { type: "string" } }, required: ["lead", "text"], additionalProperties: false };
const qa = { type: "object", properties: { q: { type: "string" }, a: { type: "string" } }, required: ["q", "a"], additionalProperties: false };
const arr = (items) => ({ type: "array", items });
const str = { type: "string" };

const SCHEMA = {
  type: "object",
  properties: {
    language: { type: "string", enum: ["de", "en"], description: "Language of the output" },
    title: { type: "string", description: "e.g. 'Woche 3: Marketing-Mix' or 'Kostenrechnung'" },
    intro: { type: "string", description: "2–3 sentences: what this is about and how it fits into the course" },
    parts: arr({
      type: "object",
      properties: {
        title: { type: "string", description: "e.g. 'Teil 2: Produktpolitik'" },
        summary: arr(lead),
        beginner: arr(qa),
        analogies: arr(lead),
        examples: arr(str),
        tables: arr({
          type: "object",
          properties: { caption: str, columns: arr(str), rows: arr(arr(str)) },
          required: ["caption", "columns", "rows"],
          additionalProperties: false,
        }),
        terms: arr({ type: "object", properties: { term: str, definition: str }, required: ["term", "definition"], additionalProperties: false }),
        mnemonics: arr(str),
        misconceptions: arr({ type: "object", properties: { myth: str, truth: str }, required: ["myth", "truth"], additionalProperties: false }),
        anecdotes: arr(str),
        questions: arr(qa),
        visuals: arr(V.VISUAL),
        callouts: arr(V.CALLOUT),
        sources: arr({ type: "object", properties: { file: { type: "integer" }, page: { type: "integer" } }, required: ["file", "page"], additionalProperties: false }),
      },
      required: ["title", "summary", "beginner", "analogies", "examples", "tables", "terms", "mnemonics", "misconceptions", "anecdotes", "questions", "visuals", "callouts", "sources"],
      additionalProperties: false,
    }),
    thread: arr({ type: "object", properties: { topic: str, where: str, link: str }, required: ["topic", "where", "link"], additionalProperties: false }),
    bigPicture: arr(lead),
  },
  required: ["language", "title", "intro", "thread", "parts", "bigPicture"],
  additionalProperties: false,
};

function cleanInclude(include, math = false) {
  const out = {};
  for (const k of Object.keys(math ? MATH_SECTIONS : SECTIONS)) out[k] = Boolean(include?.[k]);
  out.summary = true; // ohne Zusammenfassung ist es kein Lernzettel
  if (math ? !out.practice : !out.questions) out.answers = false;
  return out;
}

const def = { type: "object", properties: { name: str, text: str }, required: ["name", "text"], additionalProperties: false };
const MATH_SCHEMA = {
  type: "object",
  properties: {
    language: { type: "string", enum: ["de", "en"] },
    title: str,
    intro: str,
    parts: arr({
      type: "object",
      properties: {
        title: str,
        summary: arr(lead),
        intuition: arr(str),
        definitions: arr(def),
        theorems: arr({ type: "object", properties: { name: str, statement: str }, required: ["name", "statement"], additionalProperties: false }),
        formulas: arr({ type: "object", properties: { name: str, formula: str, meaning: str }, required: ["name", "formula", "meaning"], additionalProperties: false }),
        methods: arr({ type: "object", properties: { name: str, steps: arr(str) }, required: ["name", "steps"], additionalProperties: false }),
        examples: arr({ type: "object", properties: { task: str, steps: arr(str), result: str }, required: ["task", "steps", "result"], additionalProperties: false }),
        tasks: arr({ type: "object", properties: { type: str, approach: str }, required: ["type", "approach"], additionalProperties: false }),
        mistakes: arr({ type: "object", properties: { wrong: str, right: str }, required: ["wrong", "right"], additionalProperties: false }),
        proofs: arr(def),
        practice: arr(qa),
        visuals: arr(V.VISUAL),
        callouts: arr(V.CALLOUT),
        sources: arr({ type: "object", properties: { file: { type: "integer" }, page: { type: "integer" } }, required: ["file", "page"], additionalProperties: false }),
      },
      required: ["title", "summary", "intuition", "definitions", "theorems", "formulas", "methods", "examples", "tasks", "mistakes", "proofs", "practice", "visuals", "callouts", "sources"],
      additionalProperties: false,
    }),
    thread: arr({ type: "object", properties: { topic: str, where: str, link: str }, required: ["topic", "where", "link"], additionalProperties: false }),
    bigPicture: arr(lead),
  },
  required: ["language", "title", "intro", "thread", "parts", "bigPicture"],
  additionalProperties: false,
};

/** Länge, Fokus, Verbindungen und Schreibstil: für Lernzettel anders als für Spickzettel. */
function framing({ length, pages, tone, count, legend }) {
  const study = length === "study";
  return [
    study ? STUDY_FOCUS : EXAM_FOCUS,
    TONES[tone] || TONES.focused,
    study ? connectPrompt(count, legend) : "Leave thread empty. Do not write inline references like [F1 p.2]; use sources.",
    study ? studyLength(pages) : LENGTHS[length] || LENGTHS.normal,
  ].join("\n");
}

function mathPrompt({ moduleName, count, include, length, focus, context, candidates, pages, tone, legend }) {
  const on = Object.entries(MATH_SECTIONS).filter(([k]) => include[k] && !["answers", "bigPicture", "visuals", "figures"].includes(k));
  const off = Object.keys(MATH_SECTIONS).filter((k) => !include[k] && !["answers", "bigPicture", "summary", "visuals", "figures"].includes(k));
  return [
    `Course: ${moduleName || "unknown"}. Write a study guide for a math course from these ${count} file(s), marked F1…F${count}.`,
    context ? `The files belong to: ${context}. Start the title with it, e.g. "Woche 3–4: …" (in the language of the material).` : "",
    MATH_RULES,
    "Structure it into parts by topic, like a good tutor. Each part contains:",
    ...on.map(([k, d]) => `- ${k}: ${d}`),
    include.practice ? (include.answers ? "- In practice, 'a' is the full solution." : "- In practice, leave 'a' empty.") : "",
    off.length ? `Leave these arrays empty in every part: ${off.join(", ")}.` : "",
    include.bigPicture ? `- bigPicture: ${MATH_SECTIONS.bigPicture}` : "Leave bigPicture empty.",
    include.visuals ? V.visualPrompt({ subject: "math", figures: include.figures, candidates }) : "Leave visuals empty in every part. CALLOUTS: 1–2 per part ('remember' for the key takeaway, 'warning' for traps).",
    "sources: the file numbers and pages a part is based on.",
    framing({ length, pages, tone, count, legend }),
    focus ? `Focus on: ${focus}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function prompt({ moduleName, count, include, length, focus, context, subject, candidates, pages, tone, legend }) {
  const on = Object.entries(SECTIONS).filter(([k]) => include[k] && !["answers", "visuals", "figures"].includes(k));
  const off = Object.keys(SECTIONS).filter((k) => !include[k] && !["answers", "bigPicture", "visuals", "figures"].includes(k));
  return [
    length === "study"
      ? `Course: ${moduleName || "unknown"}. Write a study sheet ("Lernhilfe") from these ${count} file(s), marked F1…F${count}.`
      : `Course: ${moduleName || "unknown"}. Write a cheat sheet ("Spickzettel") from these ${count} file(s), marked F1…F${count}.`,
    context ? `The files belong to: ${context}. Start the title with it, e.g. "Woche 3–4: …" (in the language of the material).` : "",
    "Structure it into parts by topic (not by file), like a good tutor would. Each part contains:",
    ...on.filter(([k]) => k !== "bigPicture").map(([k, d]) => `- ${k}: ${d}`),
    include.questions && include.answers ? "- In questions, fill 'a' with a short model answer." : include.questions ? "- In questions, leave 'a' empty." : "",
    off.length ? `Leave these arrays empty in every part: ${off.join(", ")}.` : "",
    include.bigPicture ? `- bigPicture: ${SECTIONS.bigPicture}` : "Leave bigPicture empty.",
    "Use **bold** for key words inside texts. Tables only where they really help.",
    include.visuals ? V.visualPrompt({ subject, figures: include.figures, candidates }) : "Leave visuals empty in every part. CALLOUTS: 1–2 per part ('remember' for the key takeaway, 'warning' for traps, 'tip' only for exam tips from the material).",
    "sources: the file numbers and pages a part is based on.",
    framing({ length, pages, tone, count, legend }),
    focus ? `Focus on: ${focus}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ------------------------------------------------------------------ HTML

const LABELS = {
  de: {
    contents: "Inhalt",
    summary: "Zusammenfassung in Abschnitten",
    beginner: "Erklärung für Anfänger",
    analogies: "Analogien",
    examples: "Praktische Beispiele",
    tables: "Übersicht",
    terms: "Wichtige Begriffe",
    mnemonics: "Eselsbrücken",
    misconceptions: "Häufige Missverständnisse",
    anecdotes: "Gut zu wissen",
    questions: "Kontrollfragen",
    answers: "Antworten",
    answer: "Antwort",
    bigPicture: "Übergreifende Struktur: Die Kernideen",
    sources: "Quellen",
    page: "S.",
    made: "Erstellt mit Studi-Helfer",
  },
  en: {
    contents: "Contents",
    summary: "Summary",
    beginner: "Explained simply",
    analogies: "Analogies",
    examples: "Practical examples",
    tables: "Overview",
    terms: "Key terms",
    mnemonics: "Memory hooks",
    misconceptions: "Common misconceptions",
    anecdotes: "Good to know",
    questions: "Review questions",
    answers: "Answers",
    answer: "Answer",
    bigPicture: "The big picture: core ideas",
    sources: "Sources",
    page: "p.",
    made: "Made with Studi-Helfer",
  },
};

const MATH_LABELS = {
  de: {
    summary: "Überblick",
    intuition: "Intuition",
    definitions: "Definitionen",
    theorems: "Sätze und Regeln",
    formulas: "Formeln",
    methods: "So gehst du vor",
    examples: "Durchgerechnete Beispiele",
    tasks: "Typische Klausuraufgaben",
    mistakes: "Typische Fehler",
    proofs: "Beweisideen",
    practice: "Übungsaufgaben",
    definition: "Definition",
    theorem: "Satz",
    example: "Beispiel",
    result: "Ergebnis",
    solution: "Lösung",
    wrong: "Falsch",
    right: "Richtig",
    formula: "Formel",
    meaning: "Bedeutung",
  },
  en: {
    summary: "Overview",
    intuition: "Intuition",
    definitions: "Definitions",
    theorems: "Theorems and rules",
    formulas: "Formulas",
    methods: "How to do it",
    examples: "Worked examples",
    tasks: "Typical exam tasks",
    mistakes: "Typical mistakes",
    proofs: "Proof ideas",
    practice: "Practice problems",
    definition: "Definition",
    theorem: "Theorem",
    example: "Example",
    result: "Result",
    solution: "Solution",
    wrong: "Wrong",
    right: "Right",
    formula: "Formula",
    meaning: "Meaning",
  },
};

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
/** Text mit **fett** → HTML. */
const richPlain = (s) =>
  esc(s)
    .replace(/`([^`\n]{1,60})`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

/** Text mit $…$ / $$…$$ (und \\(…\\), \\[…\\]) → HTML mit KaTeX; der Rest wie richPlain. */
function richMath(s) {
  const text = String(s ?? "");
  const re = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)/g;
  let out = "";
  let last = 0;
  for (const m of text.matchAll(re)) {
    out += richPlain(text.slice(last, m.index));
    const display = m[1] != null || m[2] != null;
    const tex = m[1] ?? m[2] ?? m[3] ?? m[4];
    out += katex.renderToString(tex, { displayMode: display, throwOnError: false, output: "html", strict: "ignore" });
    last = m.index + m[0].length;
  }
  return out + richPlain(text.slice(last));
}

function sheetHtml(sheet, { moduleName, accent = "#22325c" }) {
  const dense = sheet.length === "short" || sheet.length === "exam";
  // Spickzettel: Überschriften kurz oder weg (der Inhalt spricht für sich)
  const DENSE = {
    de: { summary: "", tables: "", terms: "Begriffe", misconceptions: "Fallen", questions: "Fragen", beginner: "Einfach erklärt", examples: "Beispiele", mnemonics: "Eselsbrücken" },
    en: { summary: "", tables: "", terms: "Terms", misconceptions: "Traps", questions: "Questions", beginner: "Simply put", examples: "Examples", mnemonics: "Memory hooks" },
  };
  // Kompakt (2–3 Seiten) bekommt dieselben kurzen Überschriften wie der Spickzettel
  const brief = dense || sheet.length === "normal";
  const L = { ...(LABELS[sheet.language] || LABELS.de), ...(brief ? DENSE[sheet.language] || DENSE.de : {}) };
  const M = MATH_LABELS[sheet.language] || MATH_LABELS.de;
  const rich = sheet.math ? richMath : richPlain;
  const fileName = (i) => sheet.files[i - 1]?.name.replace(/\.[a-z0-9]+$/i, "") ?? null;
  const study = sheet.length === "study";
  // Kurzname der Datei („VL 9“), bei älteren Lernzetteln der Dateiname
  const label = (i) => sheet.labels?.[i - 1] || fileName(i);
  const parts = sheet.parts || [];
  const h3 = (key, body) => (body ? `${L[key] ? `<h3>${L[key]}</h3>` : ""}${body}` : "");
  // „Definition über R².“ → „Definition über R²:“ (Satzzeichen am Ende vereinheitlichen, Fragen bleiben Fragen)
  const leadText = (l) => {
    const t = String(l ?? "").replace(/\*\*/g, "").trim().replace(/[.:;,]+$/, "");
    return t && !/[?!]$/.test(t) ? `${t}:` : t;
  };
  const leads = (list) => (list?.length ? list.map((x) => `<p><strong>${rich(leadText(x.lead))}</strong> ${rich(x.text)}</p>`).join("") : "");
  const bullets = (list, f = rich) => (list?.length ? `<ul>${list.map((x) => `<li>${f(x)}</li>`).join("")}</ul>` : "");
  const numbered = (list, f) => (list?.length ? `<ol>${list.map((x) => `<li>${f(x)}</li>`).join("")}</ol>` : "");

  const vctx = { rich, files: sheet.files || [], accent, labels: { source: L.sources.replace(/n$/, ""), page: L.page } };
  const visualsOf = (p) => (p.visuals || []).map((v) => V.visualHtml(v, vctx)).join("");
  const calloutsOf = (p) => (p.callouts || []).filter((c) => c.kind !== "code").map((c) => V.calloutHtml(c, { rich, language: sheet.language })).join("");
  const codeOf = (p) => (p.callouts || []).filter((c) => c.kind === "code").map((c) => V.calloutHtml(c, { rich, language: sheet.language })).join("");
  // Quellen je Datei zusammenfassen: „09-System Modeling II S. 4, 5, 18“
  const groupSources = (sources) => {
    const byFile = new Map();
    for (const x of sources || []) {
      const name = label(x.file);
      if (!name) continue;
      const pages = byFile.get(name) ?? new Set();
      if (x.page > 0) pages.add(x.page);
      byFile.set(name, pages);
    }
    return [...byFile.entries()].map(([name, pages]) => `${esc(name)}${pages.size ? ` ${L.page} ${[...pages].sort((a, b) => a - b).join(", ")}` : ""}`);
  };
  const sourcesOf = (p) => {
    const list = groupSources(p.sources);
    return list.length ? `<p class="sources">${L.sources}: ${list.join(" · ")}</p>` : "";
  };

  // „Satz (Re, Im)“ nicht als „Satz · Satz (Re, Im)“: steht die Art schon im Namen, nur den Namen zeigen
  const boxTitle = (label, name) =>
    /^(satz|theorem|definition|lemma|korollar|corollary|bemerkung|remark|proposition|folgerung|regel|rule)\b/i.test(String(name ?? "").trim())
      ? rich(name)
      : `${label} · ${rich(name)}`;

  // Mathe: Kästen für Definitionen und Sätze, Formeltabelle, Rezepte und Rechenwege
  const mathPartHtml = (p, i) => {
    const MD = brief ? { summary: "", formulas: sheet.language === "en" ? "Formulas" : "Formeln", definitions: "", theorems: "" } : {};
    const h = (key, body) => {
      if (!body) return "";
      const label = key in MD ? MD[key] : M[key];
      return `${label ? `<h3>${label}</h3>` : ""}${body}`;
    };
    const steps = (list) => (list?.length ? `<ol class="steps">${list.map((x) => `<li>${rich(x)}</li>`).join("")}</ol>` : "");
    return `<section class="part" id="p${i}">
      <h2>${rich(p.title)}</h2>
      ${h("summary", leads(p.summary))}
      ${calloutsOf(p)}
      ${h("intuition", bullets(p.intuition, rich))}
      ${visualsOf(p)}
      ${h("definitions", (p.definitions || []).map((d) => `<div class="box def"><div class="box-h">${boxTitle(M.definition, d.name)}</div>${rich(d.text)}</div>`).join(""))}
      ${h("theorems", (p.theorems || []).map((t) => `<div class="box thm"><div class="box-h">${boxTitle(M.theorem, t.name)}</div>${rich(t.statement)}</div>`).join(""))}
      ${h(
        "formulas",
        p.formulas?.length
          ? `<table class="formulas"><tbody>${p.formulas.map((f) => `<tr><td class="f-name">${rich(f.name)}</td><td class="f-formula">${rich(f.formula)}</td><td>${rich(f.meaning)}</td></tr>`).join("")}</tbody></table>`
          : "",
      )}
      ${h("methods", (p.methods || []).map((m) => `<div class="method"><p><strong>${rich(m.name)}</strong></p>${steps(m.steps)}</div>`).join(""))}
      ${h(
        "examples",
        (p.examples || [])
          .map((e) => `<div class="example"><p><strong>${M.example}:</strong> ${rich(e.task)}</p>${steps(e.steps)}${e.result ? `<p class="result"><strong>${M.result}:</strong> ${rich(e.result)}</p>` : ""}</div>`)
          .join(""),
      )}
      ${h("tasks", bullets(p.tasks, (t) => `<strong>${rich(t.type)}:</strong> ${rich(t.approach)}`))}
      ${h("mistakes", bullets(p.mistakes, (m) => `<span class="wrong">${M.wrong}:</span> ${rich(m.wrong)}<br><span class="right">${M.right}:</span> ${rich(m.right)}`))}
      ${h("proofs", bullets(p.proofs, (x) => `<strong>${rich(x.name)}:</strong> ${rich(x.text)}`))}
      ${codeOf(p)}
      ${h("practice", numbered(p.practice, (q) => `${rich(q.q)}${sheet.include?.answers && q.a ? `<div class="answer"><span>${M.solution}:</span> ${rich(q.a)}</div>` : ""}`))}
      ${sourcesOf(p)}
    </section>`;
  };

  const partHtml = (p, i) => {
    if (sheet.math) return mathPartHtml(p, i);
    const tables = (p.tables || [])
      .filter((t) => t.columns?.length && t.rows?.length)
      .map(
        (t) =>
          `<div class="tbl">${t.caption ? `<p class="caption"><strong>${rich(t.caption)}</strong></p>` : ""}<table><thead><tr>${t.columns.map((c) => `<th>${rich(c)}</th>`).join("")}</tr></thead><tbody>${t.rows
            .map((r) => `<tr>${t.columns.map((_, ci) => `<td>${rich(r[ci] ?? "")}</td>`).join("")}</tr>`)
            .join("")}</tbody></table></div>`,
      )
      .join("");
    const terms = p.terms?.length ? `<dl>${p.terms.map((t) => `<dt>${rich(t.term)}</dt><dd>${rich(t.definition)}</dd>`).join("")}</dl>` : "";
    const questions = p.questions?.length
      ? numbered(p.questions, (q) => `${rich(q.q)}${sheet.include?.answers && q.a ? `<div class="answer"><span>${L.answer}:</span> ${rich(q.a)}</div>` : ""}`)
      : "";
    const sources = groupSources(p.sources);
    return `<section class="part" id="p${i}">
      <h2>${rich(p.title)}</h2>
      ${h3("summary", leads(p.summary))}
      ${visualsOf(p)}
      ${calloutsOf(p)}
      ${h3("beginner", numbered(p.beginner, (x) => `<strong>${rich(x.q)}</strong> ${rich(x.a)}`))}
      ${h3("analogies", bullets(p.analogies, (x) => `<strong>${rich(leadText(x.lead))}</strong> ${rich(x.text)}`))}
      ${h3("examples", numbered(p.examples, rich))}
      ${h3("tables", tables)}
      ${h3("terms", terms)}
      ${h3("mnemonics", bullets(p.mnemonics))}
      ${h3("misconceptions", numbered(p.misconceptions, (m) => `<strong>${sheet.language === "en" ? `“${rich(m.myth)}”` : `„${rich(m.myth)}“`}</strong> ${rich(m.truth)}`))}
      ${h3("anecdotes", bullets(p.anecdotes))}
      ${codeOf(p)}
      ${h3("questions", questions)}
      ${sources.length ? `<p class="sources">${L.sources}: ${[...new Set(sources)].join(" · ")}</p>` : ""}
    </section>`;
  };

  // Lernzettel: welche Datei welcher Kurzname ist, und der rote Faden durch die Materialien
  const T = sheet.language === "en" ? { material: "Material", thread: "How it all fits together", topic: "Topic", where: "Where", link: "How it connects" } : { material: "Material", thread: "Roter Faden", topic: "Thema", where: "Wo", link: "Zusammenhang" };
  const materialHtml =
    sheet.labels?.length && sheet.files?.length
      ? `<p class="legend"><strong>${T.material}:</strong> ${sheet.files.map((f, i) => `<span class="lg"><b>${esc(label(i + 1))}</b> ${esc(fileName(i + 1))}</span>`).join("")}</p>`
      : "";
  const threadHtml = sheet.thread?.length
    ? `<section class="thread"><h2>${T.thread}</h2><table><thead><tr><th>${T.topic}</th><th>${T.where}</th><th>${T.link}</th></tr></thead><tbody>${sheet.thread
        .map((r) => `<tr><td><strong>${rich(r.topic)}</strong></td><td class="where">${rich(r.where)}</td><td>${rich(r.link)}</td></tr>`)
        .join("")}</tbody></table></section>`
    : "";

  const big = sheet.bigPicture?.length ? `<section class="part" id="big"><h2>${L.bigPicture}</h2>${numbered(sheet.bigPicture, (x) => `<strong>${rich(leadText(x.lead))}</strong> ${rich(x.text)}`)}</section>` : "";
  const date = new Date(sheet.createdAt).toLocaleDateString(sheet.language === "en" ? "en-US" : "de-DE", { day: "numeric", month: "long", year: "numeric" });

  const html = `<!doctype html><html lang="${sheet.language || "de"}"><head><meta charset="utf-8"><title>${esc(sheet.title)}</title><style>
  @page { size: A4; margin: ${sheet.length === "short" || sheet.length === "exam" ? "10mm 11mm 11mm 11mm" : sheet.length === "normal" || sheet.length === "study" ? "14mm 15mm 15mm 15mm" : "18mm 17mm 18mm 17mm"}; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.55 -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #1d1d1f; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .meta { font-size: 8.5pt; color: #6b7280; margin-bottom: 10px; display: flex; justify-content: space-between; }
  .toc { background: #f4f6fa; border: 1px solid #dde3ee; border-radius: 4px; padding: 10px 18px; margin: 0 0 18px; font-size: 10pt; }
  .toc p { margin: 0 0 4px; font-weight: 600; color: ${accent}; }
  .toc ol { margin: 0; padding-left: 20px; } .toc li { margin: 2px 0; } .toc a { color: #2f4f8f; text-decoration: none; }
  h1 { font-size: 22pt; line-height: 1.2; color: ${accent}; margin: 4px 0 8px; padding-bottom: 8px; border-bottom: 2px solid ${accent}; }
  .intro { margin: 0 0 6px; }
  h2 { font-size: 14.5pt; color: ${accent}; margin: 22px 0 8px; padding-bottom: 5px; border-bottom: 1px solid #d5dae3; break-after: avoid; }
  h3 { font-size: 11.5pt; color: #3a5ba0; margin: 14px 0 6px; break-after: avoid; }
  p { margin: 0 0 7px; } ul, ol { margin: 0 0 8px; padding-left: 22px; } li { margin: 3px 0; }
  strong { font-weight: 650; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 10px; font-size: 9.5pt; break-inside: avoid; }
  th { background: #e9edf5; text-align: left; font-weight: 650; }
  th, td { border: 1px solid #d5dae3; padding: 5px 7px; vertical-align: top; }
  .caption { margin: 8px 0 4px; break-after: avoid; }
  .tbl { break-inside: avoid; }
  li, dt, dd, p { orphans: 2; widows: 2; }
  dl { margin: 0 0 8px; display: grid; grid-template-columns: minmax(0, max-content) minmax(55%, 1fr); gap: 3px 14px; }
  dt { font-weight: 650; } dd { margin: 0; }
  .answer { margin-top: 3px; color: #374151; font-size: 9.5pt; } .answer span { font-weight: 650; color: #3a5ba0; }
  .sources { font-size: 8.5pt; color: #6b7280; margin-top: 8px; }
  .part { break-inside: auto; }
  /* Kompakt (2–3 Seiten) */
  a.ref { display: inline-block; font-size: 0.76em; font-weight: 650; line-height: 1.35; color: ${accent}; background: #eaeff8; border-radius: 3px; padding: 0 4px; margin: 0 0 0 2px; text-decoration: none; white-space: nowrap; vertical-align: 0.08em; }
  .legend { font-size: 8.4pt; color: #4b5563; margin: 4px 0 10px; line-height: 1.7; }
  .legend .lg { display: inline-block; margin-right: 12px; white-space: nowrap; } .legend .lg b { color: ${accent}; font-weight: 650; margin-right: 3px; }
  .thread { break-inside: avoid; } .thread table { font-size: 9pt; } .thread td.where { white-space: normal; width: 22%; } .thread td:first-child { width: 24%; }
  .thread th { background: #e9edf5; }
  code { font: 0.92em ui-monospace, Menlo, monospace; background: #f1f3f6; border-radius: 3px; padding: 0 3px; }
  body.study { font-size: 9.6pt; line-height: 1.45; }
  body.study h1 { font-size: 19pt; } body.study h2 { font-size: 13pt; margin: 16px 0 6px; } body.study h3 { font-size: 10.4pt; margin: 10px 0 4px; }
  body.study p { margin: 0 0 5px; } body.study li { margin: 2px 0; } body.study ul, body.study ol { margin-bottom: 6px; }
  body.study table { font-size: 8.8pt; } body.study th, body.study td { padding: 3px 6px; }
  body.study figure.visual > svg, body.study figure.visual pre.mermaid > svg { max-height: 72mm; }
  body.study .box, body.study .callout { margin: 4px 0 7px; }
  body.normal { font-size: 9pt; line-height: 1.38; }
  body.normal h1 { font-size: 16pt; margin-bottom: 6px; } body.normal .intro { margin-bottom: 8px; }
  body.normal .cols { column-count: 2; column-gap: 7mm; column-rule: 1px solid #e3e7ee; }
  body.normal h2 { font-size: 11pt; margin: 10px 0 4px; break-after: avoid; } body.normal h3 { font-size: 9.4pt; margin: 6px 0 3px; }
  body.normal p, body.normal li { margin: 0 0 4px; } body.normal ul, body.normal ol { padding-left: 16px; }
  body.normal table { font-size: 8.4pt; } body.normal th, body.normal td { padding: 3px 5px; }
  body.normal .box, body.normal .callout { padding: 5px 9px; margin: 4px 0 7px; }
  body.normal figure.visual > svg, body.normal figure.visual pre.mermaid > svg { max-height: 62mm; }
  body.normal .part { break-inside: auto; }
  body.normal .box, body.normal .callout, body.normal figure.visual, body.normal table, body.normal .example, body.normal .method { break-inside: avoid-column; }
  /* Einseiter: zweispaltiger Spickzettel */
  body.short { font-size: 8.4pt; line-height: 1.32; }
  body.short .meta { margin-bottom: 4px; font-size: 7.5pt; }
  body.short h1 { font-size: 14pt; margin: 0 0 4px; padding-bottom: 4px; border-bottom-width: 1.5px; }
  body.short .intro { font-size: 8.4pt; margin-bottom: 4px; }
  body.short .cols { column-count: 2; column-gap: 6mm; column-rule: 1px solid #e3e7ee; }
  body.short h2 { font-size: 10pt; margin: 6px 0 3px; padding-bottom: 2px; break-after: avoid; }
  body.short h3 { font-size: 8.6pt; margin: 4px 0 2px; }
  body.short p, body.short li { margin: 0 0 3px; } body.short ul, body.short ol { padding-left: 14px; margin-bottom: 4px; }
  body.short table { font-size: 7.8pt; margin: 2px 0 5px; } body.short th, body.short td { padding: 2px 4px; }
  body.short .box, body.short .callout { padding: 3px 7px; margin: 3px 0 5px; }
  body.short figure.visual { margin: 3px 0 6px; } body.short figure.visual > svg, body.short figure.visual pre.mermaid > svg { max-height: 50mm; }
  body.short .chain .step { font-size: 7.6pt; padding: 2px 6px; } body.short figcaption { font-size: 7.4pt; }
  body.short .sources { font-size: 7pt; margin-top: 2px; }
  body.short .part { break-inside: auto; }
  body.short .box-h, body.short .callout .c-h { font-size: 7.6pt; margin-bottom: 1px; }
  body.short .katex { font-size: 1em; } body.short .katex-display { margin: 2px 0; }
  body.short table.formulas td { padding: 2px 4px; } body.short td.f-name { width: 24%; } body.short td.f-formula { width: 44%; }
  body.short ol.steps li { margin: 1px 0; }
  body.short .box, body.short .callout, body.short figure.visual, body.short table, body.short .example, body.short .method { break-inside: avoid-column; }
  .box { border-left: 3px solid ${accent}; background: #f4f6fa; border-radius: 3px; padding: 7px 11px; margin: 0 0 8px; break-inside: avoid; }
  .box.thm { border-left-color: #3a5ba0; background: #eef3fb; }
  .box-h { font-weight: 650; color: ${accent}; font-size: 9.5pt; margin-bottom: 2px; }
  table.formulas td { border: none; border-bottom: 1px solid #e3e7ee; padding: 6px 7px; vertical-align: middle; }
  td.f-name { font-weight: 650; width: 18%; } td.f-formula { width: 47%; }
  ol.steps { margin: 2px 0 6px; } ol.steps li { margin: 2px 0; }
  .example, .method { break-inside: avoid; margin: 0 0 8px; }
  .result { margin-top: 2px; }
  .wrong { font-weight: 650; color: #b3261e; } .right { font-weight: 650; color: #2f7a46; }
  .katex { font-size: 1.04em; } .katex-display { margin: 6px 0; }
  ${V.VISUAL_CSS}
</style>${sheet.math ? `<link rel="stylesheet" href="${pathToFileURL(require.resolve("katex/dist/katex.min.css")).href}">` : ""}</head><body class="${sheet.length === "exam" ? "short exam" : sheet.length || ""}">
  <div class="meta"><span>${esc(moduleName || "")}</span><span>${esc(date)} · ${L.made}</span></div>
  ${parts.length > 3 && !brief && !(study && sheet.thread?.length) ? `<nav class="toc"><p>${L.contents}</p><ol>${parts.map((p, i) => `<li><a href="#p${i}">${rich(p.title)}</a></li>`).join("")}${big ? `<li><a href="#big">${L.bigPicture}</a></li>` : ""}</ol></nav>` : ""}
  <h1>${rich(sheet.title)}</h1>
  <p class="intro">${rich(sheet.intro)}</p>
  ${study ? materialHtml : ""}
  ${study ? threadHtml : ""}
  <div class="cols">
  ${parts.map(partHtml).join("")}
  ${big}
  </div>
  ${needsScript(sheet) ? V.pageScript() : ""}
</body></html>`;
  return linkRefs(html, sheet, label, L.page);
}

/** „[F2 p.14-16]“ im Text → kleine Marke „VL 9 S. 14–16“, die die Folien-PDF öffnet. */
function linkRefs(html, sheet, label, pageWord) {
  const re = /\[F(\d{1,2})(?:\s*(?:p\.?|S\.?|pp\.?)\s*(\d+(?:\s*[-–,]\s*\d+)*))?\]/g;
  return html
    .split(/(<pre[\s\S]*?<\/pre>|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>)/)
    .map((chunk, k) =>
      k % 2
        ? chunk
        : chunk.replace(re, (m, f, pages) => {
            const i = Number(f);
            const file = sheet.files?.[i - 1];
            if (!file) return "";
            const pg = pages ? pages.replace(/\s*-\s*/g, "–").replace(/\s*,\s*/g, ", ") : "";
            const first = pages ? Number(pages.match(/\d+/)[0]) : 0;
            let href = "";
            try {
              href = pathToFileURL(file.path).href + (first ? `#page=${first}` : "");
            } catch {
              href = "";
            }
            const text = `${esc(label(i))}${pg ? ` ${pageWord} ${pg}` : ""}`;
            return href ? `<a class="ref" href="${href}">${text}</a>` : `<span class="ref">${text}</span>`;
          }),
    )
    .join("");
}

/** Braucht der Lernzettel das Skript im Druckfenster (Mermaid-Diagramme oder Folienseiten)? */
function needsScript(sheet) {
  return (sheet.parts || []).some((p) => (p.visuals || []).some((v) => (v.type === "diagram" && v.mermaid?.trim()) || (v.type === "figure" && v.figure?.page > 0)));
}

/** Alte Lernzettel (nur `sections`) in die neue Form bringen, damit sie auch als PDF gehen. */
function upgrade(sheet) {
  if (sheet.parts) return sheet;
  return {
    ...sheet,
    language: "de",
    intro: "",
    include: { summary: true },
    parts: (sheet.sections || []).map((s) => ({
      title: s.heading,
      summary: s.points.map((p) => ({ lead: "", text: p.text })),
      sources: s.points.filter((p) => p.file > 0).map((p) => ({ file: p.file, page: p.page })),
    })),
    bigPicture: [],
  };
}

/** Seitenzahl einer von Chromium erzeugten PDF (Seitenobjekte zählen). */
function pageCount(buf) {
  return (Buffer.from(buf).toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
}

/** HTML → PDF mit einem unsichtbaren Fenster. */
async function renderPdf(BrowserWindow, input, { moduleName, accent, outFile }) {
  // Längen auch bei älteren Lernzetteln einhalten (neu erstellte sind schon gekürzt, trim ändert dann nichts)
  const sheet = input.parts && CAPS[input.length] ? { ...input, ...trim(input, input.length) } : input;
  const html = sheetHtml(upgrade(sheet), { moduleName, accent }).replace(/<p><strong><\/strong> /g, "<p>");
  const tmp = path.join(os.tmpdir(), `studi-sheet-${sheet.id}.html`);
  fs.writeFileSync(tmp, html);
  // JavaScript nur für Diagramme/Folienseiten; webSecurity aus, damit pdf.js die lokale PDF lesen darf (eigener Inhalt, kein Node)
  const script = needsScript(upgrade(sheet));
  const win = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { javascript: script, sandbox: true, webSecurity: !script, nodeIntegration: false, contextIsolation: true } });
  try {
    await win.loadFile(tmp);
    if (script) {
      for (let k = 0; k < 60; k++) {
        if (await win.webContents.executeJavaScript("Boolean(window.__ready)").catch(() => false)) break;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    const print = (scale = 1) =>
      win.webContents.printToPDF({
        pageSize: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        scale,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: `<div style="width:100%;font:7.5pt -apple-system,Helvetica,sans-serif;color:#9ca3af;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
      });
    let pdf = await print();
    // Spickzettel passen immer auf ihre Seite(n): sonst etwas kleiner drucken (bis ~84 %)
    const fit = { short: 1, exam: 2 }[sheet.length];
    if (fit) {
      for (const scale of [0.95, 0.9, 0.85]) {
        if (pageCount(pdf) <= fit) break;
        pdf = await print(scale);
      }
    }
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, pdf);
    return outFile;
  } finally {
    win.destroy();
    fs.rmSync(tmp, { force: true });
  }
}

module.exports = { trim, fileLabels, TONES, SUBJECT_LABELS: V.SUBJECT_LABELS, SECTIONS, SCHEMA, MATH_SECTIONS, MATH_SCHEMA, MATH_RULES, cleanInclude, prompt, mathPrompt, sheetHtml, renderPdf, upgrade, richMath };
