// Lernzettel als PDF im Stil der „Lernhilfe“ (Vorbild: Rayyans Lernhilfen aus einem Claude-Projekt):
// Inhaltsverzeichnis, Teile mit „Zusammenfassung in Abschnitten“, „Erklärung für Anfänger“, Analogien,
// Beispiele, Missverständnisse, Kontrollfragen, Tabellen und am Ende die Kernideen.
// Welche Bausteine vorkommen, wählt der Nutzer (SECTIONS). Gerendert wird HTML → PDF mit Electron (printToPDF).

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const katex = require("katex");

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
};

const MATH_RULES = [
  "This is a mathematics course. Write ALL mathematics in LaTeX: inline as $...$, displayed formulas as $$...$$.",
  "Use proper notation (\\mathbb{R}, \\mathbb{C}, \\frac{}{}, \\sum, \\lim, \\le, \\Rightarrow). Never write math with Unicode symbols like ², ≤, ∑ outside LaTeX.",
  "Definitions and theorems must be exact and complete, including all conditions. Do not simplify them into something false.",
  "In worked examples, every step is its own line and says why (e.g. 'mit dem konjugierten Nenner erweitern').",
  "Calculations must be correct; check each step. If the material has no solution, solve it yourself carefully and say 'eigene Lösung'.",
].join(" ");

const LENGTHS = {
  short: "Keep it compact: about 2–3 pages in total, only the essentials.",
  normal: "About 4–7 pages in total.",
  detailed: "Be thorough: cover every important point of the material, 8–14 pages are fine.",
};

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
        sources: arr({ type: "object", properties: { file: { type: "integer" }, page: { type: "integer" } }, required: ["file", "page"], additionalProperties: false }),
      },
      required: ["title", "summary", "beginner", "analogies", "examples", "tables", "terms", "mnemonics", "misconceptions", "anecdotes", "questions", "sources"],
      additionalProperties: false,
    }),
    bigPicture: arr(lead),
  },
  required: ["language", "title", "intro", "parts", "bigPicture"],
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
        sources: arr({ type: "object", properties: { file: { type: "integer" }, page: { type: "integer" } }, required: ["file", "page"], additionalProperties: false }),
      },
      required: ["title", "summary", "intuition", "definitions", "theorems", "formulas", "methods", "examples", "tasks", "mistakes", "proofs", "practice", "sources"],
      additionalProperties: false,
    }),
    bigPicture: arr(lead),
  },
  required: ["language", "title", "intro", "parts", "bigPicture"],
  additionalProperties: false,
};

function mathPrompt({ moduleName, count, include, length, focus, context }) {
  const on = Object.entries(MATH_SECTIONS).filter(([k]) => include[k] && k !== "answers" && k !== "bigPicture");
  const off = Object.keys(MATH_SECTIONS).filter((k) => !include[k] && !["answers", "bigPicture", "summary"].includes(k));
  return [
    `Course: ${moduleName || "unknown"}. Write a study guide for a math course from these ${count} file(s), marked F1…F${count}.`,
    context ? `The files belong to: ${context}. Start the title with it, e.g. "Woche 3–4: …" (in the language of the material).` : "",
    MATH_RULES,
    "Structure it into 2–6 parts by topic, like a good tutor. Each part contains:",
    ...on.map(([k, d]) => `- ${k}: ${d}`),
    include.practice ? (include.answers ? "- In practice, 'a' is the full solution." : "- In practice, leave 'a' empty.") : "",
    off.length ? `Leave these arrays empty in every part: ${off.join(", ")}.` : "",
    include.bigPicture ? `- bigPicture: ${MATH_SECTIONS.bigPicture}` : "Leave bigPicture empty.",
    "sources: the file numbers and pages a part is based on.",
    LENGTHS[length] || LENGTHS.normal,
    focus ? `Focus on: ${focus}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function prompt({ moduleName, count, include, length, focus, context }) {
  const on = Object.entries(SECTIONS).filter(([k]) => include[k] && k !== "answers");
  const off = Object.keys(SECTIONS).filter((k) => !include[k] && k !== "answers" && k !== "bigPicture");
  return [
    `Course: ${moduleName || "unknown"}. Write a study guide ("Lernhilfe") from these ${count} file(s), marked F1…F${count}.`,
    context ? `The files belong to: ${context}. Start the title with it, e.g. "Woche 3–4: …" (in the language of the material).` : "",
    "Structure it into 3–7 parts by topic (not by file), like a good tutor would. Each part contains:",
    ...on.filter(([k]) => k !== "bigPicture").map(([k, d]) => `- ${k}: ${d}`),
    include.questions && include.answers ? "- In questions, fill 'a' with a short model answer." : include.questions ? "- In questions, leave 'a' empty." : "",
    off.length ? `Leave these arrays empty in every part: ${off.join(", ")}.` : "",
    include.bigPicture ? `- bigPicture: ${SECTIONS.bigPicture}` : "Leave bigPicture empty.",
    "Use **bold** for key words inside texts. Tables only where they really help.",
    "sources: the file numbers and pages a part is based on.",
    LENGTHS[length] || LENGTHS.normal,
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
const richPlain = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

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
  const L = LABELS[sheet.language] || LABELS.de;
  const M = MATH_LABELS[sheet.language] || MATH_LABELS.de;
  const rich = sheet.math ? richMath : richPlain;
  const fileName = (i) => sheet.files[i - 1]?.name.replace(/\.[a-z0-9]+$/i, "") ?? null;
  const parts = sheet.parts || [];
  const h3 = (key, body) => (body ? `<h3>${L[key]}</h3>${body}` : "");
  // „Definition über R².“ → „Definition über R²:“ (Satzzeichen am Ende vereinheitlichen, Fragen bleiben Fragen)
  const leadText = (l) => {
    const t = String(l ?? "").replace(/\*\*/g, "").trim().replace(/[.:;,]+$/, "");
    return t && !/[?!]$/.test(t) ? `${t}:` : t;
  };
  const leads = (list) => (list?.length ? list.map((x) => `<p><strong>${rich(leadText(x.lead))}</strong> ${rich(x.text)}</p>`).join("") : "");
  const bullets = (list, f = rich) => (list?.length ? `<ul>${list.map((x) => `<li>${f(x)}</li>`).join("")}</ul>` : "");
  const numbered = (list, f) => (list?.length ? `<ol>${list.map((x) => `<li>${f(x)}</li>`).join("")}</ol>` : "");

  const sourcesOf = (p) => {
    const list = (p.sources || []).filter((x) => fileName(x.file)).map((x) => `${esc(fileName(x.file))}${x.page > 0 ? ` ${L.page} ${x.page}` : ""}`);
    return list.length ? `<p class="sources">${L.sources}: ${[...new Set(list)].join(" · ")}</p>` : "";
  };

  // Mathe: Kästen für Definitionen und Sätze, Formeltabelle, Rezepte und Rechenwege
  const mathPartHtml = (p, i) => {
    const h = (key, body) => (body ? `<h3>${M[key]}</h3>${body}` : "");
    const steps = (list) => (list?.length ? `<ol class="steps">${list.map((x) => `<li>${rich(x)}</li>`).join("")}</ol>` : "");
    return `<section class="part" id="p${i}">
      <h2>${rich(p.title)}</h2>
      ${h("summary", leads(p.summary))}
      ${h("intuition", bullets(p.intuition, rich))}
      ${h("definitions", (p.definitions || []).map((d) => `<div class="box def"><div class="box-h">${M.definition} · ${rich(d.name)}</div>${rich(d.text)}</div>`).join(""))}
      ${h("theorems", (p.theorems || []).map((t) => `<div class="box thm"><div class="box-h">${M.theorem} · ${rich(t.name)}</div>${rich(t.statement)}</div>`).join(""))}
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
    const sources = (p.sources || [])
      .filter((s) => fileName(s.file))
      .map((s) => `${esc(fileName(s.file))}${s.page > 0 ? ` ${L.page} ${s.page}` : ""}`);
    return `<section class="part" id="p${i}">
      <h2>${rich(p.title)}</h2>
      ${h3("summary", leads(p.summary))}
      ${h3("beginner", numbered(p.beginner, (x) => `<strong>${rich(x.q)}</strong> ${rich(x.a)}`))}
      ${h3("analogies", bullets(p.analogies, (x) => `<strong>${rich(leadText(x.lead))}</strong> ${rich(x.text)}`))}
      ${h3("examples", numbered(p.examples, rich))}
      ${h3("tables", tables)}
      ${h3("terms", terms)}
      ${h3("mnemonics", bullets(p.mnemonics))}
      ${h3("misconceptions", numbered(p.misconceptions, (m) => `<strong>„${rich(m.myth)}“</strong> ${rich(m.truth)}`))}
      ${h3("anecdotes", bullets(p.anecdotes))}
      ${h3("questions", questions)}
      ${sources.length ? `<p class="sources">${L.sources}: ${[...new Set(sources)].join(" · ")}</p>` : ""}
    </section>`;
  };

  const big = sheet.bigPicture?.length ? `<section class="part" id="big"><h2>${L.bigPicture}</h2>${numbered(sheet.bigPicture, (x) => `<strong>${rich(leadText(x.lead))}</strong> ${rich(x.text)}`)}</section>` : "";
  const date = new Date(sheet.createdAt).toLocaleDateString(sheet.language === "en" ? "en-US" : "de-DE", { day: "numeric", month: "long", year: "numeric" });

  return `<!doctype html><html lang="${sheet.language || "de"}"><head><meta charset="utf-8"><title>${esc(sheet.title)}</title><style>
  @page { size: A4; margin: 18mm 17mm 18mm 17mm; }
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
  dl { margin: 0 0 8px; display: grid; grid-template-columns: max-content 1fr; gap: 3px 14px; }
  dt { font-weight: 650; } dd { margin: 0; }
  .answer { margin-top: 3px; color: #374151; font-size: 9.5pt; } .answer span { font-weight: 650; color: #3a5ba0; }
  .sources { font-size: 8.5pt; color: #6b7280; margin-top: 8px; }
  .part { break-inside: auto; }
  .box { border-left: 3px solid ${accent}; background: #f4f6fa; border-radius: 3px; padding: 7px 11px; margin: 0 0 8px; break-inside: avoid; }
  .box.thm { border-left-color: #3a5ba0; background: #eef3fb; }
  .box-h { font-weight: 650; color: ${accent}; font-size: 9.5pt; margin-bottom: 2px; }
  table.formulas td { border: none; border-bottom: 1px solid #e3e7ee; padding: 6px 7px; vertical-align: middle; }
  td.f-name { font-weight: 650; width: 22%; } td.f-formula { width: 40%; }
  ol.steps { margin: 2px 0 6px; } ol.steps li { margin: 2px 0; }
  .example, .method { break-inside: avoid; margin: 0 0 8px; }
  .result { margin-top: 2px; }
  .wrong { font-weight: 650; color: #b3261e; } .right { font-weight: 650; color: #2f7a46; }
  .katex { font-size: 1.04em; } .katex-display { margin: 6px 0; }
</style>${sheet.math ? `<link rel="stylesheet" href="${pathToFileURL(require.resolve("katex/dist/katex.min.css")).href}">` : ""}</head><body>
  <div class="meta"><span>${esc(moduleName || "")}</span><span>${esc(date)} · ${L.made}</span></div>
  ${parts.length > 1 ? `<nav class="toc"><p>${L.contents}</p><ol>${parts.map((p, i) => `<li><a href="#p${i}">${rich(p.title)}</a></li>`).join("")}${big ? `<li><a href="#big">${L.bigPicture}</a></li>` : ""}</ol></nav>` : ""}
  <h1>${rich(sheet.title)}</h1>
  <p class="intro">${rich(sheet.intro)}</p>
  ${parts.map(partHtml).join("")}
  ${big}
</body></html>`;
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

/** HTML → PDF mit einem unsichtbaren Fenster. */
async function renderPdf(BrowserWindow, sheet, { moduleName, accent, outFile }) {
  const html = sheetHtml(upgrade(sheet), { moduleName, accent }).replace(/<p><strong><\/strong> /g, "<p>");
  const tmp = path.join(os.tmpdir(), `studi-sheet-${sheet.id}.html`);
  fs.writeFileSync(tmp, html);
  const win = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { javascript: false, sandbox: true } });
  try {
    await win.loadFile(tmp);
    const pdf = await win.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="width:100%;font:7.5pt -apple-system,Helvetica,sans-serif;color:#9ca3af;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
    });
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, pdf);
    return outFile;
  } finally {
    win.destroy();
    fs.rmSync(tmp, { force: true });
  }
}

module.exports = { SECTIONS, SCHEMA, MATH_SECTIONS, MATH_SCHEMA, MATH_RULES, cleanInclude, prompt, mathPrompt, sheetHtml, renderPdf, upgrade, richMath };
