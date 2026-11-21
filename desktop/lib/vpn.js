// Uni-VPN-Assistent: Welche Uni nutzt welches VPN, ist das Programm installiert, ist die Verbindung an?
// Die App verbindet nicht selbst (das macht das VPN-Programm der Uni mit eigener Anmeldung), sie führt nur hin.
// Neue Unis: Eintrag in UNIS ergänzen (Programm, Server, Anleitung der Uni).

const fs = require("fs");
const { execFile } = require("child_process");
const { app, BrowserWindow, shell } = require("electron");

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

async function status() {
  const uni = UNIS.koeln;
  const client = CLIENTS[uni.client];
  const appPath = firstExisting(client.apps);
  const cli = firstExisting(client.cli);
  const phase = appPath && cli && uni.client === "cisco" ? await ciscoPhase(cli) : null;
  const connected = phase === null ? null : phase === "connected";
  const allowed = client.extension ? (appPath ? await extensionAllowed(client.extension) : false) : null;
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
  };
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

function register(handle) {
  handle("studi:vpn:status", () => status());
  handle("studi:vpn:open", () => openClient());
  handle("studi:vpn:disconnect", async () => {
    const r = await disconnect();
    bringToFront();
    return r;
  });
  handle("studi:vpn:front", () => bringToFront());
  handle("studi:vpn:guide", () => openGuide());
  handle("studi:vpn:settings", () => openSettings());
}

module.exports = { register, status, UNIS, CLIENTS };
