// Studi-Helfer: Electron-Hauptprozess.
//
//   npm start            lädt die Oberfläche aus web/ (Next-Dev-Server, Standard http://localhost:3000,
//                        anders per STUDI_UI_URL). Läuft der nicht, öffnet sich das Testfenster.
//   npm run test-window  öffnet direkt das schlichte Testfenster (desktop/test/).
//
// Die Oberfläche erreicht den Hintergrundteil nur über window.studi (preload.js).
// Typen dazu: web/src/lib/desktop.ts.

const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const backend = require("./lib/backend");

const UI_URL = process.env.STUDI_UI_URL || "http://localhost:3000";
const TEST_MODE = process.argv.includes("--test");
const TEST_PAGE = path.join(__dirname, "test", "index.html");

app.setName("Studi-Helfer");

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
    win.loadURL(UI_URL).catch(() => {
      win.loadFile(TEST_PAGE, { query: { hinweis: `Oberfläche unter ${UI_URL} nicht erreichbar.` } });
    });
  }
  return win;
}

function allowedUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "file:") return path.resolve(decodeURIComponent(u.pathname)).startsWith(__dirname);
    return u.origin === new URL(UI_URL).origin;
  } catch {
    return false;
  }
}

/** IPC nur von eigenen Seiten annehmen (Next-Oberfläche oder Testfenster). */
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    const url = event.senderFrame?.url ?? "";
    if (!allowedUrl(url)) throw new Error(`Nicht erlaubt: ${url}`);
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
    return { ok: false, code: "wrong_password", message: "Uni-Kennung und Passwort eingeben." };
  }
  if (password.includes("\n")) {
    return { ok: false, code: "wrong_password", message: "Passwort enthält ungültige Zeichen." };
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
    return { ok: false, code: "invalid", message: "Ungültige Einrichtung." };
  }
  const targetDir = setup.targetDir || cfg.targetDir || backend.DEFAULT_TARGET;
  if (!path.isAbsolute(targetDir)) {
    return { ok: false, code: "invalid", message: "Zielordner muss ein absoluter Pfad sein." };
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
    title: "Zielordner für ILIAS-Dateien",
    defaultPath: fs.existsSync(start) ? start : path.dirname(start),
    properties: ["openDirectory", "createDirectory", "promptToCreate"],
    buttonLabel: "Auswählen",
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
  if (!backend.insideTarget(p)) return { ok: false, code: "invalid", message: "Pfad liegt nicht im Zielordner." };
  const err = await shell.openPath(p);
  return err ? { ok: false, code: "open", message: err } : { ok: true };
}

function revealFile(p) {
  if (!backend.insideTarget(p)) return { ok: false, code: "invalid", message: "Pfad liegt nicht im Zielordner." };
  shell.showItemInFolder(p);
  return { ok: true };
}

handle("studi:getStatus", getStatus);
handle("studi:login", login);
handle("studi:logout", logout);
handle("studi:listCourses", listCourses);
handle("studi:saveSetup", saveSetup);
handle("studi:chooseFolder", chooseFolder);
handle("studi:startSync", () => backend.startSync(packaged()));
handle("studi:getSyncState", () => backend.readState());
handle("studi:getRuns", (limit) => backend.readRuns(Math.min(Number(limit) || 20, 200)));
handle("studi:getFiles", () => backend.listFiles());
handle("studi:openFile", openFile);
handle("studi:revealFile", revealFile);
handle("studi:setSchedule", setSchedule);

// ------------------------------------------------------------------ Sync-Stand an die Fenster schicken

let lastStateText = "";
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
}

// ------------------------------------------------------------------ Start

app.whenReady().then(() => {
  createWindow();
  setInterval(pushState, 700);

  // Beim App-Start synchronisieren, wenn der letzte Lauf länger als 6 Stunden her ist.
  const cfg = backend.loadConfig();
  const last = backend.readRuns(1).pop();
  const configured = cfg.username && cfg.targetDir && cfg.courses.some((c) => c.selected);
  if (configured && (!last || Date.now() - last.end * 1000 > 6 * 3600_000)) {
    backend.startSync(packaged());
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // Mac-typisch: App bleibt im Dock. Der tägliche Sync läuft ohnehin über launchd.
  if (process.platform !== "darwin") app.quit();
});
