// Lernbereich „Study“: Zusammenfassung pro Datei, Lernzettel, Karteikarten (Leitner), Anki-Export.
//
// KI-Anbieter für die Demo: das lokal installierte Claude Code (`claude -p`) mit dem Abo des Nutzers.
// Nur für die eigene Nutzung auf dem eigenen Mac gedacht; für eine App für alle Studis kommt ein
// eigener Server mit API-Key (gleiche Anweisungen und Antwortformen, siehe NOTIZEN „KI-Lernbereich“).
//
// Ablauf: Python-Helfer liest den Text (`file-text`, mit Seitenmarken) → Claude antwortet im festen
// JSON-Format (--json-schema) → Ergebnis pro Datei-Inhalt (SHA-256) in <App-Daten>/study/ gespeichert.
// Jede Datei wird also nur einmal ausgewertet, auch nach Umbenennen oder Verschieben.

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, execFile } = require("node:child_process");
const backend = require("./backend");
const sheetLib = require("./study-sheet");

const DIR = path.join(backend.DATA_DIR, "study");
const ANALYSES = path.join(DIR, "analyses.json"); // { [hash]: Analysis }
const HASHES = path.join(DIR, "hashes.json"); // { [path]: { size, mtime, hash } }
const SHEETS = path.join(DIR, "sheets.json"); // { sheets: Sheet[] }
const CARDS = path.join(DIR, "cards.json"); // { [cardId]: { box, due, reviews, suspended? } }
const UNREADABLE = path.join(DIR, "unreadable.json"); // { [hash]: { name, at } } Dateien ohne Text (Scans, Handschrift)
const LOG = path.join(DIR, "log.json");
const GLOSSARY = path.join(DIR, "glossary.json"); // { [moduleId]: { custom: Entry[], edits: { [autoKey]: { term?, definition?, hidden? } } } }
const WEEK_TITLES = path.join(DIR, "week-titles.json"); // { [moduleId]: { sig, titles: { [weekKey]: Titel } } }
const TITLE_MODEL = process.env.STUDI_TITLE_MODEL || "haiku"; // kleine Aufgabe → kleines Modell // { days: { "YYYY-MM-DD": Anzahl Abfragen } }

const MODEL = process.env.STUDI_STUDY_MODEL || "sonnet";
const PARALLEL = 2; // gleichzeitige Auswertungen (Abo-Limits schonen)
const FILE_CHARS = 150_000; // ≈ 40k Tokens pro Datei
const SHEET_CHARS = 220_000; // Lernzettel: darüber nur die gespeicherten Auswertungen statt Volltext
const LEITNER_DAYS = [0, 0, 1, 3, 7, 14]; // Fach 1–5 → Tage bis zur nächsten Abfrage (Fach 1 = heute nochmal)
const SUPPORTED = /\.(pdf|txt|md|tex)$/i;

// ------------------------------------------------------------------ kleine Helfer

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

const fail = (code, message) => ({ ok: false, code, message });

function today(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function allowedPath(p) {
  return typeof p === "string" && SUPPORTED.test(p) && backend.insideTarget(p) && fs.existsSync(p);
}

/** Wie hashOf, liest aber asynchron (blockiert das Fenster nicht, wenn beim ersten Start viele PDFs neu sind). */
async function hashOfAsync(p, hashes) {
  const st = await fs.promises.stat(p);
  const known = hashes[p];
  if (known && known.size === st.size && known.mtime === st.mtimeMs) return known.hash;
  const hash = crypto.createHash("sha256").update(await fs.promises.readFile(p)).digest("hex");
  hashes[p] = { size: st.size, mtime: st.mtimeMs, hash };
  return hash;
}

/** Inhalts-Hash, zwischengespeichert nach Größe + Änderungszeit. */
function hashOf(p, hashes) {
  const st = fs.statSync(p);
  const known = hashes[p];
  if (known && known.size === st.size && known.mtime === st.mtimeMs) return known.hash;
  const hash = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  hashes[p] = { size: st.size, mtime: st.mtimeMs, hash };
  return hash;
}

// ------------------------------------------------------------------ Claude Code finden und aufrufen

let claudeBin; // undefined = noch nicht gesucht, null = nicht gefunden

function findClaude() {
  if (claudeBin !== undefined) return Promise.resolve(claudeBin);
  const home = os.homedir();
  const candidates = [
    process.env.STUDI_CLAUDE,
    path.join(home, ".local", "bin", "claude"),
    path.join(home, ".claude", "local", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      fs.accessSync(c, fs.constants.X_OK);
      claudeBin = c;
      return Promise.resolve(c);
    } catch {
      // weiter suchen
    }
  }
  // Apps aus dem Finder kennen den PATH der Shell nicht: einmal die Login-Shell fragen
  return new Promise((resolve) => {
    execFile("/bin/zsh", ["-lc", "command -v claude"], { timeout: 5000 }, (err, out) => {
      const found = !err && out.trim().startsWith("/") ? out.trim() : null;
      claudeBin = found;
      resolve(found);
    });
  });
}

/** Umgebung für Claude Code: Abo statt API-Key, keine Spuren einer umgebenden Claude-Sitzung. */
function claudeEnv(bin) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k === "ANTHROPIC_API_KEY" || k === "ANTHROPIC_AUTH_TOKEN" || k === "CLAUDECODE" || k.startsWith("CLAUDE_CODE_")) continue;
    if (k.startsWith("ELECTRON_")) continue;
    env[k] = v;
  }
  env.PATH = [path.dirname(bin), "/usr/bin", "/bin", "/usr/sbin", "/sbin", env.PATH].filter(Boolean).join(":");
  return env;
}

const running = new Set(); // laufende claude-Prozesse (für Abbrechen)

/**
 * Ein Aufruf mit festem Antwortformat. Liefert { ok: true, data } oder Fail.
 * Ohne Werkzeuge, ohne Projekt-Einstellungen/Hooks (--safe-mode), in einem leeren Ordner.
 */
async function askClaude({ system, prompt, input, schema, timeoutMs = 240_000, model = MODEL }) {
  const bin = await findClaude();
  if (!bin) return fail("no_ai", "Claude Code isn't installed on this Mac. Study tools need it for now.");
  const cwd = path.join(os.tmpdir(), "studi-helfer-claude");
  fs.mkdirSync(cwd, { recursive: true });
  const args = [
    "-p", prompt,
    "--model", model,
    "--safe-mode",
    "--tools", "",
    "--no-session-persistence",
    "--output-format", "json",
    "--json-schema", JSON.stringify(schema),
    "--system-prompt", system,
  ];
  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd, env: claudeEnv(bin), stdio: ["pipe", "pipe", "pipe"] });
    running.add(child);
    let out = "";
    let err = "";
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      running.delete(child);
      console.error("[study] claude start failed:", e.message);
      resolve(fail("no_ai", "Claude Code could not be started."));
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      running.delete(child);
      if (signal && !killed) return resolve(fail("cancelled", "Stopped."));
      if (killed) return resolve(fail("timeout", "Claude took too long. Please try again."));
      let res;
      try {
        res = JSON.parse(out.trim().split("\n").filter((l) => l.startsWith("{")).pop() || "");
      } catch {
        console.error(`[study] claude exited (${code}):`, (err || out).trim().slice(-500));
        return resolve(classify(`${err}\n${out}`));
      }
      if (res.is_error || res.subtype !== "success" || !res.structured_output) {
        console.error("[study] claude error:", res.subtype, res.api_error_status, String(res.result || "").slice(0, 300));
        return resolve(classify(`${res.result || ""} ${res.api_error_status || ""}`));
      }
      resolve({ ok: true, data: res.structured_output, usage: res.usage, costUsd: res.total_cost_usd });
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}

function classify(text) {
  const t = String(text).toLowerCase();
  if (/(rate|usage) ?limit|429|overloaded|529|limit reached|hit your limit/.test(t)) {
    return fail("rate_limited", "Claude is busy or your usage limit is reached. Please try again later.");
  }
  if (/log ?in|logged out|authenticat|401|oauth|credentials/.test(t)) {
    return fail("no_ai", "Claude Code isn't signed in. Open Terminal, run “claude” once and sign in.");
  }
  return fail("ai_error", "Claude couldn't finish this. Please try again.");
}

// ------------------------------------------------------------------ Anweisungen und Antwortformen

const SYSTEM = [
  "You turn university course materials into study aids for one student.",
  "Write in the language of the material (German material → German output), because the exam is in that language.",
  "Use only what the material says; never invent facts, numbers or dates. Keep formulas and definitions exact.",
  "Page numbers refer to the '--- Page N ---' markers in the material; use 0 if unsure.",
  "Skip organisational details (rooms, dates, registration) unless the file is only about organisation.",
].join(" ");

const page = { type: "integer", description: "Page number from the markers, 0 if unknown" };
const obj = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const list = (items, description) => ({ type: "array", items, description });

const FILE_SCHEMA = obj({
  summary: { type: "string", description: "3–5 sentences: what this file is about and what matters most" },
  keyPoints: list(obj({ text: { type: "string" }, page }), "5–10 short points a student must know"),
  topics: list({ type: "string" }, "2–6 short topic names"),
  terms: list(obj({ term: { type: "string" }, definition: { type: "string" }, page }), "Up to 12 key terms with a one-sentence definition"),
  formulas: list(
    obj({ name: { type: "string" }, formula: { type: "string" }, meaning: { type: "string" }, page }),
    "Formulas from this file (for the course's formula collection): name, the formula, what the symbols mean; empty if the file has none",
  ),
  cards: list(
    obj({
      q: { type: "string" },
      a: { type: "string" },
      page,
      type: { type: "string", enum: ["concept", "definition", "theorem", "formula", "strategy", "compute", "truefalse", "proof"] },
      steps: list({ type: "string" }, "Only for compute/strategy/proof: 2–5 short steps; otherwise empty"),
    }),
    "6–12 flashcards that test understanding: a clear question, a short exact answer",
  ),
});

/** Übungsblätter und Klausuren: Lernhilfe statt Zusammenfassung (Aufgaben müssen gemacht werden, nicht gelesen). */
const HELP_SCHEMA = {
  ...FILE_SCHEMA,
  properties: {
    ...FILE_SCHEMA.properties,
    tasks: list(
      obj({
        label: { type: "string", description: "e.g. 'Aufgabe 1' or 'Task 2b'" },
        topic: { type: "string", description: "What the task is about, 2–6 words" },
        method: { type: "string", description: "Which method or approach to use" },
        hint: { type: "string", description: "A nudge for getting started, never the full solution" },
        lookup: { type: "string", description: "Where to read up, e.g. '05_KomplexeZahlen, S. 12' from the course context, or empty" },
        page,
      }),
      "One entry per task on the sheet, in order",
    ),
  },
  required: [...FILE_SCHEMA.required, "tasks"],
};

const HELP_PROMPT = [
  "This file is an exercise sheet or an old exam. Do NOT summarize it; help the student solve it on their own.",
  "summary: 1–2 sentences on what this sheet practices and what you need for it.",
  "tasks: one entry per task with topic, method, a hint (a nudge, never the full solution) and where to read up (use the course context below if it fits, otherwise leave lookup empty).",
  "keyPoints: 3–6 things to know before starting (definitions, formulas, rules), each with the page of this file if it applies, else 0.",
  "terms: the terms the tasks need, with short definitions.",
  "cards: 6–10 cards that train what the sheet needs: mostly 'strategy' (task type → method and first step), plus definition/formula/compute cards for the needed tools. Never a card that just repeats a task.",
  "topics: 2–5 topics of the sheet.",
].join(" ");

/** Anweisung für Mathe-Fächer (Konzept: kleine Karten, verschiedene Kartentypen, Rechenwege Schritt für Schritt). */
const MATH_FILE_PROMPT = [
  "This is a mathematics course.",
  sheetLib.MATH_RULES,
  "Flashcards: 8–14 small cards (one fact each), a mix of these types:",
  "definition (term → exact definition with notation),",
  "theorem (name or situation → statement with all conditions),",
  "formula (what it computes → the formula; or a formula with a gap '___' → the missing part),",
  "strategy (a concrete task from the material → which method and the first step; trains choosing the right method),",
  "compute (a small calculation like in the exercise sheets → result, with 2–4 steps in 'steps'),",
  "truefalse (a statement → 'Wahr' or 'Falsch' plus the reason or a counterexample),",
  "proof (which theorem → the key idea of its proof in one or two sentences, steps optional).",
  "Answers are short; put the working into 'steps'. keyPoints and terms also use LaTeX.",
].join(" ");

// ------------------------------------------------------------------ Text holen

async function fileText(isPackaged, p, maxChars) {
  const res = await backend.runHelper(isPackaged, ["file-text"], { stdin: JSON.stringify({ path: p, maxChars }), timeoutMs: 120_000 });
  if (res.type !== "result") return fail(res.code || "invalid", res.message || "This file could not be read.");
  return { ok: true, ...res };
}

// ------------------------------------------------------------------ Auswertung pro Datei (Warteschlange)

function createStudy({ packaged, broadcast, ...deps }) {
  const job = { running: false, total: 0, done: 0, current: [], failed: [], startedAt: 0, durations: [], cancel: false };

  function jobState() {
    const avg = job.durations.length ? job.durations.reduce((a, b) => a + b, 0) / job.durations.length : null;
    const left = job.total - job.done;
    return {
      running: job.running,
      total: job.total,
      done: job.done,
      current: job.current.map((c) => path.basename(c)),
      failed: job.failed,
      etaSeconds: job.running && avg ? Math.round((avg * left) / PARALLEL) : null,
    };
  }

  const push = () => broadcast("studi:study:state", jobState());

  async function analyzeOne(p, moduleName, math = false, help = false, context = "", force = false) {
    const hashes = readJson(HASHES, {});
    const hash = hashOf(p, hashes);
    writeJson(HASHES, hashes);
    const cached = readJson(ANALYSES, {})[hash];
    // Mathe-Modus: ältere Auswertungen ohne Formeln werden einmal neu gemacht
    if (!force && cached && (!math || cached.math) && Boolean(cached.kind === "help") === help) return { ok: true, cached: true };
    if (readJson(UNREADABLE, {})[hash]) return fail("no_text", "This file is handwritten or scanned, so it can't be read yet.");
    const text = await fileText(packaged(), p, FILE_CHARS);
    if (!text.ok) {
      if (text.code === "no_text") {
        const bad = readJson(UNREADABLE, {});
        bad[hash] = { name: path.basename(p), at: Date.now() };
        writeJson(UNREADABLE, bad);
      }
      return text;
    }
    const name = path.basename(p);
    const res = await askClaude({
      system: SYSTEM,
      prompt: `Course: ${moduleName || "unknown"}. File: ${name}${text.partial ? ` (only pages 1–${text.pagesIncluded} of ${text.pages})` : ""}. ${
        help ? HELP_PROMPT : "Create the study aids for this file."
      }${math ? `\n${MATH_FILE_PROMPT}` : help ? "" : " Card types here are mostly concept or definition; steps stay empty."}${
        help && context ? `\nCourse context (lectures of this course with their topics):\n${String(context).slice(0, 6000)}` : ""
      }`,
      input: text.text,
      schema: help ? HELP_SCHEMA : FILE_SCHEMA,
    });
    if (!res.ok) return res;
    const analyses = readJson(ANALYSES, {});
    analyses[hash] = {
      name,
      at: Date.now(),
      model: MODEL,
      pages: text.pages,
      partial: text.partial ? text.pagesIncluded : null,
      math: Boolean(math),
      kind: help ? "help" : "summary",
      ...res.data,
    };
    writeJson(ANALYSES, analyses);
    return { ok: true, cached: false };
  }

  /** Startet die Auswertung im Hintergrund; Fortschritt kommt über "studi:study:state". */
  function analyze(paths, moduleName, opts = {}) {
    const math = Boolean(opts && opts.math);
    const helpSet = new Set(Array.isArray(opts?.help) ? opts.help : []);
    const context = typeof opts?.context === "string" ? opts.context : "";
    const force = Boolean(opts?.force);
    const todo = [...new Set((Array.isArray(paths) ? paths : []).filter(allowedPath))];
    if (job.running) {
      // laufender Auftrag: nur noch Fehlendes hinten anhängen
      for (const p of todo) if (!job.queue.includes(p) && !job.current.includes(p)) job.queue.push(p);
      job.total = job.done + job.queue.length + job.current.length;
      push();
      return { ok: true };
    }
    if (!todo.length) return fail("invalid", "No files to summarize.");
    Object.assign(job, { running: true, total: todo.length, done: 0, current: [], failed: [], queue: todo, startedAt: Date.now(), durations: [], cancel: false });
    push();
    const worker = async () => {
      while (job.queue.length && !job.cancel) {
        const p = job.queue.shift();
        job.current.push(p);
        push();
        const t0 = Date.now();
        let res;
        try {
          res = await analyzeOne(p, moduleName, math, helpSet.has(p), context, force);
        } catch (e) {
          console.error("[study]", e);
          res = fail("ai_error", "Something went wrong. Please try again.");
        }
        job.current = job.current.filter((c) => c !== p);
        job.done += 1;
        if (res.ok && !res.cached) job.durations.push((Date.now() - t0) / 1000);
        if (!res.ok && res.code !== "cancelled" && res.code !== "no_text") job.failed.push({ path: p, name: path.basename(p), message: res.message });
        // Limit erreicht oder Claude fehlt: Rest nicht sinnlos weiterprobieren
        if (!res.ok && (res.code === "rate_limited" || res.code === "no_ai")) job.cancel = true;
        push();
      }
    };
    Promise.all(Array.from({ length: PARALLEL }, worker)).then(() => {
      job.running = false;
      job.current = [];
      job.queue = [];
      push();
    });
    return { ok: true };
  }

  function cancel() {
    job.cancel = true;
    for (const child of running) child.kill("SIGINT");
    return { ok: true };
  }

  /** Gespeicherte Auswertungen und Karteikarten-Stand für die angegebenen Dateien. */
  async function get(paths) {
    const hashes = readJson(HASHES, {});
    const analyses = readJson(ANALYSES, {});
    const cards = readJson(CARDS, {});
    const bad = readJson(UNREADABLE, {});
    const unreadable = {};
    const files = {};
    let dirty = false;
    for (const p of Array.isArray(paths) ? paths : []) {
      if (!allowedPath(p)) continue;
      const before = hashes[p]?.hash;
      let hash;
      try {
        hash = await hashOfAsync(p, hashes);
      } catch {
        continue; // Datei gerade verschwunden
      }
      if (before !== hash) dirty = true;
      const a = analyses[hash];
      files[p] = a ? { ...a, id: hash.slice(0, 16) } : null;
      if (!a && bad[hash]) unreadable[p] = true;
    }
    if (dirty) writeJson(HASHES, hashes);
    const progress = {};
    for (const a of Object.values(files)) {
      if (!a) continue;
      a.cards.forEach((_, i) => {
        const id = `${a.id}:${i}`;
        if (cards[id]) progress[id] = cards[id];
      });
    }
    return { files, cards: progress, unreadable, today: today(), state: jobState(), stats: stats(), sheet: sheetState(), weekTitles: cachedWeekTitles() };
  }

  // ---------------------------------------------------------------- Karteikarten

  /** Wie viel heute gelernt wurde und wie viele Tage am Stück (für die Übersicht). */
  function stats() {
    const days = readJson(LOG, { days: {} }).days || {};
    let streak = 0;
    let d = days[today()] ? 0 : -1; // heute noch nichts gelernt: Serie zählt bis gestern
    while (days[today(d)]) {
      streak += 1;
      d -= 1;
    }
    const fresh = readJson(LOG, { newDays: {} }).newDays || {};
    return { today: days[today()] || 0, streak, newToday: fresh[today()] || 0 };
  }

  /**
   * Karte bewerten (Leitner). practice = freies Üben nicht fälliger Karten: „gewusst“ ändert dann den Plan nicht,
   * „nicht gewusst“ holt die Karte zurück in Fach 1.
   */
  function review(cardId, knew, practice) {
    if (typeof cardId !== "string" || !/^[0-9a-f]{16}:\d+$/.test(cardId)) return fail("invalid", "Unknown card.");
    const cards = readJson(CARDS, {});
    const cur = cards[cardId] || { box: 0, reviews: 0 };
    const due = !cur.due || cur.due <= today();
    let next;
    if (practice && !due && knew) next = { ...cur, reviews: cur.reviews + 1 };
    else {
      const box = knew ? Math.min(5, Math.max(1, cur.box) + 1) : 1;
      next = { ...cur, box, due: today(LEITNER_DAYS[box]), reviews: cur.reviews + 1 };
    }
    cards[cardId] = next;
    writeJson(CARDS, cards);
    const log = readJson(LOG, { days: {} });
    log.days = log.days || {};
    log.days[today()] = (log.days[today()] || 0) + 1;
    if (!cur.box) {
      log.newDays = log.newDays || {};
      log.newDays[today()] = (log.newDays[today()] || 0) + 1;
    }
    writeJson(LOG, log);
    return { ok: true, card: next, stats: stats() };
  }

  /** Karte nicht mehr abfragen (z. B. unpassend) bzw. wieder abfragen. */
  function suspend(cardId, on) {
    if (typeof cardId !== "string" || !/^[0-9a-f]{16}:\d+$/.test(cardId)) return fail("invalid", "Unknown card.");
    const cards = readJson(CARDS, {});
    const cur = cards[cardId] || { box: 0, reviews: 0 };
    cards[cardId] = { ...cur, suspended: Boolean(on) };
    if (!on) delete cards[cardId].suspended;
    writeJson(CARDS, cards);
    return { ok: true, card: cards[cardId] };
  }

  function resetCards(cardIds) {
    const cards = readJson(CARDS, {});
    for (const id of Array.isArray(cardIds) ? cardIds : []) delete cards[id];
    writeJson(CARDS, cards);
    return { ok: true };
  }

  // ---------------------------------------------------------------- Lernzettel (PDF)

  function listSheets(moduleId) {
    return readJson(SHEETS, { sheets: [] }).sheets.filter((s) => !moduleId || s.moduleId === moduleId);
  }

  /** PDFs liegen in ~/Uni/Study sheets/ (Spotlight findet sie), ohne Zielordner in den App-Daten. */
  function pdfPathFor(sheet, moduleName) {
    const cfg = backend.loadConfig();
    const dir = cfg.targetDir ? path.join(cfg.targetDir, "Study sheets") : path.join(DIR, "pdf");
    const clean = (x) => String(x || "").replace(/\s*:\s*/g, " – ").replace(/[/\\*?"<>|\n\r]/g, "-").replace(/\s+/g, " ").trim();
    const base = clean(`${moduleName ? `${moduleName} – ` : ""}${sheet.title}`).slice(0, 120) || "Study sheet";
    let file = path.join(dir, `${base}.pdf`);
    for (let n = 2; fs.existsSync(file) && n < 100; n++) file = path.join(dir, `${base} (${n}).pdf`);
    return file;
  }

  let sheetRunning = null;
  let sheetProgress = null; // { startedAt, step }

  async function sourceText(files, moduleName) {
    // Volltext, solange er in den Rahmen passt; sonst die gespeicherten Auswertungen (dann ggf. erst auswerten)
    const texts = [];
    let total = 0;
    for (const p of files) {
      const t = await fileText(packaged(), p, FILE_CHARS);
      texts.push(t);
      if (t.ok) total += t.text.length;
    }
    if (total <= SHEET_CHARS) {
      const parts = files.map((p, i) => (texts[i].ok ? `=== F${i + 1}: ${path.basename(p)} ===\n${texts[i].text}` : null)).filter(Boolean);
      // Seiten mit wenig Text sind oft Grafiken (Modelle, Diagramme): Hinweis für Abbildungen
      const candidates = [];
      files.forEach((p, i) => {
        if (!texts[i].ok || !/\.pdf$/i.test(p)) return;
        for (const block of texts[i].text.split(/--- Page (\d+) ---\n/).reduce((acc, cur, k, a) => (k % 2 ? [...acc, [Number(cur), a[k + 1] || ""]] : acc), [])) {
          const [page, body] = block;
          const len = body.replace(/\s+/g, " ").trim().length;
          if (page > 1 && len >= 10 && len <= 260) candidates.push(`F${i + 1} p.${page} (“${body.replace(/\s+/g, " ").trim().slice(0, 50)}”)`);
        }
      });
      return parts.length ? { ok: true, input: parts.join("\n\n"), candidates: candidates.slice(0, 30).join("; ") } : texts[0];
    }
    const hashes = readJson(HASHES, {});
    const parts = [];
    for (const [i, p] of files.entries()) {
      let a = readJson(ANALYSES, {})[hashOf(p, hashes)];
      if (!a) {
        const res = await analyzeOne(p, moduleName);
        if (!res.ok) continue;
        a = readJson(ANALYSES, {})[hashOf(p, hashes)];
      }
      parts.push(
        `=== F${i + 1}: ${path.basename(p)} ===\nSummary: ${a.summary}\nKey points:\n${a.keyPoints.map((k) => `- ${k.text} (p. ${k.page})`).join("\n")}\nTerms:\n${a.terms.map((t) => `- ${t.term}: ${t.definition} (p. ${t.page})`).join("\n")}`,
      );
    }
    writeJson(HASHES, hashes);
    return parts.length ? { ok: true, input: parts.join("\n\n") } : fail("ai_error", "These files couldn't be read.");
  }

  async function createSheet({ moduleId, moduleName, paths, focus, include, length, accent, context, math, subject }) {
    math = Boolean(math);
    subject = ["business", "math", "cs", "law", "science", "humanities"].includes(subject) ? subject : math ? "math" : "business";
    if (sheetRunning) return fail("busy", "A study sheet is already being written.");
    const files = [...new Set((Array.isArray(paths) ? paths : []).filter(allowedPath))].slice(0, 30);
    if (!files.length) return fail("invalid", "Choose at least one file.");
    const inc = sheetLib.cleanInclude(include, math);
    const len = ["short", "normal", "detailed"].includes(length) ? length : "normal";
    const focusText = typeof focus === "string" && focus.trim() ? focus.trim().slice(0, 300) : null;
    sheetProgress = { startedAt: Date.now(), step: "reading" };
    sheetRunning = (async () => {
      const src = await sourceText(files, moduleName);
      if (!src.ok) return src;
      sheetProgress.step = "writing";
      const res = await askClaude({
        system: SYSTEM,
        prompt: (math ? sheetLib.mathPrompt : sheetLib.prompt)({
          moduleName,
          count: files.length,
          include: inc,
          length: len,
          focus: focusText,
          context: typeof context === "string" ? context.slice(0, 400) : "",
          subject,
          candidates: src.candidates || "",
        }),
        input: src.input,
        schema: math ? sheetLib.MATH_SCHEMA : sheetLib.SCHEMA,
        timeoutMs: 900_000,
      });
      if (!res.ok) return res;
      sheetProgress.step = "pdf";
      const sheet = {
        id: crypto.randomUUID(),
        moduleId: String(moduleId || ""),
        moduleName: String(moduleName || ""),
        createdAt: Date.now(),
        focus: focusText,
        context: typeof context === "string" ? context.slice(0, 120) : null,
        math,
        subject,
        include: inc,
        length: len,
        files: files.map((p) => ({ path: p, name: path.basename(p) })),
        ...res.data,
      };
      const accentColor = /^#[0-9a-f]{6}$/i.test(String(accent || "")) ? accent : undefined;
      sheet.accent = accentColor || null;
      try {
        sheet.pdf = await sheetLib.renderPdf(deps.BrowserWindow, sheet, { moduleName, accent: accentColor, outFile: pdfPathFor(sheet, moduleName) });
      } catch (e) {
        console.error("[study] pdf", e);
        sheet.pdf = null;
      }
      const store = readJson(SHEETS, { sheets: [] });
      store.sheets.unshift(sheet);
      writeJson(SHEETS, store);
      if (sheet.pdf) deps.shell.openPath(sheet.pdf);
      return { ok: true, sheet };
    })();
    try {
      return await sheetRunning;
    } catch (e) {
      console.error("[study] sheet", e);
      return fail("ai_error", "Something went wrong. Please try again.");
    } finally {
      sheetRunning = null;
      sheetProgress = null;
    }
  }

  /** PDF öffnen; fehlt es (alter Lernzettel oder gelöscht), wird es neu erstellt. */
  async function openSheet(id, reveal) {
    const store = readJson(SHEETS, { sheets: [] });
    const sheet = store.sheets.find((s) => s.id === id);
    if (!sheet) return fail("invalid", "This study sheet no longer exists.");
    if (!sheet.pdf || !fs.existsSync(sheet.pdf)) {
      try {
        sheet.pdf = await sheetLib.renderPdf(deps.BrowserWindow, sheet, {
          moduleName: sheet.moduleName,
          accent: sheet.accent || undefined,
          outFile: pdfPathFor(sheet, sheet.moduleName),
        });
        writeJson(SHEETS, store);
      } catch (e) {
        console.error("[study] pdf", e);
        return fail("internal", "The PDF couldn't be created. Please try again.");
      }
    }
    if (reveal) deps.shell.showItemInFolder(sheet.pdf);
    else await deps.shell.openPath(sheet.pdf);
    return { ok: true, path: sheet.pdf };
  }

  async function deleteSheet(id) {
    const store = readJson(SHEETS, { sheets: [] });
    const sheet = store.sheets.find((s) => s.id === id);
    store.sheets = store.sheets.filter((s) => s.id !== id);
    writeJson(SHEETS, store);
    // PDF in den Papierkorb (lässt sich im Finder zurücklegen)
    if (sheet?.pdf && fs.existsSync(sheet.pdf)) await deps.shell.trashItem(sheet.pdf).catch(() => {});
    return { ok: true };
  }

  // ---------------------------------------------------------------- Wochentitel (wenig KI)

  const titleRuns = new Map();

  /**
   * Kurze Titel für Themenwochen, deren Titel die Regeln nur aus Dateinamen zusammensetzen konnten
   * (web/src/lib/weeks.ts). Ein Aufruf pro Modul mit Haiku, Ergebnis zwischengespeichert, solange sich die Stichwörter nicht ändern.
   */
  async function weekTitles(moduleId, moduleName, weeks) {
    const list = (Array.isArray(weeks) ? weeks : [])
      .filter((w) => w && typeof w.key === "string" && /^w\d{1,2}$/.test(w.key))
      .map((w) => ({ key: w.key, title: String(w.title || "").slice(0, 120), hints: (Array.isArray(w.hints) ? w.hints : []).map((h) => String(h).slice(0, 120)).slice(0, 8) }))
      .filter((w) => w.hints.length || w.title);
    if (!list.length) return { ok: true, titles: {} };
    const sig = crypto.createHash("sha1").update(JSON.stringify(list.map((w) => [w.key, w.hints]))).digest("hex");
    const store = readJson(WEEK_TITLES, {});
    if (store[moduleId]?.sig === sig) return { ok: true, titles: store[moduleId].titles };
    if (titleRuns.has(moduleId)) return titleRuns.get(moduleId);
    const run = (async () => {
      const res = await askClaude({
        model: TITLE_MODEL,
        system: "You name the weeks of a university course. Answer only with the requested JSON.",
        prompt: [
          `Course: ${moduleName || "unknown"}.`,
          "For each week give a short title of 2–5 words, like a lecturer would write it in ILIAS (e.g. 'Komplexe Zahlen', 'Requirements Engineering', 'Absatzmärkte gestalten').",
          "Use the language of the hints. Use only what the hints say, don't invent topics. Turn file-name fragments into proper words ('Aussagen Mengen' → 'Aussagen und Mengen', 'SE Nutshell' → 'Software Engineering in a Nutshell'). If a week has two topics, join them with ' & '.",
        ].join(" "),
        input: JSON.stringify(list),
        schema: {
          type: "object",
          properties: { titles: { type: "array", items: { type: "object", properties: { key: { type: "string" }, title: { type: "string" } }, required: ["key", "title"], additionalProperties: false } } },
          required: ["titles"],
          additionalProperties: false,
        },
        timeoutMs: 90_000,
      });
      if (!res.ok) return res;
      const titles = {};
      for (const t of res.data.titles || []) if (list.some((w) => w.key === t.key) && t.title) titles[t.key] = String(t.title).slice(0, 60);
      const next = readJson(WEEK_TITLES, {});
      next[moduleId] = { sig, titles, at: Date.now() };
      writeJson(WEEK_TITLES, next);
      return { ok: true, titles };
    })();
    titleRuns.set(moduleId, run);
    try {
      return await run;
    } finally {
      titleRuns.delete(moduleId);
    }
  }

  // ---------------------------------------------------------------- Glossar und Formelsammlung (eigene Einträge, Änderungen)

  /** Automatische Einträge entstehen in der Oberfläche aus den Auswertungen; hier liegen nur eigene und geänderte. */
  function glossaryGet(moduleId) {
    const all = readJson(GLOSSARY, {});
    const g = all[moduleId] || {};
    return { custom: Array.isArray(g.custom) ? g.custom : [], edits: g.edits && typeof g.edits === "object" ? g.edits : {} };
  }

  function glossarySave(moduleId, data) {
    if (!moduleId || typeof moduleId !== "string") return fail("invalid", "Unknown course.");
    const clean = (x, n) => String(x ?? "").slice(0, n);
    const custom = (Array.isArray(data?.custom) ? data.custom : []).slice(0, 2000).map((e) => ({
      id: clean(e.id, 64) || crypto.randomUUID(),
      kind: e.kind === "formula" ? "formula" : "term",
      term: clean(e.term, 300),
      definition: clean(e.definition, 4000),
      note: clean(e.note, 1000),
      at: Number(e.at) || Date.now(),
    }));
    const edits = {};
    for (const [k, v] of Object.entries(data?.edits && typeof data.edits === "object" ? data.edits : {}).slice(0, 5000)) {
      edits[clean(k, 400)] = {
        ...(v?.term != null ? { term: clean(v.term, 300) } : {}),
        ...(v?.definition != null ? { definition: clean(v.definition, 4000) } : {}),
        ...(v?.hidden ? { hidden: true } : {}),
      };
    }
    const all = readJson(GLOSSARY, {});
    all[moduleId] = { custom, edits };
    writeJson(GLOSSARY, all);
    return { ok: true };
  }

  /** Gespeicherte Wochentitel aller Module (sofort, ohne KI). */
  function cachedWeekTitles() {
    const store = readJson(WEEK_TITLES, {});
    return Object.fromEntries(Object.entries(store).map(([k, v]) => [k, v.titles || {}]));
  }

  function sheetState() {
    return sheetProgress ? { running: true, ...sheetProgress } : { running: false };
  }

  async function status() {
    const bin = await findClaude();
    return { available: Boolean(bin), provider: "claude-code", model: MODEL };
  }

  return { status, analyze, cancel, get, review, suspend, stats, resetCards, listSheets, createSheet, openSheet, deleteSheet, sheetState, jobState, weekTitles, cachedWeekTitles, glossaryGet, glossarySave };
}

// ------------------------------------------------------------------ Anki-Export

/** Textdatei für Anki („Datei → Importieren“): Vorderseite, Rückseite, Schlagwörter, getrennt durch Tab. */
function ankiText(cards) {
  // HTML an, damit Zeilenumbrüche erhalten bleiben; deshalb < > & im Text maskieren
  // $…$ → \\(…\\), $$…$$ → \\[…\\] (so zeigt Anki Formeln mit MathJax)
  const mathjax = (s) => String(s ?? "").replace(/\$\$([\s\S]+?)\$\$/g, "\\[$1\\]").replace(/\$([^$\n]+?)\$/g, "\\($1\\)");
  const clean = (s) =>
    mathjax(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\t/g, " ")
      .replace(/\r?\n/g, "<br>");
  const lines = ["#separator:tab", "#html:true", "#tags column:3"];
  for (const c of Array.isArray(cards) ? cards : []) {
    if (!c || !c.q || !c.a) continue;
    // Schlagwörter durch Leerzeichen getrennt (jedes Schlagwort selbst ohne Leerzeichen, siehe study.ts)
    lines.push([clean(c.q), clean(c.a), String(c.tags ?? "").replace(/[\t\r\n]/g, " ")].join("\t"));
  }
  return lines.join("\n") + "\n";
}

function register(handle, { packaged, windows, dialog, BrowserWindow, shell }) {
  const broadcast = (channel, payload) => {
    for (const win of windows()) win.webContents.send(channel, payload);
  };
  const study = createStudy({ packaged, broadcast, BrowserWindow, shell });
  handle("studi:study:status", () => study.status());
  handle("studi:study:get", (paths) => study.get(paths));
  handle("studi:study:analyze", (paths, moduleName, opts) => study.analyze(paths, String(moduleName || ""), opts || {}));
  handle("studi:study:cancel", () => study.cancel());
  handle("studi:study:review", (cardId, knew, practice) => study.review(cardId, Boolean(knew), Boolean(practice)));
  handle("studi:study:suspend", (cardId, on) => study.suspend(cardId, Boolean(on)));
  handle("studi:study:resetCards", (ids) => study.resetCards(ids));
  handle("studi:study:sheets", (moduleId) => study.listSheets(moduleId ? String(moduleId) : null));
  handle("studi:study:createSheet", (opts) => study.createSheet(opts || {}));
  handle("studi:study:deleteSheet", (id) => study.deleteSheet(String(id)));
  handle("studi:study:openSheet", (id, reveal) => study.openSheet(String(id), Boolean(reveal)));
  handle("studi:study:sheetState", () => study.sheetState());
  handle("studi:study:glossary", (moduleId) => study.glossaryGet(String(moduleId || "")));
  handle("studi:study:saveGlossary", (moduleId, data) => study.glossarySave(String(moduleId || ""), data));
  handle("studi:study:weekTitles", (moduleId, moduleName, weeks) => study.weekTitles(String(moduleId || ""), String(moduleName || ""), weeks));
  handle("studi:study:exportAnki", async (name, cards) => {
    const safe = String(name || "Flashcards").replace(/[/\\:*?"<>|]/g, "-").slice(0, 80);
    const win = [...windows()][0];
    const res = await dialog.showSaveDialog(win, {
      title: "Export flashcards for Anki",
      defaultPath: path.join(os.homedir(), "Downloads", `${safe} – flashcards.txt`),
      filters: [{ name: "Text", extensions: ["txt"] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, code: "cancelled", message: "" };
    fs.writeFileSync(res.filePath, ankiText(cards));
    return { ok: true, path: res.filePath };
  });
}

module.exports = { register, ankiText, createStudy };
