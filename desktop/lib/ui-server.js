// Startet in der fertig gepackten App den mitgelieferten Next-Server (web/.next/standalone)
// lokal auf 127.0.0.1 mit freiem Port. Läuft mit Electrons eigenem Node (ELECTRON_RUN_AS_NODE),
// es muss also kein Node installiert sein. In der Entwicklung wird das nicht gebraucht.

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

// Fester Port, damit die Adresse der Oberfläche bei jedem Start gleich bleibt. Der Browser-Speicher
// (localStorage: Begrüßung gesehen, Erscheinungsbild, Mensa-Vorlieben, geschlummerte Mails, Mathe-Modus …)
// gehört zur Adresse samt Port; mit zufälligem Port war er nach jedem Neustart leer.
const PREFERRED_PORTS = [38917, 38918, 38919];

function tryPort(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", () => resolve(null));
    srv.listen(port, "127.0.0.1", () => {
      const { port: got } = srv.address();
      srv.close(() => resolve(got));
    });
  });
}

async function freePort() {
  for (const p of PREFERRED_PORTS) {
    const got = await tryPort(p);
    if (got) return got;
  }
  const any = await tryPort(0);
  if (!any) throw new Error("No free port for the interface");
  return any;
}

// Läuft noch ein UI-Server vom letzten Start (App abgestürzt), hält er den festen Port. Dann beenden,
// aber nur, wenn die Prozess-Id wirklich noch zu unserem server.js gehört.
function stopLeftover(pidFile, server) {
  let pid;
  try {
    pid = Number(fs.readFileSync(pidFile, "utf8"));
  } catch {
    return;
  }
  if (!pid) return;
  try {
    const cmd = require("node:child_process").execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
    if (cmd.includes(server)) process.kill(pid, "SIGTERM");
  } catch {
    // Prozess gibt es nicht mehr
  }
}

function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) reject(new Error("Interface failed to start"));
        else setTimeout(attempt, 150);
      });
      req.setTimeout(2000, () => req.destroy());
    };
    attempt();
  });
}

/**
 * @param {string} uiDir Ordner mit server.js (im Paket: Resources/ui)
 * @param {string} logFile
 * @returns {Promise<{url: string, stop: () => void}>}
 */
async function startBundledUi(uiDir, logFile) {
  const server = path.join(uiDir, "server.js");
  if (!fs.existsSync(server)) throw new Error(`Interface missing from the app bundle: ${server}`);
  const pidFile = path.join(path.dirname(logFile), "ui-server.pid");
  stopLeftover(pidFile, server);
  let port = await freePort();
  if (!PREFERRED_PORTS.includes(port)) {
    // Kurz warten, falls der alte Server gerade erst beendet wurde
    await new Promise((r) => setTimeout(r, 400));
    port = await freePort();
  }
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const log = fs.openSync(logFile, "a");
  const child = spawn(process.execPath, [server], {
    cwd: uiDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", log, log],
  });
  try {
    fs.writeFileSync(pidFile, String(child.pid));
  } catch {
    // egal
  }
  const url = `http://127.0.0.1:${port}`;
  await waitForHttp(url, 20_000);
  return {
    url,
    stop: () => {
      if (child.exitCode === null) child.kill("SIGTERM");
    },
  };
}

module.exports = { startBundledUi };
