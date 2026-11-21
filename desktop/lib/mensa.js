// Vorschaubilder für den Mensa-Tab. Die Fotos des Kölner Studierendenwerks (CloudMensa) sind 4747 × 4747 px
// (ca. 0,6 MB, freigestellte Teller mit Transparenz) und kommen ohne Cache-Erlaubnis. Wir laden jedes Foto einmal,
// verkleinern es mit dem macOS-Bordmittel `sips` auf 360 px (PNG, Transparenz bleibt) und legen es in den
// App-Daten ab. Die Oberfläche bekommt eine data:-URL. Nur Bilder von CloudMensa sind erlaubt.

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");

const ALLOWED = "https://axxiebkvmfjmiaanviob.supabase.co/storage/v1/object/public/media/";
const MAX_BYTES = 25 * 1024 * 1024;
const KEEP_DAYS = 45;

function createMensa({ dataDir }) {
  const dir = path.join(dataDir, "mensa-thumbs");
  const inflight = new Map();
  let running = 0;
  const queue = [];

  // höchstens 3 Downloads gleichzeitig
  const slot = () =>
    new Promise((resolve) => {
      if (running < 3) {
        running += 1;
        resolve();
      } else queue.push(resolve);
    });
  const release = () => {
    const next = queue.shift();
    if (next) next();
    else running -= 1;
  };

  const toDataUrl = (buf) => `data:image/png;base64,${buf.toString("base64")}`;

  async function make(url, file) {
    await slot();
    const tmp = `${file}.${process.pid}.src`;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30_000);
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      clearTimeout(timer);
      if (buf.length > MAX_BYTES) throw new Error("too large");
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(tmp, buf);
      await new Promise((resolve, reject) =>
        execFile("/usr/bin/sips", ["-Z", "360", "-s", "format", "png", tmp, "--out", file], { timeout: 20_000 }, (err) => (err ? reject(err) : resolve())),
      );
      return toDataUrl(await fsp.readFile(file));
    } finally {
      fsp.rm(tmp, { force: true }).catch(() => {});
      release();
    }
  }

  /** data:-URL eines kleinen Vorschaubilds oder null (falsche Adresse, offline, kaputt). */
  async function thumb(url) {
    if (typeof url !== "string" || url.length > 300 || !url.startsWith(ALLOWED) || /\.\.|[?#\s]/.test(url)) return null;
    const file = path.join(dir, `${crypto.createHash("sha1").update(url).digest("hex")}.png`);
    try {
      return toDataUrl(await fsp.readFile(file));
    } catch {
      // noch nicht da
    }
    if (!inflight.has(url)) {
      inflight.set(
        url,
        make(url, file)
          .catch(() => null)
          .finally(() => inflight.delete(url)),
      );
    }
    return inflight.get(url);
  }

  /** Alte Vorschaubilder löschen (beim Start). */
  function prune() {
    fs.readdir(dir, (err, names) => {
      if (err) return;
      const limit = Date.now() - KEEP_DAYS * 86_400_000;
      for (const n of names) {
        const p = path.join(dir, n);
        fs.stat(p, (e, st) => {
          if (!e && (st.mtimeMs < limit || n.endsWith(".src"))) fs.rm(p, { force: true }, () => {});
        });
      }
    });
  }

  return { thumb, prune };
}

module.exports = { createMensa };
