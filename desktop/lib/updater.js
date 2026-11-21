// Update-Knopf für Tester (Rayyan, Mika): holt die neueste Fassung der App von GitHub.
//
// GitHub Actions (.github/workflows/app-build.yml) baut bei jedem Push auf main die App und legt sie in das
// Release „latest“: Studi-Helfer-arm64.zip (das .app) und latest.json (Commit, Zeit, Nachricht).
// Die App kennt ihren eigenen Stand aus Resources/build-info.json (schreibt scripts/after-pack.js).
//
// Ablauf beim Update: zip herunterladen (mit Fortschritt und Restzeit) → neben das laufende .app entpacken →
// Stand prüfen → kleines Skript tauscht das .app aus, sobald die App beendet ist, und öffnet sie wieder.
// Nur in der fertigen App; in der Entwicklung (npm start) kommt der neue Stand per git.

const { app } = require("electron");
const { spawn, execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { Readable, Transform } = require("node:stream");

const REPO = "rayyanmch/studi-helfer";
const RELEASE = `https://github.com/${REPO}/releases/download/latest`;
const AUTO_CHECK_MS = 60 * 60 * 1000; // stündlich nachsehen, solange die App läuft

/**
 * @typedef {{ sha: string, committedAt: string, message: string }} BuildInfo
 * @typedef {{
 *   status: "dev" | "idle" | "checking" | "current" | "available" | "downloading" | "installing" | "error",
 *   current: BuildInfo | null,
 *   latest: (BuildInfo & { zip: string, size: number }) | null,
 *   progress: { received: number, total: number, etaSeconds: number | null } | null,
 *   checkedAt: number | null,
 *   message: string | null,
 *   manual: boolean,
 * }} UpdateState
 */

/** @type {UpdateState} */
let state = {
  status: "idle",
  current: null,
  latest: null,
  progress: null,
  checkedAt: null,
  message: null,
  manual: false,
};
let getWindows = () => [];
let busy = null;

function readBuildInfo() {
  try {
    const info = JSON.parse(fs.readFileSync(path.join(process.resourcesPath, "build-info.json"), "utf8"));
    return info && typeof info.sha === "string" ? info : null;
  } catch {
    return null;
  }
}

// Protokoll für Updates (Fehler und Schritte), damit sich Probleme später nachvollziehen lassen
function logFile() {
  try {
    return path.join(require("./backend").DATA_DIR, "logs", "update.log");
  } catch {
    return path.join(os.tmpdir(), "studi-helfer-update.log");
  }
}

function log(msg) {
  try {
    fs.mkdirSync(path.dirname(logFile()), { recursive: true });
    fs.appendFileSync(logFile(), `${new Date().toISOString()} ${msg}\n`);
  } catch {
    // Protokoll ist nur eine Hilfe
  }
}

const PENDING = () => path.join(path.dirname(path.dirname(logFile())), "update-pending.json");

function setState(patch) {
  state = { ...state, ...patch };
  for (const win of getWindows()) {
    if (!win.isDestroyed()) win.webContents.send("studi:updateState", state);
  }
}

/** Pfad des laufenden .app (…/Studi-Helfer.app), aus …/Contents/MacOS/Studi-Helfer. */
function bundlePath() {
  return path.resolve(process.execPath, "..", "..", "..");
}

/** Warum sich das .app an seinem Ort nicht austauschen lässt (oder null). */
function installProblem() {
  const bundle = bundlePath();
  const move = "Move Studi-Helfer to your Applications folder, open it from there and try again.";
  if (!bundle.endsWith(".app")) return "Can't find the app on disk.";
  if (bundle.startsWith("/Volumes/") || bundle.includes("/AppTranslocation/")) return move;
  try {
    fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
    fs.accessSync(bundle, fs.constants.W_OK);
  } catch {
    return `No permission to replace the app in ${path.dirname(bundle)}. ${move}`;
  }
  return null;
}

async function fetchLatest() {
  const res = await fetch(`${RELEASE}/latest.json?t=${Date.now()}`, {
    signal: AbortSignal.timeout(15_000),
    headers: { "cache-control": "no-cache" },
  });
  if (res.status === 404) throw new Error("No build on GitHub yet.");
  if (!res.ok) throw new Error(`GitHub answered ${res.status}.`);
  const latest = await res.json();
  if (typeof latest.sha !== "string" || typeof latest.zip !== "string" || !/^[\w.-]+\.zip$/.test(latest.zip)) {
    throw new Error("The build on GitHub looks incomplete.");
  }
  return latest;
}

/** Ist `latest` neuer als `current`? Gleicher Commit = aktuell; eigener (lokaler) Build neuer = aktuell. */
function isNewer(latest, current) {
  if (!current) return true;
  if (latest.sha === current.sha) return false;
  const a = Date.parse(latest.committedAt);
  const b = Date.parse(current.committedAt);
  return Number.isNaN(a) || Number.isNaN(b) || a > b;
}

/**
 * Nachsehen, ob es eine neuere Fassung gibt.
 * @param {{ manual?: boolean }} [opts] manual = vom Knopf (Oberfläche zeigt dann auch „up to date“ und Fehler)
 */
async function check({ manual = true } = {}) {
  if (state.status === "dev") return state;
  if (state.status === "downloading" || state.status === "installing") return state;
  if (busy) return busy;
  busy = (async () => {
    setState({ status: "checking", manual, message: null });
    try {
      const latest = await fetchLatest();
      const newer = isNewer(latest, state.current);
      setState({
        status: newer ? "available" : "current",
        latest,
        checkedAt: Date.now(),
      });
    } catch (e) {
      const offline = e.name === "TimeoutError" || /fetch failed|ENOTFOUND|ECONN/i.test(String(e.message) + (e.cause?.code ?? ""));
      setState({
        status: "error",
        checkedAt: Date.now(),
        message: offline ? "Couldn't reach GitHub. Check your internet connection and try again." : e.message,
      });
    }
    return state;
  })().finally(() => {
    busy = null;
  });
  return busy;
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 5 * 60_000 }, (err, _out, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve()));
  });
}

/** Zip mit Fortschritt und geschätzter Restzeit herunterladen. */
async function download(url, file, expectedSize) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}).`);
  const total = Number(res.headers.get("content-length")) || expectedSize || 0;
  let received = 0;
  const started = Date.now();
  let lastSent = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      const now = Date.now();
      if (now - lastSent > 250) {
        lastSent = now;
        const elapsed = (now - started) / 1000;
        const rate = received / Math.max(elapsed, 0.001);
        // Erst nach 2 s schätzen, vorher schwankt die Rate zu stark.
        const etaSeconds = total && elapsed > 2 ? Math.max(0, Math.round((total - received) / rate)) : null;
        setState({ progress: { received, total, etaSeconds } });
      }
      cb(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(file));
  if (total && received !== total) throw new Error("Download was incomplete. Try again.");
  setState({ progress: { received, total: total || received, etaSeconds: 0 } });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Lädt die neueste Fassung herunter und entpackt sie nach `staging`. Liefert den Pfad zum neuen .app und seinen Stand.
 * Bei jedem Versuch wird latest.json frisch gelesen: Wir pushen oft, und während GitHub Actions eine neue Fassung
 * hochlädt, kann die zip kurz fehlen, unvollständig sein oder schon neuer sein als die zuletzt gesehene latest.json.
 */
async function fetchBuild(tmp, staging) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const latest = await fetchLatest();
      if (!isNewer(latest, state.current)) return { upToDate: true };
      setState({ latest, status: "downloading", progress: { received: 0, total: latest.size || 0, etaSeconds: null } });
      log(`Versuch ${attempt}: lade ${latest.sha.slice(0, 7)} (${latest.size} Bytes)`);
      const zip = path.join(tmp, latest.zip);
      fs.rmSync(zip, { force: true });
      await download(`${RELEASE}/${latest.zip}?t=${Date.now()}`, zip, latest.size);

      setState({ status: "installing", progress: null });
      fs.rmSync(staging, { recursive: true, force: true });
      fs.mkdirSync(staging);
      await run("/usr/bin/ditto", ["-x", "-k", zip, staging]);
      fs.rmSync(zip, { force: true });
      const fresh = fs.readdirSync(staging).find((n) => n.endsWith(".app"));
      if (!fresh) throw new Error("The download contains no app.");
      const freshApp = path.join(staging, fresh);
      const info = JSON.parse(fs.readFileSync(path.join(freshApp, "Contents", "Resources", "build-info.json"), "utf8"));
      // Andere Fassung als erwartet: Ist sie trotzdem neuer als die installierte, nehmen wir sie (gerade erst hochgeladen).
      if (info.sha === latest.sha || isNewer(info, state.current)) {
        log(`entpackt: ${info.sha.slice(0, 7)}${info.sha === latest.sha ? "" : ` (latest.json zeigte ${latest.sha.slice(0, 7)})`}`);
        return { freshApp, info };
      }
      throw Object.assign(new Error(`zip enthält ${info.sha.slice(0, 7)}, erwartet ${latest.sha.slice(0, 7)}`), { stale: true });
    } catch (e) {
      lastError = e;
      log(`Versuch ${attempt} fehlgeschlagen: ${e.name}: ${e.message}${e.cause?.code ? ` (${e.cause.code})` : ""}`);
      if (attempt < 3) await sleep(attempt * 5000);
    }
  }
  throw lastError;
}

/** Neueste Fassung laden, austauschen und die App neu starten. */
async function install() {
  if ((state.status !== "available" && state.status !== "error") || !state.latest) return { ok: false, code: "invalid", message: "No update available." };
  const problem = installProblem();
  if (problem) {
    log(`nicht möglich: ${problem}`);
    setState({ status: "error", manual: true, message: problem });
    return { ok: false, code: "invalid", message: problem };
  }
  const bundle = bundlePath();
  const parent = path.dirname(bundle);
  // Zum Entpacken neben das .app, damit der Austausch ein einfaches Umbenennen ist.
  const staging = path.join(parent, ".studi-helfer-update");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studi-helfer-update-"));
  try {
    setState({ status: "downloading", manual: true, message: null, progress: { received: 0, total: state.latest.size || 0, etaSeconds: null } });
    const build = await fetchBuild(tmp, staging);
    if (build.upToDate) {
      fs.rmSync(tmp, { recursive: true, force: true });
      setState({ status: "current", progress: null, message: null });
      return { ok: true };
    }
    const { freshApp, info } = build;
    // Läuft gerade ein Sync, nutzt er das Hilfsprogramm im .app. Abbrechen, fertige Dateien bleiben.
    try {
      const backend = require("./backend");
      if (backend.readState().running) backend.cancelSync();
    } catch {
      // egal, der Austausch klappt trotzdem
    }

    const script = path.join(tmp, "swap.sh");
    fs.writeFileSync(
      script,
      `#!/bin/bash
# Wartet, bis Studi-Helfer beendet ist, tauscht das .app aus und startet es neu. Schritte landen im Update-Protokoll.
PID="$1"; NEW="$2"; OLD="$3"; STAGING="$4"; LOG="$5"
log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) swap: $*" >> "$LOG"; }
for _ in $(seq 1 120); do kill -0 "$PID" 2>/dev/null || break; sleep 0.5; done
kill -0 "$PID" 2>/dev/null && log "App läuft nach 60 s noch, tausche trotzdem"
/usr/bin/xattr -cr "$NEW" 2>/dev/null
BACKUP="$OLD.old-$$"
if ERR=$(mv "$OLD" "$BACKUP" 2>&1); then
  if ERR=$(mv "$NEW" "$OLD" 2>&1); then rm -rf "$BACKUP"; log "ok"; else log "neues .app nicht verschoben: $ERR"; mv "$BACKUP" "$OLD"; fi
else
  log "altes .app nicht verschoben: $ERR"
fi
rm -rf "$STAGING"
/usr/bin/open "$OLD" || log "öffnen fehlgeschlagen"
`,
      { mode: 0o755 },
    );
    try {
      fs.writeFileSync(PENDING(), JSON.stringify({ sha: info.sha, at: Date.now() }));
    } catch {
      // nur für die Meldung nach dem Neustart
    }
    log(`tausche aus: ${state.current?.sha?.slice(0, 7) ?? "?"} → ${info.sha.slice(0, 7)}`);
    const child = spawn("/bin/bash", [script, String(process.pid), freshApp, bundle, staging, logFile()], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    setTimeout(() => app.quit(), 300);
    // Falls etwas das Beenden aufhält: spätestens nach 8 s hart beenden, sonst wartet das Skript ewig.
    setTimeout(() => app.exit(0), 8000).unref();
    return { ok: true };
  } catch (e) {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
    const offline = /fetch failed|ENOTFOUND|ECONN|TimeoutError/i.test(`${e.name} ${e.message} ${e.cause?.code ?? ""}`);
    const uploading = e.stale || /\((404|403)\)|incomplete/i.test(e.message);
    const message = offline
      ? "The download stopped. Check your internet connection and try again."
      : uploading
        ? "The newest version is still being uploaded. Try again in a few minutes."
        : e.message;
    log(`abgebrochen: ${message}`);
    setState({ status: "available", manual: true, progress: null, message });
    return { ok: false, code: offline ? "unreachable" : "internal", message };
  }
}

/**
 * IPC-Kanäle anmelden und automatisch nachsehen.
 * @param {(channel: string, fn: (...args: any[]) => any) => void} handle main.js-Helfer (prüft den Absender)
 * @param {() => Iterable<import("electron").BrowserWindow>} windows
 */
function register(handle, windows) {
  getWindows = () => [...windows()];
  state.current = app.isPackaged ? readBuildInfo() : null;
  if (!app.isPackaged) state.status = "dev";
  try {
    const pending = JSON.parse(fs.readFileSync(PENDING(), "utf8"));
    fs.rmSync(PENDING(), { force: true });
    if (state.current && pending.sha !== state.current.sha && Date.now() - pending.at < 15 * 60_000) {
      log(`nach Neustart noch alte Fassung ${state.current.sha.slice(0, 7)} (erwartet ${pending.sha.slice(0, 7)})`);
      state.message = "The last update couldn't be installed. Please try again.";
    } else if (state.current) {
      log(`läuft jetzt: ${state.current.sha.slice(0, 7)}`);
    }
  } catch {
    // kein Update ausstehend
  }
  handle("studi:getUpdateState", () => state);
  handle("studi:checkForUpdate", () => check({ manual: true }));
  handle("studi:installUpdate", () => install());
  if (app.isPackaged) {
    setTimeout(() => check({ manual: false }), 15_000).unref();
    setInterval(() => {
      if (state.status === "idle" || state.status === "current" || state.status === "error") check({ manual: false });
    }, AUTO_CHECK_MS).unref();
  }
}

module.exports = { register, check, install };
