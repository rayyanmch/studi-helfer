// Studi-Helfer: Electron-Hauptprozess.
//
//   npm start            lädt die Oberfläche aus web/ (Next-Dev-Server, Standard http://localhost:3000,
//                        anders per STUDI_UI_URL). Läuft der nicht, öffnet sich das Testfenster.
//   npm run test-window  öffnet direkt das schlichte Testfenster (desktop/test/).
//   Fertiges Paket       startet den mitgelieferten Next-Server (Resources/ui) lokal, siehe lib/ui-server.js.
//
// Die Oberfläche erreicht den Hintergrundteil nur über window.studi (preload.js).
// Typen dazu: web/src/lib/desktop.ts.

const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const backend = require("./lib/backend");
const { startBundledUi } = require("./lib/ui-server");

let uiUrl = process.env.STUDI_UI_URL || "http://localhost:3000";
let uiServer = null;
const TEST_MODE = process.argv.includes("--test");
const TEST_PAGE = path.join(__dirname, "test", "index.html");

app.setName("Studi-Helfer");
// Chromium-Daten (Cache usw.) in einen Unterordner, damit sie nicht zwischen config.json & Co. liegen.
app.setPath("userData", path.join(backend.DATA_DIR, "Electron"));

/** @type {Set<BrowserWindow>} */
const windows = new Set();

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    title: "Studi-Helfer",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: "#f6f5f3",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  windows.add(win);
  win.on("closed", () => windows.delete(win));
  win.once("ready-to-show", () => win.show());
  if (process.env.STUDI_DEBUG) {
    win.webContents.on("console-message", (e) => console.log(`[fenster] ${e.level}: ${e.message}`));
  }

  // Links nach außen im Browser öffnen, nie im App-Fenster.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!allowedUrl(url)) event.preventDefault();
  });

  if (TEST_MODE) {
    win.loadFile(TEST_PAGE);
  } else {
    win.loadURL(uiUrl).catch(() => {
      win.loadFile(TEST_PAGE, { query: { hinweis: `Interface at ${uiUrl} not reachable.` } });
    });
  }
  return win;
}

function allowedUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "file:") return path.resolve(decodeURIComponent(u.pathname)).startsWith(__dirname);
    return u.origin === new URL(uiUrl).origin;
  } catch {
    return false;
  }
}

/** IPC nur von eigenen Seiten annehmen (Next-Oberfläche oder Testfenster). */
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    const url = event.senderFrame?.url ?? "";
    if (!allowedUrl(url)) {
      console.error(`[ipc] ${channel} abgelehnt von ${url.split("?")[0]}`);
      throw new Error("Nicht erlaubt");
    }
    return fn(...args);
  });
}

const packaged = () => app.isPackaged;

// ------------------------------------------------------------------ Schnittstelle (window.studi)

async function getStatus() {
  const cfg = backend.loadConfig();
  const runs = backend.readRuns(1);
  const last = runs[runs.length - 1];
  return {
    loggedIn: Boolean(cfg.username),
    username: cfg.username,
    targetDir: cfg.targetDir,
    defaultTargetDir: backend.DEFAULT_TARGET,
    configured: Boolean(cfg.targetDir && cfg.courses.some((c) => c.selected)),
    schedule: { ...cfg.schedule, active: await backend.scheduleLoaded() },
    lastSync: last ? { at: last.end * 1000, status: last.status, added: last.added.length } : null,
    sync: backend.readState(),
  };
}

async function login(username, password) {
  if (typeof username !== "string" || typeof password !== "string") {
    return { ok: false, code: "wrong_password", message: "Enter your university username and password." };
  }
  if (password.includes("\n")) {
    return { ok: false, code: "wrong_password", message: "The password contains invalid characters." };
  }
  const res = await backend.runHelper(packaged(), ["login", "--username", username.trim()], {
    stdin: `${password}\n`,
    timeoutMs: 60_000,
  });
  if (res.type !== "result") return { ok: false, code: res.code, message: res.message };
  const cfg = backend.loadConfig();
  if (cfg.username && cfg.username !== res.username) {
    // Anderes Konto: alte Kursauswahl passt nicht mehr.
    cfg.courses = [];
  }
  cfg.username = res.username;
  backend.saveConfig(cfg);
  return { ok: true, username: res.username };
}

async function logout() {
  const cfg = backend.loadConfig();
  if (cfg.username) await backend.runHelper(packaged(), ["logout", "--username", cfg.username]);
  cfg.username = null;
  cfg.schedule = { ...cfg.schedule, enabled: false };
  backend.saveConfig(cfg);
  await backend.applySchedule(packaged(), cfg.schedule);
  return { ok: true };
}

async function listCourses() {
  const res = await backend.runHelper(packaged(), ["courses"], { timeoutMs: 90_000 });
  if (res.type !== "result") return { ok: false, code: res.code, message: res.message };
  const cfg = backend.loadConfig();
  const saved = new Map(cfg.courses.map((c) => [c.id, c]));
  const firstSetup = cfg.courses.length === 0;
  const courses = res.courses.map((c) => {
    const s = saved.get(c.id);
    return {
      id: c.id,
      kind: c.kind,
      refId: c.refId,
      title: c.title,
      semester: c.semester,
      suggested: c.suggested,
      selected: s ? Boolean(s.selected) : firstSetup && c.suggested,
      videos: s ? Boolean(s.videos) : false,
    };
  });
  return { ok: true, courses };
}

/**
 * Speichert Zielordner und Kursauswahl. Ordnernamen werden einmal vergeben und bleiben dann stabil.
 * @param {{targetDir?: string, courses: {id: string, kind: string, refId: string, title: string, selected: boolean, videos?: boolean}[]}} setup
 */
async function saveSetup(setup) {
  const cfg = backend.loadConfig();
  if (!setup || !Array.isArray(setup.courses)) {
    return { ok: false, code: "invalid", message: "Invalid setup." };
  }
  const targetDir = setup.targetDir || cfg.targetDir || backend.DEFAULT_TARGET;
  if (!path.isAbsolute(targetDir)) {
    return { ok: false, code: "invalid", message: "The destination folder must be an absolute path." };
  }
  const saved = new Map(cfg.courses.map((c) => [c.id, c]));
  const used = new Set();
  const courses = [];
  for (const c of setup.courses) {
    if (!/^(crs|grp)-\d+$/.test(c.id) || String(c.refId) !== c.id.split("-")[1]) continue;
    let folder = saved.get(c.id)?.folder || backend.folderName(String(c.title));
    if (used.has(folder.toLowerCase())) folder = `${folder} (${c.refId})`;
    used.add(folder.toLowerCase());
    courses.push({
      id: c.id,
      kind: c.kind === "grp" ? "grp" : "crs",
      refId: String(c.refId),
      title: String(c.title),
      folder,
      selected: Boolean(c.selected),
      videos: Boolean(c.videos),
    });
  }
  cfg.targetDir = targetDir;
  cfg.courses = courses;
  const firstSchedule = !fs.existsSync(path.join(backend.DATA_DIR, "schedule-set"));
  if (firstSchedule) {
    cfg.schedule = { enabled: true, time: "07:00" };
    fs.writeFileSync(path.join(backend.DATA_DIR, "schedule-set"), "");
  }
  backend.saveConfig(cfg);
  if (firstSchedule) await backend.applySchedule(packaged(), cfg.schedule);
  return { ok: true };
}

async function chooseFolder() {
  const cfg = backend.loadConfig();
  const start = cfg.targetDir || backend.DEFAULT_TARGET;
  const res = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() ?? undefined, {
    title: "Destination folder for ILIAS files",
    defaultPath: fs.existsSync(start) ? start : path.dirname(start),
    properties: ["openDirectory", "createDirectory", "promptToCreate"],
    buttonLabel: "Choose",
  });
  return res.canceled ? null : res.filePaths[0];
}

async function setSchedule(schedule) {
  const cfg = backend.loadConfig();
  cfg.schedule = {
    enabled: Boolean(schedule?.enabled),
    time: typeof schedule?.time === "string" ? schedule.time : cfg.schedule.time,
  };
  const res = await backend.applySchedule(packaged(), cfg.schedule);
  if (res.ok) backend.saveConfig(cfg);
  return res;
}

async function openFile(p) {
  if (!backend.insideTarget(p)) return { ok: false, code: "invalid", message: "This path is outside the destination folder." };
  const err = await shell.openPath(p);
  return err ? { ok: false, code: "open", message: err } : { ok: true };
}

function revealFile(p) {
  if (!backend.insideTarget(p)) return { ok: false, code: "invalid", message: "This path is outside the destination folder." };
  shell.showItemInFolder(p);
  return { ok: true };
}

handle("studi:getStatus", getStatus);
handle("studi:login", login);
handle("studi:logout", logout);
handle("studi:listCourses", listCourses);
handle("studi:saveSetup", saveSetup);
handle("studi:chooseFolder", chooseFolder);
handle("studi:startSync", () => {
  if (process.env.STUDI_DEBUG) console.log("[sync] Start angefordert (Oberfläche)", new Date().toISOString());
  return backend.startSync(packaged());
});
handle("studi:cancelSync", () => {
  if (process.env.STUDI_DEBUG) console.log("[sync] Abbruch angefordert (Oberfläche)", new Date().toISOString());
  return backend.cancelSync();
});
handle("studi:getSyncState", () => backend.readState());
handle("studi:getRuns", (limit) => backend.readRuns(Math.min(Number(limit) || 20, 200)));
handle("studi:getFiles", () => backend.listFiles());
handle("studi:openFile", openFile);
handle("studi:revealFile", revealFile);
handle("studi:setSchedule", setSchedule);
handle("studi:getDeadlines", () => backend.getDeadlines());
handle("studi:refreshDeadlines", async () => {
  const res = await backend.runHelper(packaged(), ["deadlines"], { timeoutMs: 180_000 });
  return res.type === "result"
    ? { ok: true, count: res.count }
    : { ok: false, code: res.code, message: res.message };
});
handle("studi:refreshAiDeadlines", () => runAiDeadlines());
handle("studi:getDoneDeadlines", () => backend.getDoneDeadlines());
handle("studi:setDeadlineDone", (id, done) => backend.setDeadlineDone(id, Boolean(done)));

// ------------------------------------------------------------------ Sync-Stand an die Fenster schicken

/** KI-Fristen aus neuen Übungsblättern holen (Server-Route in web/, siehe lib/ai-deadlines.js). */
async function runAiDeadlines() {
  const cfg = backend.loadConfig();
  if (!cfg.targetDir || !cfg.courses.some((c) => c.selected)) {
    return { ok: false, code: "not_configured", message: "No courses set up yet." };
  }
  const aiUrl = process.env.STUDI_AI_URL || uiUrl;
  const res = await backend.aiDeadlines.run(aiUrl);
  if (res.analyzed > 0) for (const win of windows) win.webContents.send("studi:deadlinesChanged");
  if (!res.ok && process.env.STUDI_DEBUG) console.log("[ki-fristen]", res.code, res.message);
  return res;
}

let lastStateText = "";
let wasRunning = false;
function pushState() {
  let text = "";
  try {
    text = fs.readFileSync(backend.STATE, "utf8");
  } catch {
    return;
  }
  if (text === lastStateText) return;
  lastStateText = text;
  const state = backend.readState();
  for (const win of windows) win.webContents.send("studi:syncState", state);
  // Sync gerade fertig: Fristen haben sich ggf. geändert, neue Übungsblätter auswerten.
  if (wasRunning && !state.running) {
    for (const win of windows) win.webContents.send("studi:deadlinesChanged");
    runAiDeadlines();
  }
  wasRunning = Boolean(state.running);
}

// ------------------------------------------------------------------ Start

app.whenReady().then(async () => {
  if (app.isPackaged && !process.env.STUDI_UI_URL && !TEST_MODE) {
    try {
      uiServer = await startBundledUi(
        path.join(process.resourcesPath, "ui"),
        path.join(backend.DATA_DIR, "logs", "ui-server.log"),
      );
      uiUrl = uiServer.url;
    } catch (e) {
      console.error(e);
    }
  }
  createWindow();

  // Liegt die App jetzt woanders (z. B. nach /Applications verschoben), zeigt der launchd-Job
  // sonst auf den alten Pfad. Deshalb beim Start neu schreiben.
  const startCfg = backend.loadConfig();
  if (startCfg.schedule?.enabled) backend.applySchedule(packaged(), startCfg.schedule);
  setInterval(pushState, 700);
  // Kurz nach dem Start Übungsblätter auswerten, die noch nicht ausgewertet sind (z. B. aus dem 7-Uhr-Sync).
  setTimeout(() => runAiDeadlines(), 15_000);

  // Beim App-Start synchronisieren, wenn der letzte Lauf länger als 6 Stunden her ist.
  const cfg = backend.loadConfig();
  const last = backend.readRuns(1).pop();
  const configured = cfg.username && cfg.targetDir && cfg.courses.some((c) => c.selected);
  if (configured && (!last || Date.now() - last.end * 1000 > 6 * 3600_000)) {
    if (process.env.STUDI_DEBUG) console.log("[sync] Start beim App-Start");
    backend.startSync(packaged());
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => uiServer?.stop());

app.on("window-all-closed", () => {
  // Mac-typisch: App bleibt im Dock. Der tägliche Sync läuft ohnehin über launchd.
  if (process.platform !== "darwin") app.quit();
});
