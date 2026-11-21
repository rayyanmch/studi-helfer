// Uni-VPN-Assistent: Welche Uni nutzt welches VPN, ist das Programm installiert, ist die Verbindung an?
// Die App verbindet nicht selbst (das macht das VPN-Programm der Uni mit eigener Anmeldung), sie führt nur hin.
// Neue Unis: Eintrag in UNIS ergänzen (Programm, Server, Anleitung der Uni).

const fs = require("fs");
const { execFile } = require("child_process");
const { shell } = require("electron");

/** VPN-Programme, die Unis in Deutschland nutzen, mit typischen Orten auf dem Mac. */
const CLIENTS = {
  cisco: {
    name: "Cisco Secure Client",
    apps: ["/Applications/Cisco/Cisco Secure Client.app", "/Applications/Cisco/Cisco AnyConnect Secure Mobility Client.app"],
    cli: ["/opt/cisco/secureclient/bin/vpn", "/opt/cisco/anyconnect/bin/vpn"],
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
  },
};

const firstExisting = (paths) => paths.find((p) => fs.existsSync(p)) ?? null;

/** Cisco meldet den Zustand selbst („state: Connected“). Andere Programme: unbekannt. */
function ciscoState(cli) {
  return new Promise((resolve) => {
    execFile(cli, ["state"], { timeout: 6000 }, (err, stdout) => {
      const states = [...String(stdout || "").matchAll(/state:\s*(\w+)/gi)].map((m) => m[1].toLowerCase());
      const last = states[states.length - 1];
      resolve(last === "connected" ? true : last ? false : null);
    });
  });
}

async function status() {
  const uni = UNIS.koeln;
  const client = CLIENTS[uni.client];
  const app = firstExisting(client.apps);
  const cli = firstExisting(client.cli);
  const connected = app && cli && uni.client === "cisco" ? await ciscoState(cli) : null;
  return {
    ok: true,
    uni: uni.name,
    client: client.name,
    server: uni.server,
    guide: uni.guide,
    login: uni.login,
    installed: Boolean(app),
    connected, // true / false / null = unbekannt
  };
}

async function openClient() {
  const client = CLIENTS[UNIS.koeln.client];
  const app = firstExisting(client.apps);
  if (!app) return { ok: false, code: "missing", message: `${client.name} is not installed yet.` };
  const err = await shell.openPath(app);
  return err ? { ok: false, code: "failed", message: err } : { ok: true };
}

async function openGuide() {
  await shell.openExternal(UNIS.koeln.guide);
  return { ok: true };
}

function register(handle) {
  handle("studi:vpn:status", () => status());
  handle("studi:vpn:open", () => openClient());
  handle("studi:vpn:guide", () => openGuide());
}

module.exports = { register, status, UNIS, CLIENTS };
