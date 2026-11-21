// Hintergrundteil auf Electron-Seite: startet den Python-Helfer (services/ilias-sync),
// verwaltet config.json, liest Sync-Stand und Dateien, richtet den täglichen launchd-Job ein.
//
// Uni-Passwort: geht nur von der Oberfläche über stdin an den Helfer, der es nach erfolgreichem
// Login im macOS-Schlüsselbund ablegt. Es wird nirgends gespeichert oder geloggt.

const { spawn, execFile } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createAiDeadlines } = require("./ai-deadlines");
const { buildModules, categoryOf, unitNumber, matchModule, CATEGORY_ORDER, CATEGORY_LABEL } = require("./modules");
const { buildSchedule, overlaps } = require("./schedule");

// STUDI_DATA_DIR nur für Tests (z. B. Ordner-Umzug in einem Temp-Ordner ausprobieren)
const DATA_DIR = process.env.STUDI_DATA_DIR || path.join(os.homedir(), "Library", "Application Support", "Studi-Helfer");
const CONFIG = path.join(DATA_DIR, "config.json");
const STATE = path.join(DATA_DIR, "state.json");
const RUNS = path.join(DATA_DIR, "runs.jsonl");
const LOGS = path.join(DATA_DIR, "logs");
const PLIST_LABEL = "de.studihelfer.sync";
const PLIST = path.join(os.homedir(), "Library", "LaunchAgents", `${PLIST_LABEL}.plist`);
const DEFAULT_TARGET = path.join(os.homedir(), "Uni");
const SERVICE_DIR = path.resolve(__dirname, "..", "..", "services", "ilias-sync");

// ------------------------------------------------------------------ Helfer starten

/** Befehl für den Python-Helfer: im fertigen App-Paket ein eingebautes Programm, sonst die venv. */
function helperCommand(isPackaged) {
  if (isPackaged) {
    const bin = path.join(process.resourcesPath, "studi-sync", "studi-sync");
    return { cmd: bin, args: [], cwd: DATA_DIR };
  }
  const python = path.join(SERVICE_DIR, ".venv", "bin", "python");
  if (!fs.existsSync(python)) {
    throw new Error(
      `Python environment missing: ${python}. Run "services/ilias-sync/setup.sh" once.`,
    );
  }
  return { cmd: python, args: ["-m", "studi_sync"], cwd: SERVICE_DIR };
}

function helperEnv() {
  return { ...process.env, STUDI_DATA_DIR: DATA_DIR, PYTHONUNBUFFERED: "1" };
}

/**
 * Führt einen Helfer-Befehl aus und liefert die letzte JSON-Zeile
 * ({type:"result",...} oder {type:"error",code,message}).
 */
function runHelper(isPackaged, args, { stdin, timeoutMs = 120_000 } = {}) {
  return new Promise((resolve) => {
    let helper;
    try {
      helper = helperCommand(isPackaged);
    } catch (e) {
      resolve({ type: "error", code: "setup", message: e.message });
      return;
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const child = spawn(helper.cmd, [...helper.args, ...args], {
      cwd: helper.cwd,
      env: helperEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ type: "error", code: "setup", message: `Helper failed to start: ${e.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const lines = out.split("\n").filter((l) => l.trim().startsWith("{"));
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const obj = JSON.parse(lines[i]);
          if (obj.type === "result" || obj.type === "error") return resolve(obj);
        } catch {
          // nächste Zeile probieren
        }
      }
      resolve({
        type: "error",
        code: code === null ? "timeout" : "internal",
        message: (err || out).trim().split("\n").slice(-3).join(" ") || `Helper exited (${code})`,
      });
    });
    if (stdin !== undefined) child.stdin.write(stdin);
    child.stdin.end();
  });
}

// ------------------------------------------------------------------ Config

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
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function loadConfig() {
  return {
    username: null,
    targetDir: null,
    courses: [],
    schedule: { enabled: false, time: "07:00", every: "daily" },
    notifications: true,
    randomDelayMin: 15,
    ...readJson(CONFIG, {}),
  };
}

function saveConfig(cfg) {
  writeJson(CONFIG, cfg);
}

/** Gleiche Regel wie folder_name() in services/ilias-sync/studi_sync/sync.py. */
function folderName(title) {
  // Ein Semester-Vorsatz wie "[WS26/27] " fällt weg.
  title = title.replace(/^\s*\[[^\]]{1,20}\]\s*/, "") || title;
  let name = title.replace(/[/:\\\n\r\t]+/g, " - ").replace(/^[ .]+|[ .]+$/g, "");
  name = name.replace(/\s{2,}/g, " ").slice(0, 120);
  return name || "Kurs";
}

// ------------------------------------------------------------------ Sync-Stand

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

function readState() {
  const state = readJson(STATE, { running: false });
  if (state.running && !pidAlive(state.pid)) {
    return { running: false, lastStatus: "error", interrupted: true };
  }
  return state;
}

function readRuns(limit = 30) {
  let text = "";
  try {
    text = fs.readFileSync(RUNS, "utf8");
  } catch {
    return [];
  }
  const runs = [];
  for (const line of text.trim().split("\n").slice(-limit)) {
    try {
      runs.push(JSON.parse(line));
    } catch {
      // kaputte Zeile überspringen
    }
  }
  return runs;
}

/** Startet einen Sync losgelöst von der App: er läuft weiter, auch wenn die App beendet wird. */
function startSync(isPackaged) {
  const state = readState();
  if (state.running) return { ok: false, code: "busy", message: "A sync is already running." };
  let helper;
  try {
    helper = helperCommand(isPackaged);
  } catch (e) {
    return { ok: false, code: "setup", message: e.message };
  }
  fs.mkdirSync(LOGS, { recursive: true });
  const log = fs.openSync(path.join(LOGS, "app-sync.log"), "a");
  const child = spawn(helper.cmd, [...helper.args, "sync"], {
    cwd: helper.cwd,
    env: helperEnv(),
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.unref();
  return { ok: true };
}

/** Bricht einen laufenden Sync ab (auch einen von launchd gestarteten). Fertige Dateien bleiben. */
function cancelSync() {
  const state = readState();
  if (!state.running || !state.pid) return { ok: false, code: "invalid", message: "No sync is running." };
  try {
    process.kill(state.pid, "SIGTERM");
    return { ok: true };
  } catch (e) {
    return { ok: false, code: "internal", message: e.message };
  }
}

// ------------------------------------------------------------------ Dateien

const KINDS = {
  pdf: "pdf",
  zip: "zip",
  rar: "zip",
  "7z": "zip",
  doc: "doc",
  docx: "doc",
  odt: "doc",
  ppt: "doc",
  pptx: "doc",
  xls: "doc",
  xlsx: "doc",
};

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function formatDate(d) {
  const now = new Date();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return "Yesterday";
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

async function walk(dir, base, out) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, base, out);
    else if (e.isFile()) {
      const st = await fsp.stat(full);
      out.push({ full, rel: path.relative(base, full), size: st.size, mtime: st.mtime });
    }
  }
}

// ------------------------------------------------------------------ Module

const PARENTS = path.join(DATA_DIR, "object-parents.json");
const SEEN = path.join(DATA_DIR, "seen.json");
const CALENDAR_EVENTS = path.join(DATA_DIR, "calendar-events.json");
const NEW_DAYS = 14; // so lange gilt eine Datei als „neu“, wenn man sie nicht angesehen hat

/** Kurse aus config.json mit Elternkurs (Gruppen) – fehlt er, aus dem Brotkrumen-Cache des Helfers. */
function coursesWithParents(cfg) {
  const cache = readJson(PARENTS, {});
  return cfg.courses.map((c) => {
    if (c.kind !== "grp" || c.parent) return c;
    const chain = (cache[`grp/${c.refId}`] || []).filter((x) => x.startsWith("crs-"));
    return { ...c, parent: chain[chain.length - 1] || null };
  });
}

/** Ordnername auf dem Mac (keine Schrägstriche, keine führenden Punkte). */
function safeName(name) {
  return (
    String(name || "")
      .replace(/[/:\\\n\r\t]+/g, " - ")
      .replace(/^[ .]+|[ .]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .slice(0, 100) || "Course"
  );
}

/** Module der ausgewählten Kurse (für Übersicht, Fristen, Ordner). */
function currentModules(cfg = loadConfig(), fileNamesByCourse = {}) {
  const selected = coursesWithParents(cfg).filter((c) => c.selected);
  return buildModules(selected, cfg.modules || {}, fileNamesByCourse);
}

/** Gewünschter Ordner eines Kurses: „<Modul>/<Teil>“ bzw. „<Modul>“, wenn das Modul nur einen Teil hat. */
function desiredFolders(cfg) {
  const { modules } = currentModules(cfg);
  const out = new Map();
  for (const m of modules) {
    const base = safeName(m.name);
    for (const p of m.parts) out.set(p.courseId, m.parts.length > 1 ? `${base}/${safeName(p.label)}` : base);
  }
  return out;
}

function removeEmptyParents(dir, stop) {
  let d = dir;
  while (d.startsWith(`${stop}${path.sep}`)) {
    try {
      const rest = fs.readdirSync(d).filter((n) => n !== ".DS_Store");
      if (rest.length) return;
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      return;
    }
    d = path.dirname(d);
  }
}

/**
 * Ordner auf dem Mac an die Module anpassen („~/Uni/Mathe I/Exercises“). Bestehende Ordner werden verschoben,
 * nicht neu geladen (PFERDs .report wandert mit, es wird nichts doppelt geladen). Läuft nur ohne laufenden Sync.
 * Zwei Phasen, damit verschachtelte Ziele („Visualisierung“ → „Visualisierung/Lecture“) sicher klappen:
 * erst alle betroffenen Ordner auf temporäre Namen, dann an ihren Platz.
 */
function applyLayout() {
  const cfg = loadConfig();
  if (!cfg.targetDir || readState().running) return { ok: false, moved: [] };
  const root = path.resolve(cfg.targetDir);
  const want = desiredFolders(cfg);
  const plan = [];
  let changed = false;
  for (const c of cfg.courses) {
    const target = want.get(c.id);
    if (!target || target === c.folder) continue;
    const from = c.folder ? path.join(root, c.folder) : null;
    if (!from || !fs.existsSync(from)) {
      c.folder = target; // noch nichts geladen: einfach den neuen Ordner verwenden
      changed = true;
      continue;
    }
    plan.push({ course: c, from, to: path.join(root, target), target });
  }
  // Ziele, die schon belegt sind (und nicht selbst verschoben werden), auslassen
  const leaving = new Set(plan.map((p) => p.from));
  const safe = plan.filter((p) => !fs.existsSync(p.to) || leaving.has(p.to) || [...leaving].some((f) => p.to.startsWith(`${f}${path.sep}`)));
  const moved = [];
  const staged = [];
  try {
    for (const p of safe) {
      const tmp = path.join(root, `.studi-move-${p.course.id}-${Date.now()}`);
      fs.renameSync(p.from, tmp);
      staged.push({ ...p, tmp });
    }
    for (const p of staged) {
      if (fs.existsSync(p.to)) {
        // Ziel inzwischen belegt (sollte nicht vorkommen): zurück an den alten Ort
        fs.mkdirSync(path.dirname(p.from), { recursive: true });
        fs.renameSync(p.tmp, p.from);
        continue;
      }
      fs.mkdirSync(path.dirname(p.to), { recursive: true });
      fs.renameSync(p.tmp, p.to);
      moved.push({ from: path.relative(root, p.from), to: p.target });
      p.course.folder = p.target;
      changed = true;
    }
    for (const p of staged) removeEmptyParents(path.dirname(p.from), root);
  } catch (e) {
    console.error("[layout]", e.message);
    // Was schon auf einem temporären Namen liegt, zurückholen
    for (const p of staged) {
      try {
        if (fs.existsSync(p.tmp)) {
          fs.mkdirSync(path.dirname(p.from), { recursive: true });
          fs.renameSync(p.tmp, p.from);
        }
      } catch {
        // bleibt als .studi-move-… liegen, nichts geht verloren
      }
    }
  }
  if (changed) saveConfig(cfg);
  return { ok: true, moved };
}

// ------------------------------------------------------------------ Neu / gesehen

function readSeen() {
  return readJson(SEEN, { seen: {} }).seen ?? {};
}

function markSeen(ids) {
  if (!Array.isArray(ids)) return { ok: false };
  const data = readJson(SEEN, { seen: {} });
  data.seen = data.seen ?? {};
  const now = Date.now();
  for (const id of ids.slice(0, 5000)) if (typeof id === "string") data.seen[id] = now;
  // Alte Einträge aufräumen
  for (const [id, t] of Object.entries(data.seen)) if (now - t > 120 * 86_400_000) delete data.seen[id];
  writeJson(SEEN, data);
  return { ok: true };
}

/**
 * Neue und geänderte Dateien der letzten Tage (aus runs.jsonl). Der erste Import eines Kurses zählt nicht als „neu“.
 * → { added: Set("<kursId>\0<pfad>"), changed: Map(... → alte Fassung) }
 */
function recentChanges() {
  const runs = readRuns(400);
  const since = Date.now() / 1000 - NEW_DAYS * 86400;
  const firstSeen = new Set();
  const added = new Set();
  const changed = new Map();
  for (const r of runs) {
    const initial = new Set(r.initialCourses || []);
    for (const id of Object.keys(r.courses || {})) {
      if (!firstSeen.has(id)) {
        initial.add(id); // erster Lauf mit diesem Kurs = erster Import
        firstSeen.add(id);
      }
    }
    if ((r.end || 0) < since) continue;
    for (const a of r.added || []) if (!initial.has(a.course)) added.add(`${a.course}\u0000${a.path}`);
    for (const c of r.changed || []) changed.set(`${c.course}\u0000${c.path}`, c.previous ?? null);
  }
  return { added, changed };
}

// ------------------------------------------------------------------ Dateien

async function walk(dir, base, out) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, base, out);
    else if (e.isFile()) {
      const st = await fsp.stat(full);
      out.push({ full, rel: path.relative(base, full), size: st.size, mtime: st.mtime });
    }
  }
}

/**
 * Module mit Dateien (Form wie mock-data.ts plus Extras). Dateien je Art gruppiert
 * („Lecture slides“, „Exercises“ …), innerhalb nach Nummer/Name sortiert.
 */
async function listFiles() {
  const cfg = loadConfig();
  if (!cfg.targetDir) return [];
  const { added, changed } = recentChanges();
  const seen = readSeen();

  // Dateien je Kurs einlesen
  const perCourse = new Map();
  for (const c of cfg.courses.filter((x) => x.selected)) {
    const root = path.join(cfg.targetDir, c.folder || folderName(c.title));
    const files = [];
    await walk(root, root, files);
    perCourse.set(c.id, { root, files });
  }
  const names = Object.fromEntries([...perCourse].map(([id, v]) => [id, v.files.map((f) => path.basename(f.rel))]));
  const { modules, moduleOfCourse } = currentModules(cfg, names);
  const { slotsByModule } = scheduleFor(cfg, modules, moduleOfCourse);

  return modules.map((m) => {
    const cats = new Map();
    const seenFiles = new Set(); // dieselbe Datei in Übung und Gruppe (gleicher Name + Größe) nur einmal zeigen
    let total = 0;
    for (const part of m.parts) {
      const pc = perCourse.get(part.courseId);
      if (!pc) continue;
      for (const f of pc.files) {
        const name = path.basename(f.rel);
        const dupKey = `${name.toLowerCase()}\u0000${f.size}`;
        if (seenFiles.has(dupKey)) continue;
        seenFiles.add(dupKey);
        total += 1;
        const dir = path.dirname(f.rel) === "." ? "" : path.dirname(f.rel);
        const cat = categoryOf(name, dir, part.label);
        const id = `${part.courseId}:${f.rel}`;
        const key = `${part.courseId}\u0000${f.rel}`;
        const ext = path.extname(name).slice(1).toLowerCase();
        if (!cats.has(cat)) cats.set(cat, []);
        cats.get(cat).push({
          id,
          name,
          kind: KINDS[ext] ?? "other",
          size: formatSize(f.size),
          updated: formatDate(f.mtime),
          isNew: added.has(key) && !seen[id],
          isChanged: changed.has(key) && !seen[id],
          previousVersion: changed.get(key) ?? undefined,
          path: f.full,
          modifiedAt: f.mtime.getTime(),
          part: m.parts.length > 1 ? part.label : null,
          where: dir,
          unit: unitNumber(name, dir),
          category: cat,
        });
      }
    }
    const folders = CATEGORY_ORDER.filter((c) => cats.has(c)).map((c) => ({
      id: `${m.id}:${c}`,
      name: CATEGORY_LABEL[c],
      category: c,
      files: cats
        .get(c)
        .sort(
          (a, b) =>
            (a.unit ?? 999) - (b.unit ?? 999) || a.name.localeCompare(b.name, "de", { numeric: true }) || a.path.localeCompare(b.path),
        ),
    }));
    const first = perCourse.get(m.parts[0].courseId);
    const moduleFolder =
      m.parts.length > 1 && first ? path.dirname(first.root) : first ? first.root : path.join(cfg.targetDir, safeName(m.name));
    const main = cfg.courses.find((c) => c.id === m.mainCourseId);
    return {
      id: m.id,
      name: m.name,
      fullName: m.fullName,
      autoName: m.autoName,
      renamed: m.renamed,
      color: m.color,
      semester: m.semester,
      lecturer: "",
      total,
      folder: moduleFolder,
      iliasUrl: main ? `https://www.ilias.uni-koeln.de/ilias/goto.php/${main.kind}/${main.refId}` : null,
      parts: m.parts.map((p) => ({ courseId: p.courseId, label: p.label, folder: perCourse.get(p.courseId)?.root ?? null })),
      slots: slotsByModule.get(m.id) || [],
      folders,
    };
  });
}

// ------------------------------------------------------------------ Fristen

const DONE_DEADLINES = path.join(DATA_DIR, "deadlines-done.json");
const DEADLINES = path.join(DATA_DIR, "deadlines.json");
const SHEET_DEADLINES = path.join(DATA_DIR, "sheet-deadlines.json");
const ORGA_EVENTS = path.join(DATA_DIR, "orga-events.json");

/** Stundenplan aus den Orga-Folien (Wochentermine, eigene Gruppe, gewählte Wahltermine). */
function scheduleFor(cfg, modules, moduleOfCourse) {
  const moduleOf = (courseId) => (String(courseId).startsWith("mod-") ? courseId : moduleOfCourse.get(courseId));
  return buildSchedule({ orga: readJson(ORGA_EVENTS, null), cfg, moduleOf, modules });
}

// ------------------------------------------------------------------ Eigene Termine, ausgeblendete Termine

const CUSTOM_EVENTS = path.join(DATA_DIR, "custom-events.json");
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const EVENT_COLORS = ["blue", "orange", "green", "plum", "ochre", "teal", "rose", "indigo"];

/** Eigene Termine und ausgeblendete erkannte Termine (Ids oder Serien). Die Oberfläche löst Wiederholungen auf. */
function getCustomEvents() {
  const data = readJson(CUSTOM_EVENTS, { events: [], hidden: [] });
  return { events: Array.isArray(data.events) ? data.events : [], hidden: Array.isArray(data.hidden) ? data.hidden : [] };
}

const str = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "");

/** Prüft und säubert einen Termin aus der Oberfläche; null = ungültig. */
function cleanEvent(ev) {
  if (!ev || typeof ev !== "object" || typeof ev.id !== "string" || !/^ev-[a-z0-9]{4,24}$/.test(ev.id)) return null;
  if (!ISO_DAY.test(ev.date || "")) return null;
  const start = HHMM.test(ev.start || "") ? ev.start : null;
  const end = start && HHMM.test(ev.end || "") && ev.end > start ? ev.end : null;
  return {
    id: ev.id,
    title: str(ev.title, 80) || "Untitled",
    moduleId: typeof ev.moduleId === "string" && ev.moduleId.length < 60 ? ev.moduleId : null,
    color: EVENT_COLORS.includes(ev.color) ? ev.color : null,
    kind: ["termin", "abgabe", "klausur"].includes(ev.kind) ? ev.kind : "termin",
    date: ev.date,
    start,
    end,
    location: str(ev.location, 120),
    notes: str(ev.notes, 1000),
    repeat: ["none", "daily", "weekly", "biweekly", "monthly"].includes(ev.repeat) ? ev.repeat : "none",
    weekdays: Array.isArray(ev.weekdays) ? [...new Set(ev.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))] : [],
    until: ISO_DAY.test(ev.until || "") ? ev.until : null,
    skipHolidays: ev.skipHolidays !== false,
    exceptions: Array.isArray(ev.exceptions) ? ev.exceptions.filter((d) => ISO_DAY.test(d)).slice(0, 400) : [],
  };
}

function saveCustomEvent(ev) {
  const clean = cleanEvent(ev);
  if (!clean) return { ok: false, code: "invalid", message: "This event could not be saved. Check the date and times." };
  const data = getCustomEvents();
  const i = data.events.findIndex((e) => e.id === clean.id);
  if (i >= 0) data.events[i] = clean;
  else if (data.events.length < 500) data.events.push(clean);
  else return { ok: false, code: "invalid", message: "Too many events." };
  writeJson(CUSTOM_EVENTS, data);
  return { ok: true, event: clean };
}

function deleteCustomEvent(id) {
  const data = getCustomEvents();
  data.events = data.events.filter((e) => e.id !== id);
  writeJson(CUSTOM_EVENTS, data);
  return { ok: true };
}

/** Erkannten Termin (Id) oder ganze Serie ausblenden bzw. wieder zeigen; key = "*" zeigt alle wieder. */
function setEventHidden(key, hidden) {
  if (typeof key !== "string" || key.length > 300) return { ok: false, code: "invalid", message: "Unknown event." };
  const data = getCustomEvents();
  const set = new Set(data.hidden);
  if (key === "*") set.clear();
  else if (hidden) set.add(key);
  else set.delete(key);
  data.hidden = [...set].slice(-2000);
  writeJson(CUSTOM_EVENTS, data);
  return { ok: true };
}

/** Wahltermin („Übung Mo 12:00 oder Mi 17:45“) als eigenen markieren bzw. wieder abwählen. */
function setSlotChoice(moduleId, key, on) {
  if (typeof moduleId !== "string" || !moduleId.startsWith("mod-") || typeof key !== "string" || key.length > 80) {
    return { ok: false, code: "invalid", message: "Unknown class." };
  }
  const cfg = loadConfig();
  cfg.slotChoices = cfg.slotChoices || {};
  const set = new Set(cfg.slotChoices[moduleId] || []);
  if (on) set.add(key);
  else set.delete(key);
  if (set.size) cfg.slotChoices[moduleId] = [...set];
  else delete cfg.slotChoices[moduleId];
  saveConfig(cfg);
  return { ok: true };
}

const normTitle = (t) =>
  String(t || "")
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .trim();

/**
 * Fristen/Termine aus allen Quellen, je mit Modul (moduleId) und abgehakt ja/nein:
 *   1. ILIAS-Kalender   2. Übungsblätter/Folien per Regeln   3. weitere Kalender (KLIPS …)   4. KI (nur mit Schlüssel)
 *   5. Stundenplan aus Orga-Folien (nur, wenn zur selben Zeit nicht schon ein Termin aus 1.–4. da ist)
 * Doppelte fallen weg: gleiche Id; dieselbe Abgabe/Klausur im selben Modul am selben Tag; gleicher Titel am selben Tag.
 */
function getDeadlines() {
  const cfg = loadConfig();
  const data = readJson(DEADLINES, { updatedAt: null, deadlines: [] });
  const done = new Set(getDoneDeadlines());
  const { modules, moduleOfCourse } = currentModules(cfg);
  const moduleOf = (courseId) => (String(courseId).startsWith("mod-") ? courseId : moduleOfCourse.get(courseId));

  const external = readJson(CALENDAR_EVENTS, { events: [] }).events ?? [];
  const fromCalendars = external.map((e) => {
    const m = matchModule(e.title, modules);
    return {
      id: `cal|${e.uid}`,
      courseId: m ? m.mainCourseId : null,
      moduleId: m ? m.id : null,
      title: e.title,
      date: e.date,
      time: e.kind === "abgabe" && e.time !== "all day" ? `by ${e.time}` : e.end ? `${e.time}–${e.end}` : e.time,
      kind: e.kind,
      category: "calendar",
      source: "Calendar",
      start: e.start,
      url: null,
      location: e.location,
    };
  });

  const ids = new Set();
  const sameDay = new Set();
  const all = [];
  const termsByDay = new Map(); // Modul|Tag → Termine (für den Abgleich mit dem Stundenplan)
  const sources = [
    data.deadlines ?? [],
    readJson(SHEET_DEADLINES, { deadlines: [] }).deadlines ?? [],
    fromCalendars,
    aiDeadlines.list(),
  ];
  for (const list of sources) {
    for (const d0 of list) {
      const moduleId = d0.moduleId !== undefined ? d0.moduleId : moduleOf(d0.courseId) ?? null;
      const d = { ...d0, moduleId };
      const scope = moduleId ?? "none";
      const kindKey = d.kind !== "termin" ? `${scope}|${d.date}|${d.kind}` : null;
      const titleKey = `${scope}|${d.date}|${normTitle(d.title)}`;
      if (ids.has(d.id) || (kindKey && sameDay.has(kindKey) && d.category !== "exercise") || sameDay.has(titleKey)) continue;
      ids.add(d.id);
      if (kindKey) sameDay.add(kindKey);
      sameDay.add(titleKey);
      all.push(d);
      if (d.kind !== "abgabe") {
        const k = `${scope}|${d.date}`;
        termsByDay.set(k, [...(termsByDay.get(k) || []), d]);
      }
    }
  }
  // Stundenplan zuletzt: ILIAS-Sitzungen und Kalender-Abos kennen Raum und Ausnahmen besser
  for (const ev of scheduleFor(cfg, modules, moduleOfCourse).events) {
    if (ids.has(ev.id) || overlaps(termsByDay.get(`${ev.moduleId}|${ev.date}`) || [], ev)) continue;
    ids.add(ev.id);
    all.push(ev);
  }
  all.sort((a, b) => (a.date === b.date ? String(a.start).localeCompare(String(b.start)) : a.date.localeCompare(b.date)));
  return {
    updatedAt: data.updatedAt ? data.updatedAt * 1000 : null,
    deadlines: all.map((d) => ({ ...d, done: done.has(d.id) })),
  };
}

// ------------------------------------------------------------------ Module anpassen, Einstellungen

const COLORS = ["blue", "orange", "green", "plum", "ochre", "teal", "rose", "indigo"];

/** Modul umbenennen (leer = automatischer Name). Der Ordner auf dem Mac zieht mit. */
function renameModule(id, name) {
  if (typeof id !== "string" || !id.startsWith("mod-")) return { ok: false, code: "invalid", message: "Unknown course." };
  const clean = typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, 40) : "";
  const cfg = loadConfig();
  cfg.modules = cfg.modules || {};
  cfg.modules[id] = { ...(cfg.modules[id] || {}) };
  if (clean) cfg.modules[id].name = clean;
  else delete cfg.modules[id].name;
  saveConfig(cfg);
  const layout = applyLayout();
  return { ok: true, moved: layout.moved.length, deferred: !layout.ok };
}

function setModuleColor(id, color) {
  if (typeof id !== "string" || !id.startsWith("mod-")) return { ok: false, code: "invalid", message: "Unknown course." };
  const cfg = loadConfig();
  cfg.modules = cfg.modules || {};
  cfg.modules[id] = { ...(cfg.modules[id] || {}) };
  if (COLORS.includes(color)) cfg.modules[id].color = color;
  else delete cfg.modules[id].color;
  saveConfig(cfg);
  return { ok: true };
}

function getCalendars() {
  const cfg = loadConfig();
  const status = readJson(CALENDAR_EVENTS, { calendars: [] }).calendars ?? [];
  return (cfg.calendars || []).map((c) => {
    const st = status.find((s) => s.id === c.id);
    return { id: c.id, name: c.name, url: c.url, ok: st ? st.ok : null, error: st?.error ?? null, count: st?.count ?? 0 };
  });
}

function saveCalendar(url, name) {
  const cfg = loadConfig();
  cfg.calendars = cfg.calendars || [];
  const id = `cal-${Date.now().toString(36)}`;
  cfg.calendars.push({ id, url, name: String(name || "").trim().slice(0, 40) || "Calendar" });
  saveConfig(cfg);
  return id;
}

function removeCalendar(id) {
  const cfg = loadConfig();
  cfg.calendars = (cfg.calendars || []).filter((c) => c.id !== id);
  saveConfig(cfg);
  return { ok: true };
}

function setNotifications(on) {
  const cfg = loadConfig();
  cfg.notifications = Boolean(on);
  saveConfig(cfg);
  return { ok: true };
}

/** Ids der abgehakten Fristen (bleiben über Neustarts und Syncs erhalten). */
function getDoneDeadlines() {
  const data = readJson(DONE_DEADLINES, { done: {} });
  return Object.keys(data.done ?? {});
}

function setDeadlineDone(id, done) {
  if (typeof id !== "string" || id.length === 0 || id.length > 300) {
    return { ok: false, code: "invalid", message: "Invalid deadline id." };
  }
  const data = readJson(DONE_DEADLINES, { done: {} });
  data.done = data.done ?? {};
  if (done) data.done[id] = Date.now();
  else delete data.done[id];
  writeJson(DONE_DEADLINES, data);
  return { ok: true };
}

/** Nur Pfade innerhalb des Zielordners dürfen geöffnet werden. */
function insideTarget(p) {
  const cfg = loadConfig();
  if (!cfg.targetDir || typeof p !== "string") return false;
  const rel = path.relative(path.resolve(cfg.targetDir), path.resolve(p));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// ------------------------------------------------------------------ Täglicher Sync (launchd)

function xmlEscape(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function launchctl(args) {
  return new Promise((resolve) => execFile("launchctl", args, (err) => resolve(!err)));
}

// Wie oft automatisch geholt wird: täglich zur Uhrzeit oder alle x Minuten (launchd StartInterval).
const SCHEDULE_EVERY = { "30m": 30 * 60, "1h": 60 * 60, "3h": 3 * 60 * 60, daily: null };

function scheduleEvery(value) {
  return Object.hasOwn(SCHEDULE_EVERY, value) ? value : "daily";
}

async function applySchedule(isPackaged, schedule) {
  const domain = `gui/${process.getuid()}`;
  if (!schedule.enabled) {
    await launchctl(["bootout", `${domain}/${PLIST_LABEL}`]);
    await fsp.rm(PLIST, { force: true });
    return { ok: true, enabled: false };
  }
  const every = scheduleEvery(schedule.every);
  const intervalSec = SCHEDULE_EVERY[every];
  const [hour, minute] = String(schedule.time || "07:00")
    .split(":")
    .map((n) => Number.parseInt(n, 10));
  if (!(hour >= 0 && hour < 24 && minute >= 0 && minute < 60)) {
    return { ok: false, code: "invalid", message: "Enter the time as HH:MM." };
  }
  let helper;
  try {
    helper = helperCommand(isPackaged);
  } catch (e) {
    return { ok: false, code: "setup", message: e.message };
  }
  fs.mkdirSync(LOGS, { recursive: true });
  const programArgs = [helper.cmd, ...helper.args, "sync", "--auto"]
    .map((a) => `\t\t<string>${xmlEscape(a)}</string>`)
    .join("\n");
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${PLIST_LABEL}</string>
	<key>ProgramArguments</key>
	<array>
${programArgs}
	</array>
	<key>WorkingDirectory</key>
	<string>${xmlEscape(helper.cwd)}</string>
	<key>EnvironmentVariables</key>
	<dict>
		<key>STUDI_DATA_DIR</key>
		<string>${xmlEscape(DATA_DIR)}</string>
	</dict>
${
  intervalSec
    ? `\t<key>StartInterval</key>\n\t<integer>${intervalSec}</integer>`
    : `\t<key>StartCalendarInterval</key>
\t<dict>
\t\t<key>Hour</key>
\t\t<integer>${hour}</integer>
\t\t<key>Minute</key>
\t\t<integer>${minute}</integer>
\t</dict>`
}
	<key>StandardOutPath</key>
	<string>${xmlEscape(path.join(LOGS, "launchd.log"))}</string>
	<key>StandardErrorPath</key>
	<string>${xmlEscape(path.join(LOGS, "launchd.log"))}</string>
</dict>
</plist>
`;
  // Unverändert und geladen: nichts tun. „bootout“ beendet einen gerade laufenden Hintergrund-Sync,
  // und die App ruft das bei jedem Start auf (bei „alle 30 min“ läuft oft gerade einer).
  const current = fs.existsSync(PLIST) ? fs.readFileSync(PLIST, "utf8") : null;
  if (current === plist && (await scheduleLoaded())) return { ok: true, enabled: true, time: schedule.time, every };
  await launchctl(["bootout", `${domain}/${PLIST_LABEL}`]);
  fs.mkdirSync(path.dirname(PLIST), { recursive: true });
  fs.writeFileSync(PLIST, plist);
  const ok = await launchctl(["bootstrap", domain, PLIST]);
  return ok
    ? { ok: true, enabled: true, time: schedule.time, every }
    : { ok: false, code: "launchd", message: "Could not set up automatic updates." };
}

async function scheduleLoaded() {
  return launchctl(["print", `gui/${process.getuid()}/${PLIST_LABEL}`]);
}

const aiDeadlines = createAiDeadlines({ dataDir: DATA_DIR, readJson, writeJson, listFiles, loadConfig });

module.exports = {
  applyLayout,
  currentModules,
  markSeen,
  renameModule,
  setModuleColor,
  getCalendars,
  saveCalendar,
  removeCalendar,
  setNotifications,
  aiDeadlines,
  getDeadlines,
  setSlotChoice,
  getCustomEvents,
  saveCustomEvent,
  deleteCustomEvent,
  setEventHidden,
  getDoneDeadlines,
  setDeadlineDone,
  DATA_DIR,
  DEFAULT_TARGET,
  STATE,
  runHelper,
  loadConfig,
  saveConfig,
  folderName,
  readState,
  readRuns,
  startSync,
  cancelSync,
  listFiles,
  insideTarget,
  applySchedule,
  scheduleEvery,
  scheduleLoaded,
};
