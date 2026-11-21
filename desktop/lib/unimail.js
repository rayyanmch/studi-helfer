// Uni-Postfach (Uni Köln, smail) über den Python-Helfer (services/ilias-sync/studi_sync/unimail.py).
// Das ILIAS-Passwort liest nur der Helfer aus dem Schlüsselbund; hier kommen nur Mails als JSON an.
// „Verbunden“ merkt sich die Datei unimail.json im Datenordner ({ connected: true }).

const fs = require("fs");
const path = require("path");
const backend = require("./backend");

const STATE_FILE = path.join(backend.DATA_DIR, "unimail.json");

const cache = new Map(); // id → ganze Mail (ohne folder/unread)
let listing = null; // laufender Abruf, damit nie zwei gleichzeitig laufen

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeState(s) {
  fs.mkdirSync(backend.DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(s));
}

const fail = (res) => ({ ok: false, code: res.code || "failed", message: res.message || "Something went wrong with university mail." });

function register(handle, packaged) {
  const run = (cmd, input, timeoutMs = 90_000) => backend.runHelper(packaged(), [cmd], { stdin: JSON.stringify(input || {}), timeoutMs });

  async function status() {
    const username = backend.loadConfig().username;
    const s = readState();
    return { signedIn: Boolean(username), connected: Boolean(username && s.connected), address: username ? `${username}@smail.uni-koeln.de` : "" };
  }

  async function connect() {
    const res = await run("mail-check");
    if (res.type !== "result") return fail(res);
    writeState({ connected: true, connectedAt: Date.now() });
    return { ok: true, address: res.address };
  }

  async function disconnect() {
    writeState({ connected: false });
    cache.clear();
    return { ok: true };
  }

  async function mails() {
    if (!(await status()).connected) return { ok: false, code: "not_connected", message: "University mail is not connected." };
    if (!listing) {
      listing = run("mail-list", { known: [...cache.keys()] }).finally(() => (listing = null));
    }
    const res = await listing;
    if (res.type !== "result") return fail(res);
    const out = [];
    const live = new Set();
    for (const m of res.mails || []) {
      if (!m.known) {
        const { folder, unread, known, ...rest } = m;
        cache.set(m.id, rest);
      }
      const base = cache.get(m.id);
      if (!base || live.has(m.id)) continue;
      live.add(m.id);
      out.push({ ...base, folder: m.folder, unread: m.unread });
    }
    // Was der Server nicht mehr kennt, fliegt aus dem Zwischenspeicher
    for (const id of cache.keys()) if (!live.has(id)) cache.delete(id);
    return { ok: true, mails: out };
  }

  async function modify(id, change) {
    const res = await run("mail-modify", { id: String(id), unread: change?.unread, archive: change?.archive === true });
    if (res.type !== "result") return fail(res);
    if (change?.archive) cache.delete(String(id)); // im Archiv bekommt sie eine neue Id
    return { ok: true };
  }

  async function send(mail) {
    const m = mail || {};
    const res = await run("mail-send", { to: m.to, subject: m.subject, body: m.body, inReplyTo: m.inReplyTo });
    return res.type === "result" ? { ok: true, id: res.id || "" } : fail(res);
  }

  handle("studi:unimail:status", () => status());
  handle("studi:unimail:connect", () => connect());
  handle("studi:unimail:disconnect", () => disconnect());
  handle("studi:unimail:mails", () => mails());
  handle("studi:unimail:modify", (id, change) => modify(id, change));
  handle("studi:unimail:send", (mail) => send(mail));
}

module.exports = { register };
