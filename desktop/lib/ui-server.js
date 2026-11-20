// Startet in der fertig gepackten App den mitgelieferten Next-Server (web/.next/standalone)
// lokal auf 127.0.0.1 mit freiem Port. Läuft mit Electrons eigenem Node (ELECTRON_RUN_AS_NODE),
// es muss also kein Node installiert sein. In der Entwicklung wird das nicht gebraucht.

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
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
  const port = await freePort();
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
