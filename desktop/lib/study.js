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

const DIR = path.join(backend.DATA_DIR, "study");
const ANALYSES = path.join(DIR, "analyses.json"); // { [hash]: Analysis }
const HASHES = path.join(DIR, "hashes.json"); // { [path]: { size, mtime, hash } }
const SHEETS = path.join(DIR, "sheets.json"); // { sheets: Sheet[] }
const CARDS = path.join(DIR, "cards.json"); // { [cardId]: { box, due, reviews } }

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
async function askClaude({ system, prompt, input, schema, timeoutMs = 240_000 }) {
  const bin = await findClaude();
  if (!bin) return fail("no_ai", "Claude Code isn't installed on this Mac. Study tools need it for now.");
  const cwd = path.join(os.tmpdir(), "studi-helfer-claude");
  fs.mkdirSync(cwd, { recursive: true });
  const args = [
    "-p", prompt,
    "--model", MODEL,
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
  cards: list(
    obj({ q: { type: "string" }, a: { type: "string" }, page }),
    "6–12 flashcards that test understanding: a clear question, a short exact answer",
  ),
});

const SHEET_SCHEMA = obj({
  title: { type: "string", description: "Short title for the study sheet" },
  sections: list(
    obj({
      heading: { type: "string" },
      points: list(
        obj({
          text: { type: "string", description: "A concise but complete statement; definitions, formulas, examples where useful" },
          file: { type: "integer", description: "Number of the source file (F1 → 1), 0 if several or unknown" },
          page,
        }),
        "3–8 points",
      ),
    }),
    "3–8 sections, ordered by topic (not by file)",
  ),
});

// ------------------------------------------------------------------ Text holen

async function fileText(isPackaged, p, maxChars) {
  const res = await backend.runHelper(isPackaged, ["file-text"], { stdin: JSON.stringify({ path: p, maxChars }), timeoutMs: 120_000 });
  if (res.type !== "result") return fail(res.code || "invalid", res.message || "This file could not be read.");
  return { ok: true, ...res };
}

// ------------------------------------------------------------------ Auswertung pro Datei (Warteschlange)

function createStudy({ packaged, broadcast }) {
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

  async function analyzeOne(p, moduleName) {
    const hashes = readJson(HASHES, {});
    const hash = hashOf(p, hashes);
    writeJson(HASHES, hashes);
    if (readJson(ANALYSES, {})[hash]) return { ok: true, cached: true };
    const text = await fileText(packaged(), p, FILE_CHARS);
    if (!text.ok) return text;
    const name = path.basename(p);
    const res = await askClaude({
      system: SYSTEM,
      prompt: `Course: ${moduleName || "unknown"}. File: ${name}${text.partial ? ` (only pages 1–${text.pagesIncluded} of ${text.pages})` : ""}. Create the study aids for this file.`,
      input: text.text,
      schema: FILE_SCHEMA,
    });
    if (!res.ok) return res;
    const analyses = readJson(ANALYSES, {});
    analyses[hash] = {
      name,
      at: Date.now(),
      model: MODEL,
      pages: text.pages,
      partial: text.partial ? text.pagesIncluded : null,
      ...res.data,
    };
    writeJson(ANALYSES, analyses);
    return { ok: true, cached: false };
  }

  /** Startet die Auswertung im Hintergrund; Fortschritt kommt über "studi:study:state". */
  function analyze(paths, moduleName) {
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
          res = await analyzeOne(p, moduleName);
        } catch (e) {
          console.error("[study]", e);
          res = fail("ai_error", "Something went wrong. Please try again.");
        }
        job.current = job.current.filter((c) => c !== p);
        job.done += 1;
        if (res.ok && !res.cached) job.durations.push((Date.now() - t0) / 1000);
        if (!res.ok && res.code !== "cancelled") job.failed.push({ path: p, name: path.basename(p), message: res.message });
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
  function get(paths) {
    const hashes = readJson(HASHES, {});
    const analyses = readJson(ANALYSES, {});
    const cards = readJson(CARDS, {});
    const files = {};
    let dirty = false;
    for (const p of Array.isArray(paths) ? paths : []) {
      if (!allowedPath(p)) continue;
      const before = hashes[p]?.hash;
      const hash = hashOf(p, hashes);
      if (before !== hash) dirty = true;
      const a = analyses[hash];
      files[p] = a ? { ...a, id: hash.slice(0, 16) } : null;
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
    return { files, cards: progress, today: today(), state: jobState() };
  }

  // ---------------------------------------------------------------- Karteikarten

  function review(cardId, knew) {
    if (typeof cardId !== "string" || !/^[0-9a-f]{16}:\d+$/.test(cardId)) return fail("invalid", "Unknown card.");
    const cards = readJson(CARDS, {});
    const cur = cards[cardId] || { box: 0, reviews: 0 };
    const box = knew ? Math.min(5, Math.max(1, cur.box) + 1) : 1;
    cards[cardId] = { box, due: today(LEITNER_DAYS[box]), reviews: cur.reviews + 1 };
    writeJson(CARDS, cards);
    return { ok: true, card: cards[cardId] };
  }

  function resetCards(cardIds) {
    const cards = readJson(CARDS, {});
    for (const id of Array.isArray(cardIds) ? cardIds : []) delete cards[id];
    writeJson(CARDS, cards);
    return { ok: true };
  }

  // ---------------------------------------------------------------- Lernzettel

  function listSheets(moduleId) {
    return readJson(SHEETS, { sheets: [] }).sheets.filter((s) => !moduleId || s.moduleId === moduleId);
  }

  let sheetRunning = null;

  async function createSheet({ moduleId, moduleName, paths, focus }) {
    if (sheetRunning) return fail("busy", "A study sheet is already being written.");
    const files = [...new Set((Array.isArray(paths) ? paths : []).filter(allowedPath))].slice(0, 30);
    if (!files.length) return fail("invalid", "Choose at least one file.");
    sheetRunning = (async () => {
      // Volltext, solange er in den Rahmen passt; sonst die gespeicherten Auswertungen (dann ggf. erst auswerten)
      const texts = [];
      let total = 0;
      for (const p of files) {
        const t = await fileText(packaged(), p, FILE_CHARS);
        texts.push(t);
        if (t.ok) total += t.text.length;
      }
      let input;
      if (total <= SHEET_CHARS) {
        const parts = files.map((p, i) => (texts[i].ok ? `=== F${i + 1}: ${path.basename(p)} ===\n${texts[i].text}` : null)).filter(Boolean);
        if (!parts.length) return texts[0];
        input = parts.join("\n\n");
      } else {
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
        if (!parts.length) return fail("ai_error", "These files couldn't be read.");
        input = parts.join("\n\n");
      }
      const focusLine = typeof focus === "string" && focus.trim() ? ` Focus on: ${focus.trim().slice(0, 300)}.` : "";
      const res = await askClaude({
        system: SYSTEM,
        prompt: `Course: ${moduleName || "unknown"}. Write a study sheet (Lernzettel) for the exam from these ${files.length} file(s), marked F1…F${files.length}.${focusLine} Cite the source file number and page for each point.`,
        input,
        schema: SHEET_SCHEMA,
        timeoutMs: 420_000,
      });
      if (!res.ok) return res;
      const sheet = {
        id: crypto.randomUUID(),
        moduleId: String(moduleId || ""),
        createdAt: Date.now(),
        focus: focusLine ? focus.trim().slice(0, 300) : null,
        files: files.map((p) => ({ path: p, name: path.basename(p) })),
        title: res.data.title,
        sections: res.data.sections,
      };
      const store = readJson(SHEETS, { sheets: [] });
      store.sheets.unshift(sheet);
      writeJson(SHEETS, store);
      return { ok: true, sheet };
    })();
    try {
      return await sheetRunning;
    } catch (e) {
      console.error("[study] sheet", e);
      return fail("ai_error", "Something went wrong. Please try again.");
    } finally {
      sheetRunning = null;
    }
  }

  function deleteSheet(id) {
    const store = readJson(SHEETS, { sheets: [] });
    store.sheets = store.sheets.filter((s) => s.id !== id);
    writeJson(SHEETS, store);
    return { ok: true };
  }

  async function status() {
    const bin = await findClaude();
    return { available: Boolean(bin), provider: "claude-code", model: MODEL };
  }

  return { status, analyze, cancel, get, review, resetCards, listSheets, createSheet, deleteSheet, jobState };
}

// ------------------------------------------------------------------ Anki-Export

/** Textdatei für Anki („Datei → Importieren“): Vorderseite, Rückseite, Schlagwörter, getrennt durch Tab. */
function ankiText(cards) {
  // HTML an, damit Zeilenumbrüche erhalten bleiben; deshalb < > & im Text maskieren
  const clean = (s) =>
    String(s ?? "")
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

function register(handle, { packaged, windows, dialog }) {
  const broadcast = (channel, payload) => {
    for (const win of windows()) win.webContents.send(channel, payload);
  };
  const study = createStudy({ packaged, broadcast });
  handle("studi:study:status", () => study.status());
  handle("studi:study:get", (paths) => study.get(paths));
  handle("studi:study:analyze", (paths, moduleName) => study.analyze(paths, String(moduleName || "")));
  handle("studi:study:cancel", () => study.cancel());
  handle("studi:study:review", (cardId, knew) => study.review(cardId, Boolean(knew)));
  handle("studi:study:resetCards", (ids) => study.resetCards(ids));
  handle("studi:study:sheets", (moduleId) => study.listSheets(moduleId ? String(moduleId) : null));
  handle("studi:study:createSheet", (opts) => study.createSheet(opts || {}));
  handle("studi:study:deleteSheet", (id) => study.deleteSheet(String(id)));
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
