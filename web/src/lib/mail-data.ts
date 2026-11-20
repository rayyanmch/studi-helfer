"use client";

// Mail und Google-Kalender: Typen, Beispieldaten und ein kleiner Speicher für die Oberfläche.
//
// Heute liefert dieser Speicher nur Beispieldaten (Browser). In der Mac-App ist noch nichts
// verbunden: dort zeigt die Oberfläche „Not connected“. Rayyans Hintergrundteil ersetzt später
// die Funktionen unten durch echte (Gmail-API, Uni-Postfach, Google Kalender), die Typen bleiben.

import { useSyncExternalStore } from "react";
import { appStore } from "./app-store";

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
}

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

interface MailState {
  accounts: MailAccount[];
  messages: MailMessage[];
  events: GoogleEvent[];
  calendars: CalendarToggles;
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
    body: "Hi all,\n\nwe moved to a bigger room: 1.21, same time as always.\n\nSee you on Friday!\nJonas",
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
    fromName: "Mika Muster", fromAddress: "mmuster1@smail.uni-koeln.de", to: "Prof. Lindner",
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

const EMPTY: MailState = {
  accounts: ACCOUNTS.map((a) => ({ ...a, connected: false })),
  messages: [],
  events: [],
  calendars: { ilias: true, google: true },
};

let state: MailState = EMPTY;
let mode: "none" | "demo" = "none";
const listeners = new Set<() => void>();

function set(next: Partial<MailState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

/** Beispieldaten laden (Browser-Vorschau). In der Mac-App bleibt alles „Not connected“. */
export function initMail(demo: boolean) {
  const target = demo ? "demo" : "none";
  if (mode === target && state !== EMPTY) return;
  mode = target;
  if (demo) {
    state = { accounts: ACCOUNTS.map((a) => ({ ...a })), messages: MESSAGES.map((m) => ({ ...m })), events: EVENTS, calendars: loadToggles() };
  } else {
    state = { ...EMPTY, calendars: loadToggles() };
  }
  listeners.forEach((l) => l());
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

export function setMailRead(id: string, unread: boolean) {
  set({ messages: state.messages.map((m) => (m.id === id ? { ...m, unread } : m)) });
}

export function archiveMail(id: string) {
  set({ messages: state.messages.map((m) => (m.id === id ? { ...m, folder: "archive", unread: false } : m)) });
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
}

export function sendMail(m: OutgoingMail) {
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
