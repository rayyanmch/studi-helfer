"use client";

// Mail und Google-Kalender: Typen, Beispieldaten und ein kleiner Speicher für die Oberfläche.
//
// Browser: Beispieldaten. Mac-App: echtes Google-Konto (Gmail und Kalender über desktop/lib/google.js,
// Anbindung in web/src/lib/google.ts). Uni-Postfach per IMAP/SMTP mit dem ILIAS-Login (desktop/lib/unimail.js).

import { useSyncExternalStore } from "react";
import { appStore } from "./app-store";
import { getGoogle, getMailTools, getUniMail } from "./google";
import { stamp } from "./mail-tools";

export type MailAccountId = "gmail" | "uni";
export type MailFolder = "inbox" | "sent" | "drafts" | "archive";

export interface MailAccount {
  id: MailAccountId;
  name: string; // „Gmail“
  address: string;
  kind: "google" | "uni";
  connected: boolean;
}

export interface MailMessage {
  id: string;
  accountId: MailAccountId;
  folder: MailFolder;
  fromName: string;
  fromAddress: string;
  to: string; // Anzeigename des Empfängers (bei Gesendet)
  subject: string;
  body: string;
  date: string; // "2026-11-20T09:12" (lokale Zeit)
  unread: boolean;
  courseId?: string; // nur gesetzt, wenn die App den Kurs erkannt hat
  threadId?: string; // Gmail: für Antworten
  messageIdHeader?: string; // Gmail: „Message-ID“ der Mail, für „In-Reply-To“
  unsubscribe?: Unsubscribe; // Newsletter: Abmelde-Link aus dem Kopf der Mail („List-Unsubscribe“)
  attachments?: string[]; // Namen der Anhänge (nur zur Anzeige)
}

/** Abmelden bei Newslettern: https-Adresse und/oder mailto; `oneClick` = ohne Webseite möglich (RFC 8058). */
export interface Unsubscribe {
  url?: string;
  mailto?: string;
  oneClick: boolean;
}

/** Mail, die gerade verschickt wird: 10 Sekunden zum Zurücknehmen, dann geht sie raus. */
export interface Outbox {
  id: number;
  mail: OutgoingMail;
  status: "waiting" | "sending" | "failed";
  error: string;
}
export const UNDO_SECONDS = 10;

/** Termin aus dem Google Kalender (nur lesen). */
export interface GoogleEvent {
  id: string;
  title: string;
  date: string; // "2026-11-23"
  time: string; // "18:00", "09:00 to 15:00" oder "all day"
  location?: string;
}

export interface CalendarToggles {
  ilias: boolean;
  google: boolean;
}

export interface GoogleInfo {
  available: boolean; // Zugangsdatei vorhanden (nur Mac-App)
  expired: boolean; // Anmeldung abgelaufen, neu verbinden
  loading: boolean;
  error: string;
}

interface MailState {
  accounts: MailAccount[];
  messages: MailMessage[];
  events: GoogleEvent[];
  calendars: CalendarToggles;
  google: GoogleInfo;
  uni: { error: string };
  snoozed: Record<string, string>; // Mail-Id → "2026-11-22T08:00" (kommt dann zurück in den Posteingang)
  unsubscribed: string[]; // Absender-Adressen, bei denen schon abbestellt wurde
  ignoredEvents: string[]; // Mail-Ids, bei denen der Terminvorschlag abgelehnt wurde
  outbox: Outbox | null;
}

// --- Beispieldaten ------------------------------------------------------------

const ACCOUNTS: MailAccount[] = [
  { id: "gmail", name: "Gmail", address: "mika.muster@gmail.com", kind: "google", connected: true },
  { id: "uni", name: "University mail", address: "mmuster1@smail.uni-koeln.de", kind: "uni", connected: true },
];

function msg(m: Partial<MailMessage> & Pick<MailMessage, "id" | "accountId" | "subject" | "body" | "date">): MailMessage {
  return {
    folder: "inbox",
    fromName: "",
    fromAddress: "",
    to: "",
    unread: false,
    ...m,
  };
}

const MESSAGES: MailMessage[] = [
  msg({
    id: "u1", accountId: "uni", courseId: "mathe", unread: true, date: "2026-11-20T09:12",
    fromName: "Prof. Lindner", fromAddress: "lindner@uni-koeln.de",
    subject: "Sheet 7 moved to Tuesday",
    attachments: ["Sheet 7.pdf"],
    body: "Hello everyone,\n\ndue to the holiday on Monday, the deadline for Sheet 7 moves to Tuesday, November 24, at 10:00.\n\nTask 3 needs theorem 4.2 from the lecture notes. Please read it again before you start.\n\nBest regards\nProf. Lindner",
  }),
  msg({
    id: "u2", accountId: "uni", courseId: "softwaretechnik", unread: true, date: "2026-11-19T18:05",
    fromName: "ILIAS", fromAddress: "no-reply@ilias.uni-koeln.de",
    subject: "New file in Software Engineering",
    body: "Hello,\n\nthere is a new file in your course Software Engineering:\n\n03 Design Patterns.pdf\n\nYou are receiving this message because you are a member of the course.",
  }),
  msg({
    id: "u3", accountId: "uni", courseId: "softwaretechnik", unread: true, date: "2026-11-19T17:20",
    fromName: "Tutor Jonas", fromAddress: "jonas.keller@smail.uni-koeln.de",
    subject: "Tutorial room changed to 1.21",
    body: "Hi all,\n\nwe moved to a bigger room: 1.21, same time as always.\n\nOur next tutorial is on Friday, November 27 at 14:00 in room 1.21. See you there!\nJonas",
  }),
  msg({
    id: "u4", accountId: "uni", courseId: "datenbanken", unread: true, date: "2026-11-18T11:30",
    fromName: "Dr. Krüger", fromAddress: "krueger@uni-koeln.de",
    subject: "Exam registration",
    body: "Dear students,\n\nregistration for the Databases exam closes on November 26. Please register in KLIPS in time. Late registrations cannot be accepted.\n\nBest regards\nDr. Krüger",
  }),
  msg({
    id: "u5", accountId: "uni", courseId: "bwl", date: "2026-11-17T14:02",
    fromName: "Prof. Brandt", fromAddress: "brandt@uni-koeln.de",
    subject: "Case study feedback",
    body: "Hello,\n\noverall a solid analysis. The cost calculation in part 2 needs more detail, please have a look at chapter 5 again.\n\nBest regards\nProf. Brandt",
  }),
  msg({
    id: "u6", accountId: "uni", date: "2026-11-12T09:00",
    fromName: "Student Office", fromAddress: "studierendenservice@uni-koeln.de",
    subject: "Reminder: semester fee",
    body: "Dear student,\n\nthis is a reminder that the semester fee for the summer term is due by January 15. You can see the amount in your student portal.\n\nStudent Office",
  }),
  msg({
    id: "g1", accountId: "gmail", unread: true, date: "2026-11-20T08:15",
    fromName: "Anna", fromAddress: "anna.b@gmail.com",
    subject: "Dinner on Thursday?",
    body: "Hey!\n\nAre you free on Thursday around 19:30? I found a nice place near the Rhine.\n\nAnna",
  }),
  msg({
    id: "g2", accountId: "gmail", unread: true, date: "2026-11-19T12:40",
    fromName: "Leo", fromAddress: "leo.n@gmail.com",
    subject: "Weekend trip in December?",
    body: "Hi Mika,\n\nwe are thinking about a weekend in the mountains before Christmas. Are you in? Prices go up next week, so we should decide soon.\n\nLeo",
  }),
  msg({
    id: "g5", accountId: "gmail", unread: true, date: "2026-11-20T07:30",
    fromName: "StudiDeals", fromAddress: "news@studideals.example",
    unsubscribe: { url: "https://studideals.example/unsubscribe", oneClick: true },
    subject: "−40% on laptop sleeves this week",
    body: "Hi Mika,\n\nthis week only: 40% off laptop sleeves and notebooks. Shop now before the semester gets busy!\n\nYour StudiDeals team",
  }),
  msg({
    id: "g6", accountId: "gmail", date: "2026-11-17T07:30",
    fromName: "StudiDeals", fromAddress: "news@studideals.example",
    unsubscribe: { url: "https://studideals.example/unsubscribe", oneClick: true },
    subject: "Back to campus: our top 10",
    body: "Hi Mika,\n\nhere are the ten most loved items for your desk.\n\nYour StudiDeals team",
  }),
  msg({
    id: "g7", accountId: "gmail", date: "2026-11-10T07:30",
    fromName: "StudiDeals", fromAddress: "news@studideals.example",
    unsubscribe: { url: "https://studideals.example/unsubscribe", oneClick: true },
    subject: "Weekend sale starts now",
    body: "Hi Mika,\n\nour weekend sale is live.\n\nYour StudiDeals team",
  }),
  msg({
    id: "g3", accountId: "gmail", date: "2026-11-16T10:10",
    fromName: "DHL", fromAddress: "noreply@dhl.de",
    subject: "Your parcel is on its way",
    body: "Hello Mika,\n\nyour parcel will be delivered tomorrow between 10:00 and 14:00.\n\nYour DHL team",
  }),
  msg({
    id: "g4", accountId: "gmail", date: "2026-11-10T19:22",
    fromName: "FitStudio", fromAddress: "service@fitstudio.example",
    subject: "Your membership summary",
    body: "Hello Mika,\n\nhere is your monthly summary. Thanks for training with us.\n\nFitStudio",
  }),
  msg({
    id: "s1", accountId: "uni", folder: "sent", courseId: "mathe", date: "2026-11-14T16:48",
    fromName: "Me", fromAddress: "mmuster1@smail.uni-koeln.de", to: "Prof. Lindner",
    subject: "Question about task 3",
    body: "Dear Prof. Lindner,\n\nI have a question about task 3. Is theorem 4.2 also allowed for the second part?\n\nBest regards\nMika",
  }),
  msg({
    id: "d1", accountId: "gmail", folder: "drafts", date: "2026-11-19T22:05",
    fromName: "Mika Muster", fromAddress: "mika.muster@gmail.com", to: "Leo",
    subject: "Re: Weekend trip in December?",
    body: "Hi Leo,\n\nsounds good, I'm in if we stay",
  }),
  msg({
    id: "a1", accountId: "gmail", folder: "archive", date: "2026-11-02T08:00",
    fromName: "Spotify", fromAddress: "no-reply@spotify.example",
    subject: "Your receipt",
    body: "Thanks for your payment. Your receipt is attached.",
  }),
];

const EVENTS: GoogleEvent[] = [
  { id: "e1", title: "Gym", date: "2026-11-23", time: "18:00" },
  { id: "e2", title: "Work, café", date: "2026-11-24", time: "09:00 to 15:00", location: "Café Central" },
  { id: "e3", title: "Dinner with Anna", date: "2026-11-26", time: "19:30" },
  { id: "e4", title: "Dentist", date: "2026-11-27", time: "08:30" },
  { id: "e5", title: "Birthday party", date: "2026-11-28", time: "all day" },
];

// --- Speicher -------------------------------------------------------------------

const KEY = "studi.calendars";

function loadToggles(): CalendarToggles {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<CalendarToggles>;
      return { ilias: p.ilias !== false, google: p.google !== false };
    }
  } catch {
    // egal
  }
  return { ilias: true, google: true };
}

// Snooze, Abmeldungen und abgelehnte Terminvorschläge merkt sich die App nur auf diesem Mac (Demo getrennt davon).
const storeKey = (name: string) => `studi.${name}${mode === "demo" ? ".demo" : ""}`;

function loadJson<T>(name: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(storeKey(name));
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // egal
  }
  return fallback;
}

function saveJson(name: string, value: unknown) {
  try {
    window.localStorage.setItem(storeKey(name), JSON.stringify(value));
  } catch {
    // ohne Speicher gilt es nur bis zum Neustart
  }
}

const persisted = () => ({
  calendars: loadToggles(),
  snoozed: loadJson<Record<string, string>>("snoozed", {}),
  unsubscribed: loadJson<string[]>("unsubscribed", []),
  ignoredEvents: loadJson<string[]>("ignoredEvents", []),
});

const EMPTY: MailState = {
  accounts: ACCOUNTS.map((a) => ({ ...a, connected: false })),
  messages: [],
  events: [],
  calendars: { ilias: true, google: true },
  google: { available: true, expired: false, loading: false, error: "" },
  uni: { error: "" },
  snoozed: {},
  unsubscribed: [],
  ignoredEvents: [],
  outbox: null,
};

let state: MailState = EMPTY;
let mode: "none" | "demo" | "desktop" = "none";
let timer: ReturnType<typeof setInterval> | undefined;
let sweepTimer: ReturnType<typeof setInterval> | undefined;
let pageHookSet = false;
const listeners = new Set<() => void>();

function set(next: Partial<MailState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

/** Browser: Beispieldaten laden. Mac-App: Google-Konto abfragen (Mails und Termine, falls verbunden). */
export function initMail(demo: boolean) {
  const target = demo ? "demo" : "desktop";
  if (mode === target && state !== EMPTY) return;
  mode = target;
  clearInterval(timer);
  clearInterval(sweepTimer);
  if (!pageHookSet) {
    pageHookSet = true;
    // Schließt das Fenster, während eine Mail auf „Undo“ wartet, geht sie lieber sofort raus als verloren
    window.addEventListener("pagehide", () => flushOutbox());
  }
  if (demo) {
    state = {
      ...EMPTY,
      accounts: ACCOUNTS.map((a) => ({ ...a })),
      messages: MESSAGES.map((m) => ({ ...m })),
      events: EVENTS,
      ...persisted(),
    };
    listeners.forEach((l) => l());
    sweepSnoozed();
    sweepTimer = setInterval(sweepSnoozed, 20_000);
    return;
  }
  state = { ...EMPTY, ...persisted() };
  listeners.forEach((l) => l());
  sweepTimer = setInterval(sweepSnoozed, 20_000);
  void refreshGoogle();
  void refreshUni();
  // Alle 2 Minuten nachsehen, ob neue Mails oder Termine da sind
  timer = setInterval(() => {
    void refreshGoogle(true);
    void refreshUni();
  }, 120_000);
}

export function useMail(): MailState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => EMPTY,
  );
}

export const isMailDemo = () => mode === "demo";

// --- Google (nur Mac-App) ---------------------------------------------------------

const withGmail = (accounts: MailAccount[], patch: Partial<MailAccount>) => accounts.map((a) => (a.id === "gmail" ? { ...a, ...patch } : a));

/** Holt Kalender und Mails von Google (still im Hintergrund, wenn `quiet`). */
export async function refreshGoogle(quiet = false) {
  const g = getGoogle();
  if (!g || mode !== "desktop") return;
  if (!quiet) set({ google: { ...state.google, loading: true } });
  const st = await g.status();
  if (!st.connected) {
    set({
      accounts: withGmail(state.accounts, { connected: false, address: st.email }),
      messages: state.messages.filter((m) => m.accountId !== "gmail"),
      events: [],
      google: { available: st.available, expired: st.expired, loading: false, error: "" },
    });
    return;
  }
  const [ev, ma] = await Promise.all([g.events(), g.mails()]);
  const error = !ev.ok ? ev.message : !ma.ok ? ma.message : "";
  set({
    accounts: withGmail(state.accounts, { connected: true, address: st.email }),
    events: ev.ok ? ev.events : state.events,
    messages: ma.ok ? [...ma.mails, ...state.messages.filter((m) => m.accountId !== "gmail")] : state.messages,
    google: { available: st.available, expired: false, loading: false, error },
  });
}

// --- Uni-Postfach (nur Mac-App) ----------------------------------------------------

const withUni = (accounts: MailAccount[], patch: Partial<MailAccount>) => accounts.map((a) => (a.id === "uni" ? { ...a, ...patch } : a));
let uniBusy = false;

/** Holt die Uni-Mails (IMAP über den Hintergrundteil). */
export async function refreshUni() {
  const u = getUniMail();
  if (!u || mode !== "desktop" || uniBusy) return;
  uniBusy = true;
  try {
    const st = await u.status();
    if (!st.connected) {
      set({ accounts: withUni(state.accounts, { connected: false, address: st.address }), messages: state.messages.filter((m) => m.accountId !== "uni") });
      return;
    }
    set({ accounts: withUni(state.accounts, { connected: true, address: st.address }) });
    const res = await u.mails();
    if (!res.ok) return set({ uni: { error: res.message } });
    set({ messages: [...state.messages.filter((m) => m.accountId !== "uni"), ...res.mails], uni: { error: "" } });
  } finally {
    uniBusy = false;
  }
}

/** „Connect“ beim Uni-Postfach: prüft den ILIAS-Login am Mailserver. Gibt einen Fehlertext zurück oder null. */
export async function connectUni(): Promise<string | null> {
  if (mode === "demo") {
    await new Promise((r) => setTimeout(r, 900));
    connectAccount("uni");
    return null;
  }
  const u = getUniMail();
  if (!u) return "Please update the app to connect university mail.";
  const res = await u.connect();
  if (!res.ok) return res.message;
  await refreshUni();
  return null;
}

export async function disconnectUni() {
  if (mode === "demo") return disconnectAccount("uni");
  await getUniMail()?.disconnect();
  await refreshUni();
}

/** „Connect Google“: öffnet den Browser des Macs. Gibt einen Fehlertext zurück oder null. */
export async function connectGoogle(): Promise<string | null> {
  if (mode === "demo") {
    await new Promise((r) => setTimeout(r, 900));
    connectAccount("gmail");
    return null;
  }
  const g = getGoogle();
  if (!g) return "Please update the app to connect Google.";
  const res = await g.connect();
  if (!res.ok) return res.message;
  await refreshGoogle();
  return null;
}

export async function disconnectGoogle() {
  if (mode === "demo") return disconnectAccount("gmail");
  await getGoogle()?.disconnect();
  await refreshGoogle();
}

// --- Aktionen (später: echte Funktionen im Hintergrundteil) -----------------------

export function setCalendar(key: keyof CalendarToggles, on: boolean) {
  const calendars = { ...state.calendars, [key]: on };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(calendars));
  } catch {
    // ohne Speicher gilt die Wahl nur bis zum Neustart
  }
  set({ calendars });
}

const accountOf = (id: string) => state.messages.find((m) => m.id === id)?.accountId;

/** Ändert auch im echten Postfach (sofort in der Oberfläche, im Hintergrund bei Google bzw. der Uni). */
// Änderungen laufen nacheinander (bei der Uni öffnet jede eine Verbindung, 40 gleichzeitig wären zu viel)
let syncChain: Promise<void> = Promise.resolve();

function syncChange(id: string, change: { unread?: boolean; archive?: boolean }): Promise<void> {
  if (mode !== "desktop") return Promise.resolve();
  const account = accountOf(id);
  syncChain = syncChain.then(async () => {
    if (account === "gmail") {
      const res = await getGoogle()?.modify(id, change);
      if (res && !res.ok) set({ google: { ...state.google, error: res.message } });
    } else if (account === "uni") {
      const res = await getUniMail()?.modify(id, change);
      if (res && !res.ok) set({ uni: { error: res.message } });
    }
  });
  return syncChain;
}

export function setMailRead(id: string, unread: boolean) {
  set({ messages: state.messages.map((m) => (m.id === id ? { ...m, unread } : m)) });
  void syncChange(id, { unread });
}

export function archiveMail(id: string) {
  const account = accountOf(id);
  const done = syncChange(id, { archive: true, unread: false });
  if (account === "uni") void done.then(() => refreshUni()); // im Archiv hat die Mail eine neue Kennung
  set({ messages: state.messages.map((m) => (m.id === id ? { ...m, folder: "archive", unread: false } : m)) });
  if (state.snoozed[id]) unsnoozeMail(id);
}

/** Alle Mails eines Absenders im Posteingang archivieren. Gibt zurück, wie viele es waren. */
export function archiveSender(address: string): number {
  const a = address.toLowerCase();
  const ids = state.messages.filter((m) => m.folder === "inbox" && m.fromAddress.toLowerCase() === a).map((m) => m.id);
  ids.forEach(archiveMail);
  return ids.length;
}

// --- Später erinnern (Snooze) -------------------------------------------------------

/** Mail verschwindet aus dem Posteingang und kommt zur gewählten Zeit ungelesen zurück (nur auf diesem Mac). */
export function snoozeMail(id: string, until: string) {
  const snoozed = { ...state.snoozed, [id]: until };
  saveJson("snoozed", snoozed);
  set({ snoozed });
}

export function unsnoozeMail(id: string) {
  const { [id]: _gone, ...snoozed } = state.snoozed;
  void _gone;
  saveJson("snoozed", snoozed);
  set({ snoozed });
}

function sweepSnoozed() {
  const now = stamp(new Date());
  const due = Object.entries(state.snoozed)
    .filter(([, until]) => until <= now)
    .map(([id]) => id);
  if (due.length === 0) return;
  const snoozed = { ...state.snoozed };
  due.forEach((id) => delete snoozed[id]);
  saveJson("snoozed", snoozed);
  set({ snoozed, messages: state.messages.map((m) => (due.includes(m.id) ? { ...m, unread: true } : m)) });
}

// --- Newsletter abbestellen ---------------------------------------------------------

/** Bestellt den Newsletter ab. `opened` = die Seite des Absenders ist im Browser offen, dort noch bestätigen. */
export async function unsubscribeMail(m: MailMessage): Promise<{ error?: string; opened?: boolean }> {
  const u = m.unsubscribe;
  if (!u) return { error: "This mail has no unsubscribe link." };
  let opened = false;
  if (mode === "demo") {
    await new Promise((r) => setTimeout(r, 700));
  } else if (u.url) {
    const tools = getMailTools();
    if (!tools) return { error: "Please update the app to unsubscribe." };
    const res = await tools.unsubscribe({ url: u.url, oneClick: u.oneClick });
    if (!res.ok) return { error: res.message };
    opened = res.how === "opened";
  } else if (u.mailto) {
    const [addr, query = ""] = u.mailto.replace(/^mailto:/i, "").split("?");
    const subject = new URLSearchParams(query).get("subject") || "unsubscribe";
    const err = await deliver({ accountId: m.accountId, to: decodeURIComponent(addr), subject, body: "unsubscribe" });
    if (err) return { error: err };
  }
  const unsubscribed = [...new Set([...state.unsubscribed, m.fromAddress.toLowerCase()])];
  saveJson("unsubscribed", unsubscribed);
  set({ unsubscribed });
  return { opened };
}

/** „Looks like an event“ nicht mehr zeigen. */
export function ignoreEvent(id: string) {
  const ignoredEvents = [...state.ignoredEvents, id];
  saveJson("ignoredEvents", ignoredEvents);
  set({ ignoredEvents });
}

export function connectAccount(id: MailAccountId) {
  set({ accounts: state.accounts.map((a) => (a.id === id ? { ...a, connected: true } : a)) });
}

export function disconnectAccount(id: MailAccountId) {
  set({ accounts: state.accounts.map((a) => (a.id === id ? { ...a, connected: false } : a)) });
}

export interface OutgoingMail {
  accountId: MailAccountId;
  to: string;
  subject: string;
  body: string;
  threadId?: string; // Antwort in derselben Unterhaltung (Gmail)
  inReplyTo?: string; // Message-ID der Mail, auf die geantwortet wird
}

/** Schickt die Mail wirklich ab. Gibt einen Fehlertext zurück oder null. */
async function deliver(m: OutgoingMail): Promise<string | null> {
  if (mode !== "desktop") return null;
  if (m.accountId === "gmail") {
    const res = await getGoogle()?.send({ to: m.to, subject: m.subject, body: m.body, threadId: m.threadId, inReplyTo: m.inReplyTo });
    if (!res) return "Please update the app to send mail.";
    return res.ok ? null : res.message;
  }
  const res = await getUniMail()?.send({ to: m.to, subject: m.subject, body: m.body, inReplyTo: m.inReplyTo });
  if (!res) return "Please update the app to send mail.";
  return res.ok ? null : res.message;
}

// Senden mit „Undo“: Die Mail wartet UNDO_SECONDS Sekunden, dann geht sie raus.
let outboxTimer: ReturnType<typeof setTimeout> | undefined;
let outboxId = 0;

/** Legt die Mail in den Ausgang. Wartet schon eine andere, geht die sofort raus. */
export function queueSend(m: OutgoingMail) {
  flushOutbox();
  const box: Outbox = { id: ++outboxId, mail: m, status: "waiting", error: "" };
  set({ outbox: box });
  outboxTimer = setTimeout(() => void runSend(box), UNDO_SECONDS * 1000);
}

async function runSend(box: Outbox) {
  clearTimeout(outboxTimer);
  if (state.outbox?.id === box.id) set({ outbox: { ...box, status: "sending" } });
  const err = await deliver(box.mail);
  if (err) {
    if (state.outbox?.id === box.id) set({ outbox: { ...box, status: "failed", error: err } });
    else set({ google: { ...state.google, error: err } });
    return;
  }
  addSent(box.mail);
  if (state.outbox?.id === box.id) set({ outbox: null });
}

/** Sofort senden, wenn noch eine Mail wartet (neue Mail, Fenster zu). */
export function flushOutbox() {
  const box = state.outbox;
  if (box?.status === "waiting") void runSend(box);
}

/** „Undo“: nimmt die Mail zurück und gibt sie zurück, damit das Schreibfenster wieder aufgeht. */
export function undoSend(): OutgoingMail | null {
  const box = state.outbox;
  if (!box || box.status === "sending") return null;
  clearTimeout(outboxTimer);
  set({ outbox: null });
  return box.mail;
}

function addSent(m: OutgoingMail) {
  const account = state.accounts.find((a) => a.id === m.accountId);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${appStore.get().today}T${pad(now.getHours())}:${pad(now.getMinutes())}`; // Tag der App, Uhrzeit jetzt
  const sent: MailMessage = {
    id: `sent-${now.getTime()}`,
    accountId: m.accountId,
    folder: "sent",
    fromName: "Mika Muster",
    fromAddress: account?.address ?? "",
    to: m.to,
    subject: m.subject,
    body: m.body,
    date,
    unread: false,
  };
  set({ messages: [sent, ...state.messages] });
}

// --- Anzeige ----------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** „09:12“ heute, „Yesterday“, sonst „Nov 18“. `today` = Datum von heute („2026-11-20“). */
export function mailDate(iso: string, today: string): string {
  const day = iso.slice(0, 10);
  if (day === today) return iso.slice(11, 16);
  const t = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const d = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
  if (Math.round((t - d) / 86_400_000) === 1) return "Yesterday";
  return `${MONTHS[+day.slice(5, 7) - 1]} ${+day.slice(8, 10)}`;
}

/** Lange Form für den Lesebereich: „Today, 09:12“ / „Nov 18, 11:30“. */
export function mailDateLong(iso: string, today: string): string {
  const day = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  if (day === today) return `Today, ${time}`;
  const short = mailDate(iso, today);
  return short === "Yesterday" ? `Yesterday, ${time}` : `${short}, ${time}`;
}
