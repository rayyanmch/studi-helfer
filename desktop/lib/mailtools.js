// Hilfen für Mails, die nicht zu einem Postfach gehören: Newsletter abbestellen.
// Nur https-Adressen. „One-Click“ (RFC 8058) wird direkt gesendet, sonst öffnet sich die Seite im Browser des Macs.

const { shell } = require("electron");

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

function register(handle) {
  handle("studi:mail:unsubscribe", (arg) => unsubscribe(arg || {}));
}

module.exports = { register, unsubscribe };
