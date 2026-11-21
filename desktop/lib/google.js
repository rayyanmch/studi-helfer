// Google-Konto: Anmeldung (OAuth im normalen Browser des Macs), Kalender und Gmail.
//
// Ablauf der Anmeldung: kleiner Server auf 127.0.0.1 (freier Port) + Browser öffnen + PKCE. Google blockiert
// Anmeldungen in eingebetteten Fenstern, deshalb nie in einem Electron-Fenster. Die Token liegen verschlüsselt
// (Schlüsselbund über Electron safeStorage) in google-token.bin im Datenordner, nie im Klartext und nie in Logs.
//
// Die Zugangsdatei (Client-ID und Schlüssel der Google-Cloud-Projekts „studi-helfer“) steht NICHT im Repo:
//   ~/Library/Application Support/Studi-Helfer/google-client.json   (oder desktop/.secrets/google-client.json)
// Gmail wird nur über die offizielle API gelesen und geändert. Nichts geht an einen anderen Server.

const { safeStorage, shell } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const backend = require("./backend");

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];
const TOKEN_FILE = path.join(backend.DATA_DIR, "google-token.bin");
const CLIENT_FILES = [path.join(backend.DATA_DIR, "google-client.json"), path.join(__dirname, "..", ".secrets", "google-client.json")];
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

/** @typedef {{ ok: false, code: string, message: string }} Fail */
const fail = (code, message) => ({ ok: false, code, message });

// ------------------------------------------------------------------ Zugangsdatei und Token

function loadClient() {
  for (const file of CLIENT_FILES) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      const c = raw.installed || raw.web || raw;
      if (c.client_id) return { id: c.client_id, secret: c.client_secret || "" };
    } catch {
      // nächste Stelle
    }
  }
  return null;
}

function readTokens() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(TOKEN_FILE)));
  } catch {
    return null;
  }
}

function writeTokens(tokens) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("The Keychain is not available, so the login cannot be stored safely.");
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  fs.writeFileSync(TOKEN_FILE, safeStorage.encryptString(JSON.stringify(tokens)), { mode: 0o600 });
}

function clearTokens() {
  try {
    fs.rmSync(TOKEN_FILE, { force: true });
  } catch {
    // egal
  }
}

// ------------------------------------------------------------------ Anmeldung

const b64url = (buf) => Buffer.from(buf).toString("base64url");
let connecting = false;

function resultPage(ok, text) {
  return `<!doctype html><meta charset="utf-8"><title>Studi-Helfer</title>
<body style="font:16px -apple-system,Helvetica,sans-serif;background:#f2f4f7;color:#16202a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center;max-width:380px;padding:24px"><div style="font-size:40px">${ok ? "✓" : "!"}</div>
<h1 style="font-size:22px;margin:8px 0">${ok ? "You're connected" : "Not connected"}</h1><p style="color:#5b6774">${text}</p></div>`;
}

/** Wartet auf die Weiterleitung von Google an http://127.0.0.1:<Port>. */
function waitForCode(server, expectedState) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error("Timed out"), { code: "timeout" })), 3 * 60 * 1000);
    server.on("request", (req, res) => {
      const u = new URL(req.url || "/", "http://127.0.0.1");
      if (u.pathname !== "/") {
        res.writeHead(404).end();
        return;
      }
      const error = u.searchParams.get("error");
      const code = u.searchParams.get("code");
      const okState = u.searchParams.get("state") === expectedState;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      if (code && okState) {
        res.end(resultPage(true, "You can close this tab and go back to Studi-Helfer."));
        clearTimeout(timer);
        resolve(code);
      } else {
        res.end(resultPage(false, "Nothing was connected. You can close this tab and try again."));
        clearTimeout(timer);
        reject(Object.assign(new Error(error === "access_denied" ? "You did not allow access." : "Google did not return a login."), { code: error === "access_denied" ? "denied" : "failed" }));
      }
    });
  });
}

async function connect() {
  if (connecting) return fail("busy", "A login is already open in your browser.");
  const client = loadClient();
  if (!client) return fail("no_client", "The Google client file is missing. Put google-client.json in ~/Library/Application Support/Studi-Helfer/.");
  if (!safeStorage.isEncryptionAvailable()) return fail("keychain", "The Keychain is not available, so the login cannot be stored safely.");
  connecting = true;
  const server = http.createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const port = server.address().port;
    const redirect = `http://127.0.0.1:${port}`;
    const verifier = b64url(crypto.randomBytes(48));
    const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
    const state = b64url(crypto.randomBytes(16));
    const url =
      `${AUTH_URL}?` +
      new URLSearchParams({
        client_id: client.id,
        redirect_uri: redirect,
        response_type: "code",
        scope: SCOPES.join(" "),
        code_challenge: challenge,
        code_challenge_method: "S256",
        access_type: "offline",
        prompt: "consent",
        state,
      }).toString();
    const codePromise = waitForCode(server, state);
    await shell.openExternal(url);
    const code = await codePromise;

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: client.id,
        client_secret: client.secret,
        redirect_uri: redirect,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
    });
    const tok = await res.json();
    if (!res.ok || !tok.access_token) return fail("failed", "Google did not accept the login. Please try again.");
    if (!tok.refresh_token) return fail("failed", "Google did not give long-term access. Remove Studi-Helfer in your Google account security settings and try again.");

    const tokens = {
      access: tok.access_token,
      refresh: tok.refresh_token,
      expiresAt: Date.now() + (tok.expires_in || 3600) * 1000,
      scope: tok.scope || "",
      email: "",
      connectedAt: Date.now(),
    };
    writeTokens(tokens);
    const profile = await api(`${GMAIL}/profile`);
    if (profile.ok) {
      tokens.email = profile.data.emailAddress || "";
      writeTokens(tokens);
    }
    return { ok: true, email: tokens.email, scope: tokens.scope };
  } catch (err) {
    return fail(err?.code || "failed", err?.message || "The login did not work.");
  } finally {
    connecting = false;
    server.close();
  }
}

async function disconnect() {
  const t = readTokens();
  if (t?.refresh) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.refresh)}`, { method: "POST" });
    } catch {
      // Widerrufen ist nett, aber das Löschen hier zählt
    }
  }
  clearTokens();
  cache.clear();
  lastMails = null;
  return { ok: true };
}

function status() {
  const t = readTokens();
  return {
    available: Boolean(loadClient()),
    connected: Boolean(t?.refresh),
    expired: Boolean(t && !t.refresh),
    email: t?.email || "",
    scope: t?.scope || "",
  };
}

// ------------------------------------------------------------------ Aufrufe mit Token

async function accessToken() {
  const t = readTokens();
  if (!t?.refresh) return null;
  if (t.access && t.expiresAt - 60_000 > Date.now()) return t.access;
  const client = loadClient();
  if (!client) return null;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: client.id, client_secret: client.secret, refresh_token: t.refresh, grant_type: "refresh_token" }),
  });
  const tok = await res.json().catch(() => ({}));
  if (!res.ok || !tok.access_token) {
    // Im Testmodus läuft die Anmeldung nach 7 Tagen ab: dann neu verbinden
    if (tok.error === "invalid_grant") writeTokens({ email: t.email, scope: t.scope, expired: true });
    return null;
  }
  writeTokens({ ...t, access: tok.access_token, expiresAt: Date.now() + (tok.expires_in || 3600) * 1000 });
  return tok.access_token;
}

/** Ruft die Google-API auf. Gibt { ok, data } oder einen Fehler zurück. */
async function api(url, options = {}) {
  const token = await accessToken();
  if (!token) return fail("not_connected", "Google is not connected, or the login has expired. Connect again.");
  let res;
  try {
    res = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
    });
  } catch {
    return fail("offline", "No connection to Google.");
  }
  if (res.status === 204) return { ok: true, data: null };
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || `Google returned an error (${res.status}).`;
    // Minuten-Limit von Google: kurz warten statt den langen englischen Fehler zu zeigen
    if (res.status === 429 || /quota|rate ?limit/i.test(msg)) return fail("busy", "Google needs a short break. Your mail updates again in a minute.");
    return fail(res.status === 403 ? "forbidden" : "failed", msg);
  }
  return { ok: true, data };
}

// ------------------------------------------------------------------ Kalender

const pad = (n) => String(n).padStart(2, "0");
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Ein Termin aus Google als { id, title, date, time, location? } wie GoogleEvent in web/src/lib/mail-data.ts. */
function toEvent(e) {
  const start = e.start || {};
  const end = e.end || {};
  let date;
  let time;
  if (start.date) {
    date = start.date;
    time = "all day";
  } else if (start.dateTime) {
    const d = new Date(start.dateTime);
    date = localDate(d);
    time = hhmm(d);
    if (end.dateTime) {
      const de = new Date(end.dateTime);
      if (localDate(de) === date && de > d) time = `${time} to ${hhmm(de)}`;
    }
  } else {
    return null;
  }
  return { id: e.id, title: e.summary || "(No title)", date, time, ...(e.location ? { location: e.location } : {}) };
}

// Farben der Termine in Google Kalender (colorId 1–11), sonst gilt die Farbe des Kalenders
const EVENT_COLORS = {
  1: "#7986cb", 2: "#33b679", 3: "#8e24aa", 4: "#e67c73", 5: "#f6bf26", 6: "#f4511e",
  7: "#039be5", 8: "#616161", 9: "#3f51b5", 10: "#0b8043", 11: "#d50000",
};

async function events(days = 35) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + days * 86_400_000);
  const params = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  // Alle Kalender, die in Google eingeblendet sind (mit deren Farbe); klappt das nicht, gilt nur der Hauptkalender
  let calendars = [{ id: "primary", color: "", name: "" }];
  const cl = await api(`https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=20`);
  if (cl.ok) {
    const shown = (cl.data.items || []).filter((c) => c.selected !== false && !c.deleted && !c.hidden).slice(0, 8);
    if (shown.length > 0) calendars = shown.map((c) => ({ id: c.id, color: c.backgroundColor || "", name: c.summaryOverride || c.summary || "" }));
  }

  const out = [];
  let failed = null;
  await pool(calendars, 4, async (cal) => {
    const r = await api(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${params}`);
    if (!r.ok) {
      if (cal.id === "primary" || calendars.length === 1) failed = r;
      return;
    }
    for (const e of (r.data.items || []).filter((x) => x.status !== "cancelled")) {
      const ev = toEvent(e);
      if (!ev) continue;
      const color = EVENT_COLORS[e.colorId] || cal.color;
      out.push({ ...ev, id: calendars.length > 1 ? `${cal.id}:${ev.id}` : ev.id, ...(color ? { color } : {}), ...(cal.name ? { calendar: cal.name } : {}) });
    }
  });
  if (failed) return failed;
  out.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  return { ok: true, events: out };
}

// ------------------------------------------------------------------ Gmail

/** „=?UTF-8?B?...?=“ in Kopfzeilen (Betreff, Namen) lesbar machen. */
function decodeWords(s) {
  return (s || "").replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset, enc, text) => {
    try {
      const bytes =
        enc.toUpperCase() === "B"
          ? Buffer.from(text, "base64")
          : Buffer.from(text.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16))), "latin1");
      return new TextDecoder(charset).decode(bytes);
    } catch {
      return text;
    }
  });
}

function parseAddress(raw) {
  const s = decodeWords(raw || "").trim();
  const m = s.match(/^(.*?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].replace(/^"|"$/g, "").trim() || m[2], address: m[2] };
  return { name: s, address: s };
}

const decodePart = (data) => Buffer.from(data, "base64url").toString("utf8");

function htmlToText(h) {
  return h
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function bodyOf(payload) {
  const plain = [];
  const html = [];
  (function walk(p) {
    if (!p) return;
    if (p.body?.data && !p.filename) {
      if (p.mimeType === "text/plain") plain.push(decodePart(p.body.data));
      else if (p.mimeType === "text/html") html.push(decodePart(p.body.data));
    }
    (p.parts || []).forEach(walk);
  })(payload);
  const text = plain.length ? plain.join("\n") : html.length ? htmlToText(html.join("\n")) : "";
  return text.trim().slice(0, 20_000);
}

/** „List-Unsubscribe“ (Newsletter): https-Adresse und/oder mailto, dazu „One-Click“ (RFC 8058). */
function parseUnsubscribe(h) {
  const raw = h["list-unsubscribe"];
  if (!raw) return undefined;
  const items = [...String(raw).matchAll(/<([^>]+)>/g)].map((m) => m[1].trim());
  const url = items.find((x) => /^https:\/\//i.test(x));
  const mailto = items.find((x) => /^mailto:/i.test(x));
  if (!url && !mailto) return undefined;
  return { ...(url ? { url } : {}), ...(mailto ? { mailto } : {}), oneClick: /one-click/i.test(h["list-unsubscribe-post"] || "") };
}

/** Namen der Anhänge (nur zur Anzeige). */
function attachmentsOf(payload) {
  const names = [];
  (function walk(p) {
    if (!p) return;
    // Bilder, die nur im Text stehen (Signatur, Logo), zählen nicht
    const inlineImage = (p.headers || []).some((h) => /content-disposition/i.test(h.name) && /^\s*inline/i.test(h.value)) && /^image\//.test(p.mimeType || "");
    if (p.filename && !inlineImage && !/\.(p7s|asc)$/i.test(p.filename)) names.push(p.filename);
    (p.parts || []).forEach(walk);
  })(payload);
  return names.slice(0, 20);
}

/** Gmail-Nachricht → MailMessage (Form wie in web/src/lib/mail-data.ts). */
function toMail(m, folder) {
  const h = {};
  for (const x of m.payload?.headers || []) h[x.name.toLowerCase()] = x.value;
  const from = parseAddress(h.from);
  const d = new Date(Number(m.internalDate) || Date.now());
  return {
    id: m.id,
    accountId: "gmail",
    folder,
    fromName: from.name,
    fromAddress: from.address,
    to: parseAddress((h.to || "").split(",")[0]).name,
    subject: decodeWords(h.subject) || "(No subject)",
    body: bodyOf(m.payload) || m.snippet || "",
    date: `${localDate(d)}T${hhmm(d)}`,
    unread: (m.labelIds || []).includes("UNREAD"),
    threadId: m.threadId,
    messageIdHeader: h["message-id"] || "",
    unsubscribe: parseUnsubscribe(h),
    attachments: attachmentsOf(m.payload),
  };
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

const FOLDER_QUERIES = {
  inbox: { labelIds: "INBOX", max: 40 },
  drafts: { labelIds: "DRAFT", max: 10 },
  sent: { labelIds: "SENT", max: 15 },
  archive: { q: "-in:inbox -in:sent -in:drafts -in:spam -in:trash -in:chats", max: 15 },
};

// Zwischenspeicher: jede Mail wird nur EINMAL ganz geladen (5 Einheiten pro Mail bei Google).
// Danach kosten Abrufe nur noch die Listen (Ordner + ungelesen), das hält das Minuten-Limit ein.
const cache = new Map(); // id → Mail ohne folder/unread
let lastMails = null;
let pauseUntil = 0;

async function listIds(params) {
  const r = await api(`${GMAIL}/messages?${new URLSearchParams(params)}`);
  return r.ok ? { ok: true, ids: (r.data.messages || []).map((m) => m.id) } : r;
}

async function mails() {
  // Nach „zu viele Anfragen“ eine Minute Pause, bis dahin den letzten Stand zeigen
  if (Date.now() < pauseUntil && lastMails) return { ok: true, mails: lastMails };
  const lists = {};
  for (const [folder, spec] of Object.entries(FOLDER_QUERIES)) {
    const r = await listIds({ maxResults: String(spec.max), ...(spec.labelIds ? { labelIds: spec.labelIds } : { q: spec.q }) });
    if (!r.ok) return busyOr(r);
    lists[folder] = r.ids;
  }
  const unread = await listIds({ q: "is:unread", maxResults: "200" });
  if (!unread.ok) return busyOr(unread);
  const unreadSet = new Set(unread.ids);

  const missing = [...new Set(Object.values(lists).flat())].filter((id) => !cache.has(id));
  let failed = null;
  await pool(missing, 3, async (id) => {
    if (failed) return;
    const r = await api(`${GMAIL}/messages/${id}?format=full`);
    if (r.ok) cache.set(id, toMail(r.data, "inbox"));
    else failed = r;
  });

  const seen = new Set();
  const out = [];
  for (const [folder, ids] of Object.entries(lists)) {
    for (const id of ids) {
      const m = cache.get(id);
      if (!m || seen.has(id)) continue; // eine Mail nur einmal (z. B. an sich selbst: Posteingang + Gesendet)
      seen.add(id);
      out.push({ ...m, folder, unread: unreadSet.has(id) });
    }
  }
  lastMails = out;
  if (failed && failed.code === "busy") pauseUntil = Date.now() + 60_000;
  return { ok: true, mails: out };
}

function busyOr(r) {
  if (r.code !== "busy") return r;
  pauseUntil = Date.now() + 60_000;
  return lastMails ? { ok: true, mails: lastMails } : r;
}

/** Gelesen/ungelesen und Archivieren: Gmail-Etiketten ändern. */
async function modify(id, { unread, archive }) {
  const add = [];
  const remove = [];
  if (unread === true) add.push("UNREAD");
  if (unread === false) remove.push("UNREAD");
  if (archive) remove.push("INBOX");
  const r = await api(`${GMAIL}/messages/${encodeURIComponent(id)}/modify`, {
    method: "POST",
    body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
  });
  return r.ok ? { ok: true } : r;
}

const mimeHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);

async function send({ to, subject, body, threadId, inReplyTo }) {
  const recipients = String(to || "")
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (recipients.length === 0 || recipients.some((r) => !/@/.test(r))) return fail("invalid", "Please enter a full email address, like name@example.com.");
  const text = Buffer.from(String(body || ""), "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
  const lines = [
    `To: ${recipients.join(", ")}`,
    `Subject: ${mimeHeader(String(subject || ""))}`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    text,
  ];
  const raw = Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
  const r = await api(`${GMAIL}/messages/send`, { method: "POST", body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }) });
  return r.ok ? { ok: true, id: r.data?.id || "" } : r;
}

// ------------------------------------------------------------------ Schnittstelle

/** Kanäle für die Oberfläche (window.studi.google, Typen in web/src/lib/google.ts). */
function register(handle) {
  handle("studi:google:status", () => status());
  handle("studi:google:connect", () => connect());
  handle("studi:google:disconnect", () => disconnect());
  handle("studi:google:events", (days) => events(Number(days) || 35));
  handle("studi:google:mails", () => mails());
  handle("studi:google:modify", (id, change) => modify(String(id), change || {}));
  handle("studi:google:send", (mail) => send(mail || {}));
}

module.exports = { register, status, connect, disconnect, events, mails, modify, send, _test: { toEvent, toMail, decodeWords, parseAddress, htmlToText, bodyOf } };
