// Ordo (früher Studi-Helfer): Electron-Hauptprozess.
//
//   npm start            lädt die Oberfläche aus web/ (Next-Dev-Server, Standard http://localhost:3000,
//                        anders per STUDI_UI_URL). Läuft der nicht, öffnet sich das Testfenster.
//   npm run test-window  öffnet direkt das schlichte Testfenster (desktop/test/).
//   Fertiges Paket       startet den mitgelieferten Next-Server (Resources/ui) lokal, siehe lib/ui-server.js.
//
// Die Oberfläche erreicht den Hintergrundteil nur über window.studi (preload.js).
// Typen dazu: web/src/lib/desktop.ts.

const { app, BrowserWindow, Menu, Notification, dialog, ipcMain, nativeImage, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const backend = require("./lib/backend");
const { buildModules } = require("./lib/modules");
const { startBundledUi } = require("./lib/ui-server");
const updater = require("./lib/updater");
const google = require("./lib/google");
const unimail = require("./lib/unimail");
const mailtools = require("./lib/mailtools");
const vpn = require("./lib/vpn");
const places = require("./lib/places");
const study = require("./lib/study");
const { createMensa } = require("./lib/mensa");
const { createReminders, todayCount } = require("./lib/reminders");
const { createLearnmods } = require("./lib/learnmods");
const mensa = createMensa({ dataDir: backend.DATA_DIR });
const learnmods = createLearnmods({ backend, BrowserWindow });

/** Selbstlerneinheiten aus dem letzten Sync als PDF in die Kursordner drucken, danach Dateien neu laden. */
async function renderLearnmods() {
  try {
    const n = await learnmods.renderPending();
    if (n > 0) for (const win of windows) win.webContents.send("studi:filesChanged");
  } catch (e) {
    console.error("[learnmods]", e);
  }
}

/** Seitenformat neuer PDFs lesen (Querformat = Folien, für die Dokument-Art), danach Dateien neu laden. */
async function refreshShapes() {
  try {
    if (await backend.refreshShapes(packaged())) for (const win of windows) win.webContents.send("studi:filesChanged");
  } catch (e) {
    console.error("[pdf-shapes]", e);
  }
}

let uiUrl = process.env.STUDI_UI_URL || "http://localhost:3000";
let uiServer = null;
const TEST_MODE = process.argv.includes("--test");
const TEST_PAGE = path.join(__dirname, "test", "index.html");

// Sichtbarer Name ist „Ordo“ (Menü, Fenster, Bundle über build.productName). Der interne Name bleibt
// „Studi-Helfer“: Daran hängen der Schlüssel für safeStorage im Schlüsselbund (Google-Token) und ältere Pfade.
const APP_NAME = "Ordo";
app.setName("Studi-Helfer");
app.setAboutPanelOptions({ applicationName: APP_NAME });
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
    title: APP_NAME,
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
    schedule: { ...cfg.schedule, every: backend.scheduleEvery(cfg.schedule?.every), active: await backend.scheduleLoaded() },
    lastSync: last ? { at: last.end * 1000, status: last.status, added: last.added.length, iliasDown: Boolean(last.iliasDown) } : null,
    sync: backend.readState(),
    notifications: cfg.notifications !== false,
    launchAtLogin: app.getLoginItemSettings().openAtLogin,
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
      parent: c.parent ?? null,
      suggested: c.suggested,
      selected: s ? Boolean(s.selected) : firstSetup && c.suggested,
      videos: s ? Boolean(s.videos) : false,
    };
  });
  // Module für die Einrichtung: Kurs + Übung + Übungsgruppe als eine Kachel.
  const { modules } = buildModules(courses, cfg.modules || {});
  const byId = new Map(courses.map((c) => [c.id, c]));
  const out = modules.map((m) => {
    const parts = m.parts.map((p) => byId.get(p.courseId));
    const groupsOnly = parts.every((p) => p.kind === "grp");
    return {
      id: m.id,
      name: m.name,
      fullName: m.fullName,
      semester: m.semester,
      parts: m.parts.map((p) => ({ courseId: p.courseId, label: p.label })),
      // Vorschlag: aktuelles Semester und mindestens ein richtiger Kurs (Gruppen wie „Altklausuren“ nur auf Wunsch)
      suggested: m.semester === "current" && !groupsOnly && parts.some((p) => p.suggested || p.kind === "crs"),
      selected: parts.some((p) => p.selected),
      videos: parts.some((p) => p.videos),
    };
  });
  return { ok: true, courses, modules: out };
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
      semester: ["current", "past", "unknown"].includes(c.semester) ? c.semester : undefined,
      parent: typeof c.parent === "string" && /^crs-\d+$/.test(c.parent) ? c.parent : null,
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
  // Ordner an die Module anpassen („~/Uni/Mathe I/Exercises“), bestehende werden verschoben.
  backend.applyLayout();
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
    every: backend.scheduleEvery(schedule?.every ?? cfg.schedule.every),
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
handle("studi:renameModule", (id, name) => backend.renameModule(id, name));
handle("studi:setModuleColor", (id, color) => backend.setModuleColor(id, color));
handle("studi:setSlotChoice", (moduleId, key, on) => backend.setSlotChoice(moduleId, key, Boolean(on)));
handle("studi:getCustomEvents", () => backend.getCustomEvents());
handle("studi:saveCustomEvent", withBadge((ev) => backend.saveCustomEvent(ev)));
handle("studi:deleteCustomEvent", withBadge((id) => backend.deleteCustomEvent(String(id))));
handle("studi:setEventHidden", withBadge((key, hidden) => backend.setEventHidden(key, Boolean(hidden))));
handle("studi:mensaThumb", (url, size) => mensa.thumb(url, size === "large" ? "large" : "small"));
handle("studi:markSeen", (ids) => backend.markSeen(ids));
handle("studi:setNotifications", withBadge((on) => backend.setNotifications(on)));
handle("studi:setLaunchAtLogin", (on) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(on), openAsHidden: true });
  return { ok: true };
});
handle("studi:getCalendars", () => backend.getCalendars());
handle("studi:addCalendar", async (url, name) => {
  if (typeof url !== "string" || url.length > 2000) return { ok: false, code: "invalid", message: "Paste a calendar link." };
  const test = await backend.runHelper(packaged(), ["calendar-test", "--url", url.trim()], { timeoutMs: 60_000 });
  if (test.type !== "result") return { ok: false, code: test.code, message: test.message };
  backend.saveCalendar(url.trim(), name);
  await backend.runHelper(packaged(), ["calendars"], { timeoutMs: 120_000 });
  for (const win of windows) win.webContents.send("studi:deadlinesChanged");
  return { ok: true, count: test.count };
});
handle("studi:removeCalendar", async (id) => {
  backend.removeCalendar(id);
  await backend.runHelper(packaged(), ["calendars"], { timeoutMs: 120_000 });
  for (const win of windows) win.webContents.send("studi:deadlinesChanged");
  return { ok: true };
});
handle("studi:openIlias", (url) => {
  if (typeof url !== "string" || !url.startsWith("https://www.ilias.uni-koeln.de/")) return { ok: false };
  shell.openExternal(url);
  return { ok: true };
});
// Neue Mail als Mac-Mitteilung. Was neu ist, weiß die Oberfläche (web/src/lib/mail-data.ts announceNew).
handle("studi:notifyMail", (n) => {
  if (!n || typeof n.title !== "string") return { ok: false };
  if (backend.loadConfig().notifications === false || !Notification.isSupported()) return { ok: true, shown: false };
  if (BrowserWindow.getFocusedWindow()) return { ok: true, shown: false }; // App ist vorn: die Liste zeigt es schon
  const note = new Notification({ title: n.title.slice(0, 120), body: String(n.body ?? "").slice(0, 240) });
  note.on("click", () => {
    const win = BrowserWindow.getAllWindows()[0] ?? createWindow();
    win.show();
    win.focus();
    win.webContents.send("studi:command", typeof n.id === "string" && n.id ? `mail:${n.id.slice(0, 500)}` : "mail");
  });
  note.show();
  return { ok: true, shown: true };
});
handle("studi:setDeadlineDone", withBadge((id, done) => backend.setDeadlineDone(id, Boolean(done))));
// Update-Knopf: neueste Fassung von GitHub (lib/updater.js)
updater.register(handle, () => windows);
// Google-Konto: Anmeldung, Kalender, Gmail (lib/google.js)
google.register(handle);
// Uni-Postfach mit dem ILIAS-Login (lib/unimail.js → Python-Helfer)
unimail.register(handle, packaged);
mailtools.register(handle, packaged); // Newsletter abbestellen, Anhang in den Kursordner
// Uni-VPN-Assistent (lib/vpn.js)
vpn.register(handle, packaged);
// Study places: Orte aus OpenStreetMap (lib/places.js)
places.register(handle);
// Lernbereich: Zusammenfassungen, Lernzettel, Karteikarten über Claude Code (lib/study.js)
study.register(handle, { packaged, windows: () => windows, dialog, BrowserWindow, shell });

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
let deadlineStamp = "";
/** Fristen-Dateien geändert (z. B. vorab beim ersten Import)? → Oberfläche lädt neu. */
function watchDeadlineFiles() {
  const stamp = ["deadlines.json", "sheet-deadlines.json", "calendar-events.json", "orga-events.json"]
    .map((f) => {
      try {
        return fs.statSync(path.join(backend.DATA_DIR, f)).mtimeMs;
      } catch {
        return 0;
      }
    })
    .join("|");
  if (deadlineStamp && stamp !== deadlineStamp) for (const win of windows) win.webContents.send("studi:deadlinesChanged");
  deadlineStamp = stamp;
}

function pushState() {
  watchDeadlineFiles();
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
  // Sync gerade fertig: Fristen haben sich ggf. geändert, neue Übungsblätter auswerten, Mitteilung zeigen.
  if (wasRunning && !state.running) {
    for (const win of windows) win.webContents.send("studi:deadlinesChanged");
    runAiDeadlines();
    // Erst die PDFs der Selbstlerneinheiten drucken, damit ein Klick auf die Mitteilung sie schon zeigt
    renderLearnmods().finally(() => notifyNewFiles());
    refreshShapes();
  }
  wasRunning = Boolean(state.running);
}

/** Mitteilung „3 new files in BWL, Mathe I“ (klickbar), wenn die App gerade nicht im Vordergrund ist. */
async function notifyNewFiles() {
  const cfg = backend.loadConfig();
  if (cfg.notifications === false || !Notification.isSupported()) return;
  if (BrowserWindow.getFocusedWindow()) return;
  const last = backend.readRuns(1).pop();
  if (!last || last.status === "cancelled") return;
  const initial = new Set(last.initialCourses || []);
  const added = (last.added || []).filter((a) => !initial.has(a.course));
  if (added.length === 0) return;
  const { moduleOfCourse, modules } = backend.currentModules(cfg);
  const names = [...new Set(added.map((a) => modules.find((m) => m.id === moduleOfCourse.get(a.course))?.name).filter(Boolean))];
  const n = new Notification({
    title: `${added.length} new ${added.length === 1 ? "file" : "files"}`,
    body: names.length ? `in ${names.slice(0, 3).join(", ")}${names.length > 3 ? " and more" : ""}` : "from ILIAS",
  });
  n.on("click", () => {
    const win = BrowserWindow.getAllWindows()[0] ?? createWindow();
    win.show();
    win.focus();
    win.webContents.send("studi:command", "new");
  });
  n.show();
}

/** Offene Abgaben und Klausuren für die Erinnerungen (ohne erledigte und ausgeblendete). */
function reminderItems() {
  const cfg = backend.loadConfig();
  if (!cfg.username) return [];
  const { modules } = backend.currentModules(cfg);
  const name = (id) => modules.find((m) => m.id === id)?.name;
  const custom = backend.getCustomEvents();
  const hidden = new Set(custom.hidden);
  const done = new Set(backend.getDoneDeadlines());
  const wanted = (d) => d.kind === "abgabe" || d.kind === "klausur";
  const list = backend
    .getDeadlines()
    .deadlines.filter((d) => wanted(d) && !d.done && !hidden.has(d.id) && !(d.seriesId && hidden.has(d.seriesId)))
    .map((d) => ({ id: d.id, kind: d.kind, title: d.title, date: d.date, time: d.time, course: name(d.moduleId), early: d.category === "uni" }));
  // Eigene Abgaben/Klausuren ohne Wiederholung (Wiederholungen löst nur die Oberfläche auf)
  for (const ev of custom.events) {
    if (!ev || !wanted(ev) || (ev.repeat && ev.repeat !== "none")) continue;
    const id = `custom|${ev.id}|${ev.date}`;
    if (done.has(id)) continue;
    list.push({ id, kind: ev.kind, title: ev.title, date: ev.date, time: ev.start || "", course: name(ev.moduleId) });
  }
  return list;
}

/**
 * Rote Zahl am Dock-Symbol: wie viele Abgaben/Klausuren heute noch fällig sind (0 = keine Zahl).
 * Aus mit dem Schalter „Notifications“ in Settings.
 */
let badgeShown = -1;
function updateBadge() {
  if (process.platform !== "darwin") return;
  let n = 0;
  try {
    if (backend.loadConfig().notifications !== false) n = todayCount(reminderItems());
  } catch (e) {
    console.error("[badge]", e);
  }
  if (n === badgeShown) return;
  badgeShown = n;
  app.setBadgeCount(n);
}

/**
 * IPC-Aktion, nach der sich die Dock-Zahl ändern kann (abhaken, eigene Termine, ausblenden).
 * Als function-Deklaration, weil die handle(...)-Aufrufe weiter oben sie schon beim Laden brauchen.
 */
function withBadge(fn) {
  return (...args) => {
    const r = fn(...args);
    setTimeout(updateBadge, 0);
    return r;
  };
}

const reminders = createReminders({
  dataDir: backend.DATA_DIR,
  items: reminderItems,
  enabled: () => backend.loadConfig().notifications !== false && Notification.isSupported(),
  show: ({ title, body }) => {
    const n = new Notification({ title, body });
    n.on("click", () => {
      const win = BrowserWindow.getAllWindows()[0] ?? createWindow();
      win.show();
      win.focus();
      win.webContents.send("studi:command", "week");
    });
    n.show();
  },
});

/** App-Menü mit Tastenkürzeln (⌘R Sync, ⌘, Einstellungen, ⌘1–3 Ansichten). */
function buildMenu() {
  const send = (cmd) => () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    win?.webContents.send("studi:command", cmd);
  };
  const template = [
    {
      label: APP_NAME,
      submenu: [
        { role: "about", label: `About ${APP_NAME}` },
        { type: "separator" },
        { label: "Settings…", accelerator: "CmdOrCtrl+,", click: send("settings") },
        { type: "separator" },
        { role: "hide", label: `Hide ${APP_NAME}` },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit", label: `Quit ${APP_NAME}` },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Today", accelerator: "CmdOrCtrl+1", click: send("week") },
        { label: "New", accelerator: "CmdOrCtrl+2", click: send("new") },
        { label: "Courses", accelerator: "CmdOrCtrl+3", click: send("courses") },
        { type: "separator" },
        { label: "Search", accelerator: "CmdOrCtrl+F", click: send("search") },
        { label: "Get New Files", accelerator: "CmdOrCtrl+R", click: send("sync") },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }, { role: "forceReload" }]),
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ------------------------------------------------------------------ Start

app.whenReady().then(async () => {
  mensa.prune();
  // App läuft: der Hintergrund-Sync überlässt die Mitteilungen der App (klickbar).
  fs.mkdirSync(backend.DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(backend.DATA_DIR, "app.pid"), String(process.pid));
  if (process.platform === "darwin" && !app.isPackaged) {
    const icon = nativeImage.createFromPath(path.join(__dirname, "assets", "icon.png"));
    if (!icon.isEmpty()) app.dock.setIcon(icon);
  }
  buildMenu();
  // Ordner an die Module anpassen (z. B. nach einem Update), bestehende werden verschoben.
  try {
    backend.applyLayout();
  } catch (e) {
    console.error("[layout]", e);
  }
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
  // Erinnerungen an Abgaben und Klausuren: kurz nach dem Start, dann jede Minute
  setTimeout(() => reminders.check(), 20_000);
  reminders.start(60_000);
  // Dock-Zahl: gleich beim Start, dann jede Minute (Frist vorbei, neuer Tag, neue Fristen nach dem Sync)
  updateBadge();
  setInterval(updateBadge, 60_000);
  // Kurz nach dem Start Übungsblätter auswerten, die noch nicht ausgewertet sind (z. B. aus dem 7-Uhr-Sync).
  setTimeout(() => runAiDeadlines(), 15_000);
  // Selbstlerneinheiten, die der Hintergrund-Sync bei geschlossener App geholt hat, als PDF drucken
  setTimeout(() => renderLearnmods(), 4_000);
  // Seitenformat für Dateien, die seit dem letzten Start dazugekommen sind (auch aus dem Hintergrund-Sync)
  setTimeout(() => refreshShapes(), 6_000);

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

app.on("will-quit", () => {
  uiServer?.stop();
  try {
    fs.rmSync(path.join(backend.DATA_DIR, "app.pid"), { force: true });
  } catch {
    // egal
  }
});

app.on("window-all-closed", () => {
  // Mac-typisch: App bleibt im Dock. Der tägliche Sync läuft ohnehin über launchd.
  if (process.platform !== "darwin") app.quit();
});
