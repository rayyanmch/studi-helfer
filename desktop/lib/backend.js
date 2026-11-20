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

const DATA_DIR = path.join(os.homedir(), "Library", "Application Support", "Studi-Helfer");
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
      `Python-Umgebung fehlt: ${python}. Einmal "services/ilias-sync/setup.sh" ausführen.`,
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
      resolve({ type: "error", code: "setup", message: `Helfer startet nicht: ${e.message}` });
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
        message: (err || out).trim().split("\n").slice(-3).join(" ") || `Helfer beendet (${code})`,
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
    schedule: { enabled: false, time: "07:00" },
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
  if (state.running) return { ok: false, code: "busy", message: "Es läuft bereits ein Sync." };
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
  if (!state.running || !state.pid) return { ok: false, code: "invalid", message: "Es läuft kein Sync." };
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
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1).replace(".", ",")} GB`;
}

function formatDate(d) {
  const now = new Date();
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return `Heute, ${time}`;
  if (diff === 1) return "Gestern";
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("de-DE", {
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

/**
 * Dateien im Zielordner in der Form von web/src/lib/mock-data.ts (Kurs → Ordner → Datei).
 * Ordnername = Pfad innerhalb des Kurses ("Vorlesung/Woche 1"), Dateien direkt im Kurs: "Allgemein".
 */
async function listFiles() {
  const cfg = loadConfig();
  if (!cfg.targetDir) return [];
  const last = readRuns(10)
    .reverse()
    .find((r) => r.status !== "offline");
  const fresh = new Set((last?.added ?? []).map((a) => `${a.course}\u0000${a.path}`));
  const changed = new Map((last?.changed ?? []).map((c) => [`${c.course}\u0000${c.path}`, c.previous ?? null]));

  const courses = [];
  for (const c of cfg.courses.filter((x) => x.selected)) {
    const root = path.join(cfg.targetDir, c.folder || folderName(c.title));
    const files = [];
    await walk(root, root, files);
    const folders = new Map();
    files.sort((a, b) => a.rel.localeCompare(b.rel, "de", { numeric: true }));
    for (const f of files) {
      const dir = path.dirname(f.rel);
      const key = dir === "." ? "" : dir;
      if (!folders.has(key)) {
        folders.set(key, { id: `${c.id}:${key || "."}`, name: key || "Allgemein", files: [] });
      }
      const ext = path.extname(f.rel).slice(1).toLowerCase();
      folders.get(key).files.push({
        id: `${c.id}:${f.rel}`,
        name: path.basename(f.rel),
        kind: KINDS[ext] ?? "other",
        size: formatSize(f.size),
        updated: formatDate(f.mtime),
        isNew: fresh.has(`${c.id}\u0000${f.rel}`),
        isChanged: changed.has(`${c.id}\u0000${f.rel}`),
        previousVersion: changed.get(`${c.id}\u0000${f.rel}`) ?? undefined,
        path: f.full,
        modifiedAt: f.mtime.getTime(),
      });
    }
    courses.push({
      id: c.id,
      name: c.title,
      lecturer: "",
      total: files.length,
      folder: root,
      folders: [...folders.values()].sort((a, b) =>
        a.name === "Allgemein" ? -1 : b.name === "Allgemein" ? 1 : a.name.localeCompare(b.name, "de"),
      ),
    });
  }
  return courses;
}

// ------------------------------------------------------------------ Fristen

const DONE_DEADLINES = path.join(DATA_DIR, "deadlines-done.json");
const DEADLINES = path.join(DATA_DIR, "deadlines.json");

/**
 * Fristen/Termine: ILIAS-Kalender (letzter Stand, sofort verfügbar) plus KI-Fristen aus Übungsblättern,
 * jeweils mit abgehakt ja/nein. Steht dieselbe Abgabe schon im ILIAS-Kalender (gleicher Kurs, gleicher Tag),
 * gewinnt ILIAS.
 */
function getDeadlines() {
  const data = readJson(DEADLINES, { updatedAt: null, deadlines: [] });
  const done = new Set(getDoneDeadlines());
  const ilias = data.deadlines ?? [];
  const ids = new Set(ilias.map((d) => d.id));
  const iliasAbgaben = new Set(ilias.filter((d) => d.kind === "abgabe").map((d) => `${d.courseId}|${d.date}`));
  const ai = aiDeadlines
    .list()
    .filter((d) => !ids.has(d.id) && !(d.kind === "abgabe" && iliasAbgaben.has(`${d.courseId}|${d.date}`)));
  const all = [...ilias, ...ai].sort((a, b) =>
    a.date === b.date ? String(a.start).localeCompare(String(b.start)) : a.date.localeCompare(b.date),
  );
  return {
    updatedAt: data.updatedAt ? data.updatedAt * 1000 : null,
    deadlines: all.map((d) => ({ ...d, done: done.has(d.id) })),
  };
}

/** Ids der abgehakten Fristen (bleiben über Neustarts und Syncs erhalten). */
function getDoneDeadlines() {
  const data = readJson(DONE_DEADLINES, { done: {} });
  return Object.keys(data.done ?? {});
}

function setDeadlineDone(id, done) {
  if (typeof id !== "string" || id.length === 0 || id.length > 300) {
    return { ok: false, code: "invalid", message: "Ungültige Frist-Id." };
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

async function applySchedule(isPackaged, schedule) {
  const domain = `gui/${process.getuid()}`;
  await launchctl(["bootout", `${domain}/${PLIST_LABEL}`]);
  if (!schedule.enabled) {
    await fsp.rm(PLIST, { force: true });
    return { ok: true, enabled: false };
  }
  const [hour, minute] = String(schedule.time || "07:00")
    .split(":")
    .map((n) => Number.parseInt(n, 10));
  if (!(hour >= 0 && hour < 24 && minute >= 0 && minute < 60)) {
    return { ok: false, code: "invalid", message: "Uhrzeit im Format HH:MM angeben." };
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
	<key>StartCalendarInterval</key>
	<dict>
		<key>Hour</key>
		<integer>${hour}</integer>
		<key>Minute</key>
		<integer>${minute}</integer>
	</dict>
	<key>StandardOutPath</key>
	<string>${xmlEscape(path.join(LOGS, "launchd.log"))}</string>
	<key>StandardErrorPath</key>
	<string>${xmlEscape(path.join(LOGS, "launchd.log"))}</string>
</dict>
</plist>
`;
  fs.mkdirSync(path.dirname(PLIST), { recursive: true });
  fs.writeFileSync(PLIST, plist);
  const ok = await launchctl(["bootstrap", domain, PLIST]);
  return ok
    ? { ok: true, enabled: true, time: schedule.time }
    : { ok: false, code: "launchd", message: "Täglicher Sync konnte nicht eingerichtet werden." };
}

async function scheduleLoaded() {
  return launchctl(["print", `gui/${process.getuid()}/${PLIST_LABEL}`]);
}

const aiDeadlines = createAiDeadlines({ dataDir: DATA_DIR, readJson, writeJson, listFiles, loadConfig });

module.exports = {
  aiDeadlines,
  getDeadlines,
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
  scheduleLoaded,
};
