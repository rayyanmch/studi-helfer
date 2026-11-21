// Visuelles für Lernzettel: Diagramme (Mermaid), Funktionsgraphen und Punkte (eigener Plotter, keine geschätzten
// Koordinaten), Abbildungen von Folienseiten (pdf.js rendert die Seite im Druckfenster) und Merkkästen.
// Dazu Leitlinien je Fachrichtung, damit die KI passende Visualisierungen wählt.

const path = require("node:path");
const { pathToFileURL } = require("node:url");

const str = { type: "string" };
const num = { type: "number" };
const arr = (items) => ({ type: "array", items });
const obj = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });

/** Ein Visual: genau einer der Typen ist gefüllt, die anderen Felder bleiben leer bzw. 0. */
const VISUAL = obj({
  type: { type: "string", enum: ["diagram", "plot", "figure"] },
  title: str,
  caption: { type: "string", description: "One sentence: what to see / why it matters" },
  mermaid: { type: "string", description: "For type diagram: valid Mermaid code (flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, mindmap, timeline, quadrantChart, pie, xychart-beta). Otherwise empty." },
  plot: obj({
    functions: arr(obj({ expr: { type: "string", description: "In x, e.g. 'x^2 - 1', 'sin(x)', 'exp(-x)', 'sqrt(x)'. Operators + - * / ^, functions sin cos tan exp ln log sqrt abs, constants pi e" }, label: str })),
    points: arr(obj({ x: num, y: num, label: str })),
    xmin: num,
    xmax: num,
    ymin: num,
    ymax: num,
    xlabel: str,
    ylabel: str,
  }),
  figure: obj({ file: { type: "integer", description: "For type figure: file number (F1 → 1), else 0" }, page: { type: "integer", description: "For type figure: page number, else 0" } }),
});

const CALLOUT = obj({
  kind: { type: "string", enum: ["remember", "tip", "warning", "code"] },
  text: { type: "string", description: "remember: the one thing to keep; tip: exam tip from the material; warning: a trap; code: a short code snippet" },
});

/** Leitlinien je Fachrichtung: welche Visualisierungen und Bausteine passen. */
const SUBJECTS = {
  business: "Business & economics: show processes as flowcharts (e.g. order processing), frameworks and models as diagrams (Porter's Five Forces, St. Galler Modell, 4P as mindmap), positioning as quadrantChart, shares as pie, calculations as formula plus worked example. Prefer tables for comparisons.",
  math: "Math & statistics: use plots for functions, curves, sequences and distributions (plot with functions/points), points in the plane (e.g. complex numbers as points), flowcharts for proof or solution strategies. Every formula in LaTeX.",
  cs: "Computer science: UML class diagrams (classDiagram), sequence diagrams, state machines (stateDiagram-v2), flowcharts for algorithms and processes, architecture as flowchart with subgraphs. Short code snippets as 'code' callouts. Step tables for algorithms.",
  law: "Law: the Prüfungsschema as a numbered flowchart (Anspruchsgrundlage → Voraussetzungen → Rechtsfolge), Anspruchsgrundlagen and definitions exact, short cases as examples, typical problems as warnings.",
  science: "Natural sciences & medicine: processes and cycles as flowcharts, relationships as plots (with units in the axis labels), structures as mindmaps, formulas with units, typical calculation as worked example.",
  humanities: "Humanities & social sciences: timelines (timeline) for developments, mindmaps for concepts and schools of thought, comparison tables for theories and authors, short key quotes only if they are in the material.",
};

const SUBJECT_LABELS = { business: "Business", math: "Math", cs: "Computer science", law: "Law", science: "Sciences", humanities: "Humanities" };

/** Anweisung für Visuals und Merkkästen (an beide Lernzettel-Anweisungen angehängt). */
function visualPrompt({ subject, figures, candidates }) {
  const parts = [
    "VISUALS: in each part add 1–3 visuals where they really help understanding (a process, a structure, a relationship, a model, a curve), and skip them where they don't.",
    SUBJECTS[subject] || "",
    "Diagram rules: valid Mermaid only, short node labels (max ~6 words, no quotes or brackets inside labels unless quoted), max ~14 nodes, no styling/classDef, labels in the language of the material. Chains of more than 4 steps go top-down (flowchart TD); left-right only for up to 4 nodes.",
    "NOTATION (students learn exam notation from these diagrams, so it must be exactly right or the diagram must be left out):",
    "- Draw only what the material shows, in the course's notation. If Mermaid can't express the notation correctly, skip the diagram and use the slide as a figure instead.",
    "- Never draw EPK/EPC or BPMN with Mermaid (wrong shapes for events, functions and connectors): use the slide page as a figure or a table of the elements.",
    "- UML class diagrams: multiplicities at the association ends in Mermaid syntax (A \"1\" --> \"*\" B : label), never words like '1 to many'; aggregation o--, composition *--, inheritance <|--, realization <|.., dependency ..>; design patterns with all participants, relations and overridden methods as on the slides.",
    "- UML sequence diagrams: every synchronous call ->> has its own return -->> right after the callee's work; use activate/deactivate for activation bars; asynchronous calls -) ; object names like 'obj:Class'.",
    "- Layer models (e.g. a process map with management, core and support processes): flowchart with one subgraph per layer and no arrows between layers unless the material has them.",
    "- Linear processes are fine as a chain; the app lays out chains compactly.",
    "Plot rules: functions as expressions in x with a sensible window; points only with exact coordinates. SEQUENCES are plotted ONLY as points (n, a_n) for the integer indices starting at the first index of the material, never as a function curve; show the limit as a constant function (label 'a = …'), an ε-band as two constants a±ε, and mark N(ε) as a labelled point. Axis labels in plain text (a_n is fine).",
    figures
      ? `FIGURES: you may include slide pages as figures (type figure, file + page) when a page shows a diagram, model or graphic that the text refers to (max 1 per part). ${candidates ? `Pages with little text (likely graphics): ${candidates}.` : ""}`
      : "Do not use type figure.",
    "Never write about the material itself (no 'nicht Gegenstand des Materials', no 'siehe Folie 31'); just teach the content.",
    "CALLOUTS: 1–3 per part: 'remember' for the one key takeaway, 'tip' only for exam tips stated in the material, 'warning' for typical traps, 'code' for short code (real line breaks, max 12 lines, first line a comment naming what it shows, in the part about that topic).",
  ];
  return parts.filter(Boolean).join("\n");
}

// ------------------------------------------------------------------ Funktionsplotter (ohne eval)

/** Ausdruck in x → Funktion; null bei Unsinn. Unterstützt + - * / ^, Klammern, sin cos tan exp ln log sqrt abs, pi, e. */
function compile(expr) {
  const src = String(expr || "")
    .replace(/\s+/g, "")
    .replace(/\*\*/g, "^")
    .replace(/·|×/g, "*")
    .replace(/−/g, "-");
  if (!src || src.length > 200) return null;
  let i = 0;
  const peek = () => src[i];
  const fns = { sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, ln: Math.log, log: Math.log10, sqrt: Math.sqrt, abs: Math.abs };
  // Grammatik: expr = term (('+'|'-') term)* ; term = factor (('*'|'/'|implizit) factor)* ; factor = unary ('^' factor)? ; unary = '-' unary | atom
  function expr_() {
    let f = term();
    while (peek() === "+" || peek() === "-") {
      const op = src[i++];
      const a = f;
      const b = term();
      f = op === "+" ? (x) => a(x) + b(x) : (x) => a(x) - b(x);
    }
    return f;
  }
  function term() {
    let f = factor();
    for (;;) {
      const c = peek();
      if (c === "*" || c === "/") {
        i++;
        const a = f;
        const b = factor();
        f = c === "*" ? (x) => a(x) * b(x) : (x) => a(x) / b(x);
      } else if (c && /[a-z0-9(.]/i.test(c)) {
        const a = f; // implizite Multiplikation: 2x, 3(x+1), x sin(x)
        const b = factor();
        f = (x) => a(x) * b(x);
      } else return f;
    }
  }
  function factor() {
    const base = unary();
    if (peek() === "^") {
      i++;
      const ex = factor();
      return (x) => Math.pow(base(x), ex(x));
    }
    return base;
  }
  function unary() {
    if (peek() === "-") {
      i++;
      const a = unary();
      return (x) => -a(x);
    }
    if (peek() === "+") {
      i++;
      return unary();
    }
    return atom();
  }
  function atom() {
    const c = peek();
    if (c === "(") {
      i++;
      const f = expr_();
      if (src[i++] !== ")") throw new Error("paren");
      return f;
    }
    const n = src.slice(i).match(/^\d+(\.\d+)?|^\.\d+/);
    if (n) {
      i += n[0].length;
      const v = Number(n[0]);
      return () => v;
    }
    const w = src.slice(i).match(/^[a-z]+/i);
    if (w) {
      const name = w[0].toLowerCase();
      i += w[0].length;
      if (name === "x") return (x) => x;
      if (name === "pi") return () => Math.PI;
      if (name === "e") return () => Math.E;
      if (fns[name]) {
        const arg = atom();
        return (x) => fns[name](arg(x));
      }
    }
    throw new Error(`unexpected ${c}`);
  }
  try {
    const f = expr_();
    if (i !== src.length) return null;
    f(1);
    return f;
  } catch {
    return null;
  }
}

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Beschriftung im Graphen ohne LaTeX-Reste: „$a_n$“ → „aₙ“, „x^2“ → „x²“, „\\varepsilon“ → „ε“. */
function plain(t) {
  const sub = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉", n: "ₙ", k: "ₖ", i: "ᵢ", "+": "₊", "-": "₋" };
  const sup = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", n: "ⁿ", "-": "⁻", "+": "⁺" };
  return String(t ?? "")
    .replace(/\$/g, "")
    .replace(/\\(varepsilon|epsilon)/g, "ε")
    .replace(/\\infty/g, "∞")
    .replace(/\\sqrt\{?([^}\s]+)\}?/g, "√$1")
    .replace(/\\pi/g, "π")
    .replace(/\\(left|right|,|;)/g, "")
    .replace(/_\{([^}]+)\}|_(\d+|[a-z])/gi, (_, a, b) => [...(a ?? b)].map((c) => sub[c] ?? c).join(""))
    .replace(/\^\{([^}]+)\}|\^(\d+|-?[a-z])/gi, (_, a, b) => [...(a ?? b)].map((c) => sup[c] ?? c).join(""))
    .replace(/\\[a-z]+/gi, "");
}

/** SVG eines Graphen: Gitter, Achsen, Funktionen (300 Stützstellen, Sprünge werden getrennt), Punkte mit Beschriftung. */
function plotSvg(plot, accent) {
  const fns = (plot.functions || []).map((f) => ({ ...f, fn: compile(f.expr) })).filter((f) => f.fn);
  const pts = (plot.points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!fns.length && !pts.length) return "";
  let { xmin, xmax, ymin, ymax } = plot;
  if (!(xmax > xmin)) [xmin, xmax] = [-5, 5];
  if (!(ymax > ymin)) {
    const ys = [...pts.map((p) => p.y)];
    for (const f of fns) for (let k = 0; k <= 60; k++) ys.push(f.fn(xmin + ((xmax - xmin) * k) / 60));
    const finite = ys.filter(Number.isFinite);
    ymin = Math.min(...finite, 0);
    ymax = Math.max(...finite, 1);
    const pad = (ymax - ymin) * 0.1 || 1;
    ymin -= pad;
    ymax += pad;
  }
  const W = 560, H = 300, L = 40, R = 14, T = 12, B = 30;
  const sx = (x) => L + ((x - xmin) / (xmax - xmin)) * (W - L - R);
  const sy = (y) => T + (1 - (y - ymin) / (ymax - ymin)) * (H - T - B);
  const tick = (a, b) => {
    const span = b - a;
    const step = Math.pow(10, Math.floor(Math.log10(span / 6)));
    const m = span / step > 30 ? 5 : span / step > 12 ? 2 : 1;
    return step * m;
  };
  // Folgen (nur Punkte mit ganzzahligem x, keine Funktion in x): ganzzahlige Achse
  const sequence = pts.length > 0 && pts.every((p) => Number.isInteger(p.x)) && fns.every((f) => !/x/i.test(f.expr.replace(/exp/gi, "")));
  const tx = sequence ? Math.max(1, Math.round(tick(xmin, xmax))) : tick(xmin, xmax),
    ty = tick(ymin, ymax);
  const lines = [];
  for (let x = Math.ceil(xmin / tx) * tx; x <= xmax + 1e-9; x += tx) {
    lines.push(`<line x1="${sx(x)}" y1="${T}" x2="${sx(x)}" y2="${H - B}" class="g"/><text x="${sx(x)}" y="${H - B + 14}" class="t" text-anchor="middle">${+x.toFixed(4)}</text>`);
  }
  for (let y = Math.ceil(ymin / ty) * ty; y <= ymax + 1e-9; y += ty) {
    lines.push(`<line x1="${L}" y1="${sy(y)}" x2="${W - R}" y2="${sy(y)}" class="g"/><text x="${L - 5}" y="${sy(y) + 3}" class="t" text-anchor="end">${+y.toFixed(4)}</text>`);
  }
  const axes = [];
  if (ymin < 0 && ymax > 0) axes.push(`<line x1="${L}" y1="${sy(0)}" x2="${W - R}" y2="${sy(0)}" class="a"/>`);
  if (xmin < 0 && xmax > 0) axes.push(`<line x1="${sx(0)}" y1="${T}" x2="${sx(0)}" y2="${H - B}" class="a"/>`);
  const colors = [accent, "#c2562c", "#2f7a46", "#8a4f9e"];
  const curves = fns.map((f, n) => {
    let d = "";
    let pen = false;
    for (let k = 0; k <= 300; k++) {
      const x = xmin + ((xmax - xmin) * k) / 300;
      const y = f.fn(x);
      if (!Number.isFinite(y) || y < ymin - (ymax - ymin) || y > ymax + (ymax - ymin)) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`;
      pen = true;
    }
    return `<path d="${d}" fill="none" stroke="${colors[n % 4]}" stroke-width="2"/>`;
  });
  const legend = fns
    .map((f, n) => `<text x="${W - R - 4}" y="${T + 12 + n * 14}" text-anchor="end" class="l" fill="${colors[n % 4]}">${esc(plain(f.label || f.expr))}</text>`)
    .join("");
  const dots = pts
    .map((p) => `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="3.5" fill="${accent}"/>${p.label ? `<text x="${sx(p.x) + 6}" y="${sy(p.y) - 6}" class="l">${esc(plain(p.label))}</text>` : ""}`)
    .join("");
  const labels = `${plot.xlabel ? `<text x="${W - R}" y="${H - 4}" text-anchor="end" class="t">${esc(plain(plot.xlabel))}</text>` : ""}${plot.ylabel ? `<text x="${L + 4}" y="${T + 10}" class="t">${esc(plain(plot.ylabel))}</text>` : ""}`;
  return `<svg viewBox="0 0 ${W} ${H}" class="plot" xmlns="http://www.w3.org/2000/svg"><style>.g{stroke:#e3e7ee;stroke-width:1}.a{stroke:#6b7280;stroke-width:1.2}.t{font:9px -apple-system,Helvetica,sans-serif;fill:#6b7280}.l{font:600 10px -apple-system,Helvetica,sans-serif;fill:#1d1d1f}</style>${lines.join("")}${axes.join("")}${curves.join("")}${dots}${legend}${labels}</svg>`;
}

/** Einfache Kette A --> B --> C … (ohne Verzweigung, ohne Subgraphen) → Beschriftungen in Reihenfolge, sonst null. */
function linearChain(code) {
  const lines = String(code).trim().split(/\n|;/).map((l) => l.trim()).filter(Boolean);
  if (!/^(flowchart|graph)\b/i.test(lines[0] || "") || lines.some((l) => /^(subgraph|end\b|classDef|style|click)/i.test(l))) return null;
  const label = new Map();
  const edges = [];
  const node = (raw) => {
    const m = raw.trim().match(/^([A-Za-z0-9_]+)\s*(?:\[\(?\[?([^\]]*?)\]?\)?\]|\(\(?([^)]*?)\)?\)|\{([^}]*)\}|>([^\]]*)\])?$/);
    if (!m) return null;
    const text = (m[2] ?? m[3] ?? m[4] ?? m[5] ?? "").replace(/^"|"$/g, "").trim();
    if (text) label.set(m[1], text);
    return m[1];
  };
  for (const l of lines.slice(1)) {
    const parts = l.split(/\s*(?:-->|---|==>|-\.->)(?:\|[^|]*\|)?\s*/);
    if (parts.length < 2) {
      if (!node(l)) return null;
      continue;
    }
    const ids = parts.map(node);
    if (ids.some((x) => !x)) return null;
    for (let k = 0; k < ids.length - 1; k++) edges.push([ids[k], ids[k + 1]]);
  }
  if (edges.length < 4) return null;
  const out = new Map(), into = new Map();
  for (const [a, b] of edges) {
    if (out.has(a) || into.has(b)) return null; // Verzweigung oder Zusammenführung
    out.set(a, b);
    into.set(b, a);
  }
  let start = edges[0][0];
  while (into.has(start)) {
    start = into.get(start);
    if (start === edges[0][0]) return null; // Kreis
  }
  const order = [start];
  while (out.has(order[order.length - 1]) && order.length < 30) order.push(out.get(order[order.length - 1]));
  if (order.length !== edges.length + 1) return null;
  return order.map((id) => label.get(id) || id);
}

/** HTML eines Visuals; rich = Text mit **fett** (und ggf. Formeln). files = Dateien des Lernzettels (für Abbildungen). */
function visualHtml(v, { rich, files, accent, labels }) {
  const cap = `${v.title ? `<strong>${rich(v.title)}</strong>` : ""}${v.title && v.caption ? ": " : ""}${v.caption ? rich(v.caption) : ""}`;
  if (v.type === "diagram" && v.mermaid?.trim()) {
    const chain = linearChain(v.mermaid);
    if (chain) {
      const steps = chain.map((t, k) => `<span class="step"><span class="n">${k + 1}</span>${esc(t)}</span>`).join(`<span class="arrow">→</span>`);
      return `<figure class="visual"><div class="chain">${steps}</div>${cap ? `<figcaption>${cap}</figcaption>` : ""}</figure>`;
    }
    // Lange Ketten von links nach rechts werden im PDF winzig: ab 5 Pfeilen von oben nach unten
    // Formeln in Knotenbeschriftungen lesbar machen („Folge a_n“ → „Folge aₙ“), Knoten-Ids bleiben unberührt
    let code = v.mermaid.trim().replace(/(\[|\(|\{|\|)([^\]\)\}\|\n]*?[_^\\$][^\]\)\}\|\n]*?)(\]|\)|\}|\|)/g, (m, a, t, b) => `${a}${plain(t)}${b}`);
    if (/^(flowchart|graph)\s+(LR|RL)\b/i.test(code) && (code.match(/-->|---|==>|-\.->/g) || []).length >= 5) code = code.replace(/^(flowchart|graph)\s+(LR|RL)\b/i, "$1 TD");
    return `<figure class="visual"><pre class="mermaid">${esc(code)}</pre>${cap ? `<figcaption>${cap}</figcaption>` : ""}</figure>`;
  }
  if (v.type === "plot") {
    const svg = plotSvg(v.plot || {}, accent);
    return svg ? `<figure class="visual">${svg}${cap ? `<figcaption>${cap}</figcaption>` : ""}</figure>` : "";
  }
  if (v.type === "figure" && v.figure?.file > 0 && v.figure?.page > 0) {
    const f = files[v.figure.file - 1];
    if (!f || !/\.pdf$/i.test(f.path)) return "";
    const src = `${labels.source}: ${esc(f.name.replace(/\.[a-z0-9]+$/i, ""))}, PDF ${labels.page} ${v.figure.page}`;
    return `<figure class="visual slide"><canvas data-pdf="${esc(pathToFileURL(f.path).href)}" data-page="${v.figure.page}"></canvas><figcaption>${cap}${cap ? " · " : ""}<span class="src">${src}</span></figcaption></figure>`;
  }
  return "";
}

const CALLOUT_LABELS = {
  de: { remember: "Merke", tip: "Klausurtipp", warning: "Achtung", code: "Code" },
  en: { remember: "Remember", tip: "Exam tip", warning: "Watch out", code: "Code" },
};

function calloutHtml(c, { rich, language }) {
  const L = CALLOUT_LABELS[language] || CALLOUT_LABELS.de;
  if (c.kind === "code") return `<div class="callout code"><div class="c-h">${L.code}</div><pre>${esc(c.text)}</pre></div>`;
  return `<div class="callout ${c.kind}"><div class="c-h">${L[c.kind] || ""}</div>${rich(c.text)}</div>`;
}

const VISUAL_CSS = `
  figure.visual { margin: 8px 0 12px; break-inside: avoid; text-align: center; }
  figure.visual pre.mermaid { margin: 0 auto; background: none; font-family: inherit; white-space: pre; }
  figure.visual > svg, figure.visual pre.mermaid > svg { max-width: 100%; height: auto; max-height: 125mm; }
  .chain { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 6px 4px; margin: 2px 0; }
  .chain .step { display: inline-flex; align-items: center; gap: 6px; background: #eef3fb; border: 1px solid #b9c7e2; border-radius: 6px; padding: 4px 9px; font-size: 9.5pt; }
  .chain .n { font-weight: 700; color: #3a5ba0; font-size: 8.5pt; }
  .chain .arrow { color: #22325c; font-size: 11pt; }
  figure.visual svg.plot { width: 92%; }
  figure.slide canvas, figure.slide img { max-width: 88%; border: 1px solid #dde3ee; border-radius: 4px; }
  figcaption { font-size: 9pt; color: #4b5563; margin-top: 4px; text-align: center; }
  figcaption .src { color: #9ca3af; }
  .callout { border-radius: 6px; padding: 7px 11px; margin: 6px 0 10px; break-inside: avoid; }
  .callout .c-h { font-size: 8.5pt; font-weight: 700; text-transform: none; margin-bottom: 2px; }
  .callout.remember { background: #eef3fb; } .callout.remember .c-h { color: #22325c; }
  .callout.tip { background: #edf7f0; } .callout.tip .c-h { color: #2f7a46; }
  .callout.warning { background: #fdf0ec; } .callout.warning .c-h { color: #b3261e; }
  .callout.code { background: #f4f5f7; } .callout.code pre { margin: 0; font: 9pt/1.45 ui-monospace, Menlo, monospace; white-space: pre-wrap; }
`;

/** Skript im Druckfenster: Mermaid-Diagramme setzen (fehlerhafte entfernen), Folienseiten mit pdf.js rendern, dann window.__ready. */
function pageScript() {
  const vendor = path.join(__dirname, "vendor");
  const mermaidUrl = pathToFileURL(path.join(vendor, "mermaid.min.js")).href;
  const pdfUrl = pathToFileURL(path.join(vendor, "pdf.min.mjs")).href;
  const workerUrl = pathToFileURL(path.join(vendor, "pdf.worker.min.mjs")).href;
  return `<script src="${mermaidUrl}"></script>
<script type="module">
  const done = () => { window.__ready = true; };
  try {
    if (window.mermaid && document.querySelector("pre.mermaid")) {
      const config = (flowchart) => ({ startOnLoad: false, securityLevel: "strict", theme: "base", fontFamily: "-apple-system, Helvetica, Arial, sans-serif",
        flowchart, sequence: { useMaxWidth: true, mirrorActors: false, showSequenceNumbers: false }, class: { useMaxWidth: true },
        themeCSS: ".actor-line { stroke-dasharray: 4 3; }",
        themeVariables: { primaryColor: "#eef3fb", primaryBorderColor: "#3a5ba0", primaryTextColor: "#1d1d1f", lineColor: "#22325c", secondaryColor: "#f4f6fa", tertiaryColor: "#fbfcfe", fontSize: "13px" } });
      mermaid.initialize(config({ nodeSpacing: 26, rankSpacing: 22, padding: 8, useMaxWidth: true }));
      for (const el of document.querySelectorAll("pre.mermaid")) {
        try { await mermaid.parse(el.textContent); } catch { el.closest("figure")?.remove(); }
      }
      // Klassendiagramme brauchen längere Kanten, sonst finden Multiplizitäten keinen Platz („Could not find a suitable point“)
      const all = [...document.querySelectorAll("pre.mermaid")];
      const isClass = (el) => /^\s*classDiagram/.test(el.textContent);
      const rest = all.filter((el) => !isClass(el));
      const classes = all.filter(isClass);
      if (rest.length) await mermaid.run({ nodes: rest, suppressErrors: true });
      if (classes.length) {
        mermaid.initialize(config({ nodeSpacing: 40, rankSpacing: 50, padding: 8, useMaxWidth: true }));
        await mermaid.run({ nodes: classes, suppressErrors: true });
      }
      // Fehlerbild („Syntax error in text“) nie drucken: Abbildung entfernen
      for (const el of document.querySelectorAll("pre.mermaid")) {
        const svg = el.querySelector("svg");
        if (!svg || svg.getAttribute("aria-roledescription") === "error" || /Syntax error in text/.test(svg.textContent || "")) el.closest("figure")?.remove();
      }
    }
  } catch (e) { console.error(e); }
  try {
    const canvases = [...document.querySelectorAll("canvas[data-pdf]")];
    if (canvases.length) {
      const pdfjs = await import(${JSON.stringify(pdfUrl)});
      pdfjs.GlobalWorkerOptions.workerSrc = ${JSON.stringify(workerUrl)};
      const docs = new Map();
      for (const c of canvases) {
        try {
          if (!docs.has(c.dataset.pdf)) docs.set(c.dataset.pdf, await pdfjs.getDocument(c.dataset.pdf).promise);
          const doc = docs.get(c.dataset.pdf);
          const page = await doc.getPage(Number(c.dataset.page));
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: 1400 / base.width });
          c.width = vp.width; c.height = vp.height;
          await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
          const img = new Image(); img.src = c.toDataURL("image/jpeg", 0.85); c.replaceWith(img);
          await img.decode();
        } catch (e) { console.error(e); c.closest("figure")?.remove(); }
      }
    }
  } catch (e) { console.error(e); }
  done();
</script>`;
}

module.exports = { VISUAL, CALLOUT, SUBJECTS, SUBJECT_LABELS, visualPrompt, plotSvg, visualHtml, calloutHtml, VISUAL_CSS, pageScript, compile };
