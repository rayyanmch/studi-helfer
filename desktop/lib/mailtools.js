// Hilfen für Mails, die nicht zu einem Postfach gehören: Newsletter abbestellen.
// Nur https-Adressen. „One-Click“ (RFC 8058) wird direkt gesendet, sonst öffnet sich die Seite im Browser des Macs.

const fs = require("fs");
const path = require("path");
const { shell } = require("electron");
const backend = require("./backend");
const google = require("./google");

async function unsubscribe({ url, oneClick } = {}) {
  let u;
  try {
    u = new URL(String(url || ""));
  } catch {
    return { ok: false, code: "invalid", message: "This newsletter has no valid unsubscribe link." };
  }
  if (u.protocol !== "https:") return { ok: false, code: "invalid", message: "This newsletter has no safe unsubscribe link." };

  if (oneClick) {
    try {
      const res = await fetch(u.href, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status < 400) return { ok: true, how: "done" };
    } catch {
      // Fällt zurück auf den Browser
    }
  }
  await shell.openExternal(u.href);
  return { ok: true, how: "opened" };
}

// ------------------------------------------------------------------ Anhang in den Kursordner

/** Dateiname ohne Pfad und ohne Zeichen, die macOS oder der Finder nicht mögen. */
function safeFileName(name) {
  const base = path.basename(String(name || "attachment")).replace(/[\x00-\x1f/\\:]/g, "_").replace(/^\.+/, "").trim();
  return base.slice(0, 180) || "attachment";
}

/** Freien Namen finden: „Blatt 7.pdf“, sonst „Blatt 7 (2).pdf“ … */
function uniquePath(dir, name) {
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let p = path.join(dir, name);
  for (let n = 2; fs.existsSync(p); n++) p = path.join(dir, `${stem} (${n})${ext}`);
  return p;
}

/**
 * Speichert einen Mail-Anhang in „<Kursordner>/Mail attachments/“. Der Kursordner muss im Uni-Ordner liegen
 * (sonst lehnen wir ab). PFERD läuft mit „on_conflict = no-delete“ und lässt fremde Dateien dort in Ruhe.
 */
async function saveAttachment(packaged, { account, mailId, part, folder } = {}) {
  const target = path.join(String(folder || ""), "Mail attachments");
  if (!folder || !backend.insideTarget(target)) return { ok: false, code: "invalid", message: "This course folder is not inside your Uni folder." };
  let name;
  let data;
  if (account === "gmail") {
    const r = await google.attachment(String(mailId), String(part));
    if (!r.ok) return r;
    ({ name, data } = r);
  } else if (account === "uni") {
    const res = await backend.runHelper(packaged(), ["mail-attachment"], { stdin: JSON.stringify({ id: String(mailId), index: Number(part) }), timeoutMs: 120_000 });
    if (res.type !== "result") return { ok: false, code: res.code || "failed", message: res.message || "Could not load the attachment." };
    name = res.name;
    data = Buffer.from(res.data || "", "base64");
  } else {
    return { ok: false, code: "invalid", message: "Unknown mailbox." };
  }
  try {
    fs.mkdirSync(target, { recursive: true });
    const file = uniquePath(target, safeFileName(name));
    fs.writeFileSync(file, data);
    return { ok: true, path: file };
  } catch (e) {
    return { ok: false, code: "failed", message: `Could not save the file (${e.code || e.message}).` };
  }
}

function register(handle, packaged = () => false) {
  handle("studi:mail:unsubscribe", (arg) => unsubscribe(arg || {}));
  handle("studi:mail:saveAttachment", (arg) => saveAttachment(packaged, arg || {}));
}

module.exports = { register, unsubscribe, saveAttachment, _test: { safeFileName, uniquePath } };
