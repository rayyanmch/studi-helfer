// Uni-VPN-Assistent: Welche Uni nutzt welches VPN, ist das Programm installiert, ist die Verbindung an?
// Den Tunnel baut das VPN-Programm der Uni auf. Bei Cisco übernimmt die App den Cisco-Schritt (Helfer-Befehl
// vpn-connect, studi_sync/vpnauto.py, braucht einmal „Bedienungshilfen“): Connect drücken, Cisco verstecken.
// Uni-Login und Duo macht der Student selbst im Browser-Tab, den Cisco öffnet; sobald verbunden, schließt die App
// diesen Tab und holt sich nach vorn. Beim Trennen schließt sie ebenso Ciscos Abmeldeseite.
// Neue Unis: Eintrag in UNIS ergänzen (Programm, Server, Anleitung der Uni).

const fs = require("fs");
const { execFile } = require("child_process");
const { app, BrowserWindow, shell } = require("electron");
const backend = require("./backend");

/** VPN-Programme, die Unis in Deutschland nutzen, mit typischen Orten auf dem Mac. */
const CLIENTS = {
  cisco: {
    name: "Cisco Secure Client",
    apps: ["/Applications/Cisco/Cisco Secure Client.app", "/Applications/Cisco/Cisco AnyConnect Secure Mobility Client.app"],
    cli: ["/opt/cisco/secureclient/bin/vpn", "/opt/cisco/anyconnect/bin/vpn"],
    // macOS verlangt einmal „Erlauben“ für die Systemerweiterung (Netzwerkfilter)
    extension: "com.cisco.anyconnect.macos.acsockext",
  },
  eduvpn: { name: "eduVPN", apps: ["/Applications/eduVPN.app"], cli: [] },
  forticlient: { name: "FortiClient", apps: ["/Applications/FortiClient.app"], cli: [] },
  openvpn: { name: "OpenVPN Connect", apps: ["/Applications/OpenVPN Connect/OpenVPN Connect.app", "/Applications/OpenVPN Connect.app"], cli: [] },
};

/** Unis: Programm, Serveradresse, offizielle Anleitung (mit Download). Heute nur Köln, die App kennt nur ILIAS Köln. */
const UNIS = {
  koeln: {
    name: "University of Cologne",
    client: "cisco",
    server: "vpngate.uni-koeln.de",
    guide: "https://rrzk.uni-koeln.de/en/internet-access-web/network-access/vpn/cisco-secure-client-fuer-mac",
    login: "Your uni ID and password, the same as for ILIAS.",
    secondFactor: "Duo Mobile", // Die Uni fragt bei jeder Anmeldung nach einer Bestätigung auf dem Handy
  },
};

const firstExisting = (paths) => paths.find((p) => fs.existsSync(p)) ?? null;

/** Cisco meldet den Zustand selbst („state: Connected“). Gibt „connected“, „connecting“, „disconnected“ oder null zurück. */
function ciscoPhase(cli) {
  return new Promise((resolve) => {
    execFile(cli, ["state"], { timeout: 6000 }, (err, stdout) => {
      const states = [...String(stdout || "").matchAll(/state:\s*(\w+)/gi)].map((m) => m[1].toLowerCase());
      const last = states[states.length - 1];
      if (!last || last === "unknown") return resolve(null);
      resolve(last === "connected" ? "connected" : last === "disconnected" ? "disconnected" : "connecting");
    });
  });
}
const ciscoState = async (cli) => {
  const phase = await ciscoPhase(cli);
  return phase === null ? null : phase === "connected";
};

/** Hat der Student die Systemerweiterung des VPN-Programms in den Mac-Einstellungen erlaubt? null = nicht nötig/unbekannt. */
function extensionAllowed(bundleId) {
  return new Promise((resolve) => {
    execFile("/usr/bin/systemextensionsctl", ["list"], { timeout: 6000 }, (err, stdout) => {
      if (err && !stdout) return resolve(null);
      const line = String(stdout).split("\n").find((l) => l.includes(bundleId));
      resolve(Boolean(line && /activated enabled/.test(line)));
    });
  });
}

let isPackaged = () => app.isPackaged; // setzt register()

/**
 * Darf der Helfer die Bedienungshilfen nutzen? Gefragt wird der Helfer selbst: In der fertigen App rechnet macOS
 * ihn nicht Studi-Helfer zu (eigener Eintrag „studi-sync“), Electrons eigene Erlaubnis sagt darüber nichts.
 * Gepuffert: erlaubt 60 s, sonst 3 s (damit ein frisch erteilter Haken schnell ankommt).
 */
async function axTrusted() {
  const c = cache.get("ax");
  if (c && !c.pending && Date.now() - c.at > (c.value ? 60_000 : 3_000)) forget("ax");
  return cached("ax", 60_000, async () => {
    const res = await backend.runHelper(isPackaged(), ["vpn-trusted"], { stdin: "{}", timeoutMs: 15_000 });
    return res.type === "result" && res.trusted === true;
  });
}

/** Name des Eintrags unter Bedienungshilfen, den der Student einschalten muss. */
const axName = () => (isPackaged() ? "studi-sync" : "Electron");

// Laufendes Verbinden: { running, stage (starting/browser/connecting/done/error/cancelled), since, error, child, cancelled }
let auto = null;

/** Beendet einen laufenden Versuch: Helfer stoppen (der drückt dann Ciscos „Cancel“). */
function abortRun(run) {
  if (run.child) run.child.kill("SIGTERM");
}
const autoView = () =>
  auto ? { running: auto.running, stage: auto.stage, since: auto.since, error: auto.error || null } : null;

// `vpn state` dauert ~2 s, `systemextensionsctl` auch: puffern, damit häufiges Nachsehen (1×/s beim Verbinden)
// keine Aufrufe stapelt (das ließ Cisco und die App ruckeln)
const cache = new Map(); // key → { at, value, pending }
function cached(key, maxAgeMs, fn) {
  const c = cache.get(key);
  if (c?.pending) return c.pending;
  if (c && Date.now() - c.at < maxAgeMs) return Promise.resolve(c.value);
  const pending = fn().then((value) => {
    cache.set(key, { at: Date.now(), value, pending: null });
    return value;
  });
  cache.set(key, { ...(c || {}), pending });
  return pending;
}
const forget = (key) => cache.delete(key);

async function status() {
  const uni = UNIS.koeln;
  const client = CLIENTS[uni.client];
  const appPath = firstExisting(client.apps);
  const cli = firstExisting(client.cli);
  const phase = appPath && cli && uni.client === "cisco" ? await cached("phase", 2500, () => ciscoPhase(cli)) : null;
  const connected = phase === null ? null : phase === "connected";
  const allowed = client.extension ? (appPath ? await cached("ext", 20_000, () => extensionAllowed(client.extension)) : false) : null;
  return {
    ok: true,
    uni: uni.name,
    client: client.name,
    server: uni.server,
    guide: uni.guide,
    login: uni.login,
    installed: Boolean(appPath),
    phase, // connected / connecting / disconnected / null
    secondFactor: uni.secondFactor || null,
    allowed, // true / false / null = braucht keine Erlaubnis
    connected, // true / false / null = unbekannt
    canAuto: uni.client === "cisco", // App kann Cisco im Hintergrund bedienen (sobald installiert)
    axTrusted: await axTrusted(),
    axName: axName(),
    auto: autoView(),
  };
}

/**
 * Verbindet: Cisco-Schritt übernimmt die App, die Anmeldung im Browser macht der Student. Läuft bis verbunden oder
 * Fehler (max. 5 min); den Zwischenstand liest die Oberfläche über status().auto.
 */
async function connectAuto(packaged) {
  if (auto?.running) return { ok: false, code: "busy", message: "Already connecting." };
  forget("ax");
  if (!(await axTrusted())) return { ok: false, code: "no_permission", message: "Studi-Helfer needs permission to operate Cisco for you." };
  auto = { running: true, stage: "starting", since: Date.now(), error: null, child: null, cancelled: false };
  const run = auto;
  const res = await backend.runHelper(packaged(), ["vpn-connect"], {
    stdin: JSON.stringify({ server: UNIS.koeln.server }),
    timeoutMs: 330_000, // der Student meldet sich im Browser selbst an
    onChild: (child) => (run.child = child),
    onProgress: (p) => {
      if (p.stage !== run.stage) run.since = Date.now();
      run.stage = p.stage;
    },
  });
  forget("phase");
  if (res.code === "no_permission") forget("ax");
  const ok = res.type === "result";
  const error = ok || run.cancelled ? null : { code: res.code || "failed", message: res.message || "Could not connect." };
  auto = { running: false, stage: ok ? "done" : run.cancelled ? "cancelled" : "error", since: Date.now(), error };
  bringToFront(); // verbunden (Anmelde-Tab ist zu) oder Fehler: zurück in unsere App
  if (run.cancelled) return { ok: false, code: "cancelled" };
  return ok ? { ok: true } : { ok: false, ...error };
}

/** Bricht die Hintergrund-Anmeldung ab und beendet den halben Verbindungsversuch bei Cisco. */
async function cancelAuto() {
  if (auto?.running) {
    auto.cancelled = true;
    abortRun(auto);
  }
  return { ok: true };
}

/** Der Helfer fragt macOS nach „Bedienungshilfen“ (trägt sich dabei in die Liste ein); dazu die Einstellungen öffnen. */
async function allowAccess() {
  forget("ax");
  const res = await backend.runHelper(isPackaged(), ["vpn-trusted"], { stdin: JSON.stringify({ prompt: true }), timeoutMs: 15_000 });
  if (res.type === "result" && res.trusted) return { ok: true, allowed: true };
  try {
    await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
  } catch {
    // die macOS-Abfrage hat selbst einen Knopf zu den Einstellungen
  }
  return { ok: true, allowed: false };
}

async function openClient() {
  const client = CLIENTS[UNIS.koeln.client];
  const appPath = firstExisting(client.apps);
  if (!appPath) return { ok: false, code: "missing", message: `${client.name} is not installed yet.` };
  const err = await shell.openPath(appPath);
  return err ? { ok: false, code: "failed", message: err } : { ok: true };
}

/**
 * Trennt die Verbindung (Cisco-Befehlszeile, braucht keine Anmeldung). Verbinden geht nicht per Befehl:
 * Die Uni-Anmeldung wird von der Befehlszeile nicht unterstützt („authentication type is not supported“),
 * darum öffnet „Connect“ das VPN-Programm, wo man einmal auf „Connect“ klickt.
 */
async function disconnect() {
  const client = CLIENTS[UNIS.koeln.client];
  const cli = firstExisting(client.cli);
  if (!cli) return { ok: false, code: "unsupported", message: `Please disconnect in ${client.name}.` };
  await new Promise((resolve) => execFile(cli, ["disconnect"], { timeout: 20_000 }, () => resolve()));
  const connected = await ciscoState(cli);
  return connected ? { ok: false, code: "failed", message: `Could not disconnect. Please do it in ${client.name}.` } : { ok: true };
}

/** Öffnet die Mac-Einstellungen an der Stelle, wo man die Erweiterung erlaubt. */
async function openSettings() {
  try {
    await shell.openExternal("x-apple.systempreferences:com.apple.LoginItems-Settings.extension");
  } catch {
    await shell.openExternal("x-apple.systempreferences:com.apple.preference.security");
  }
  return { ok: true };
}

/** Holt unsere App wieder nach vorn (nach dem Verbinden oder Trennen, damit der Student nicht „rausgetappt“ bleibt). */
function bringToFront() {
  try {
    app.focus({ steal: true });
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  } catch {
    // Nur eine Annehmlichkeit
  }
  return { ok: true };
}

async function openGuide() {
  await shell.openExternal(UNIS.koeln.guide);
  return { ok: true };
}

function register(handle, packaged = () => app.isPackaged) {
  isPackaged = packaged;
  handle("studi:vpn:status", () => status());
  handle("studi:vpn:connect", () => connectAuto(packaged));
  handle("studi:vpn:cancel", () => cancelAuto());
  handle("studi:vpn:allow", () => allowAccess());
  // Nur Entwicklung: Aufbau der Cisco-Fenster (Rollen/Beschriftungen, keine Feldinhalte) zur Fehlersuche
  if (!packaged()) handle("studi:vpn:inspect", () => backend.runHelper(false, ["vpn-inspect"], { timeoutMs: 30_000 }));
  handle("studi:vpn:open", () => openClient());
  handle("studi:vpn:disconnect", async () => {
    // Mit Erlaubnis fängt der Helfer die Abmeldeseite ab, die Cisco danach im Browser öffnet (versteckt + schließt)
    if (UNIS.koeln.client === "cisco" && (await axTrusted())) {
      const res = await backend.runHelper(packaged(), ["vpn-disconnect"], { timeoutMs: 40_000 });
      forget("phase");
      bringToFront();
      return res.type === "result" ? { ok: true } : { ok: false, code: res.code, message: res.message };
    }
    const r = await disconnect();
    forget("phase");
    bringToFront();
    return r;
  });
  handle("studi:vpn:front", () => bringToFront());
  handle("studi:vpn:guide", () => openGuide());
  handle("studi:vpn:settings", () => openSettings());
}

module.exports = { register, status, UNIS, CLIENTS };
