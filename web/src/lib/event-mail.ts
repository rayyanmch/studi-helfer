"use client";

// Mails zu Terminen: Schreibt der Dozent „Die Vorlesung am Donnerstag entfällt“, „Übung heute 15 Minuten später“,
// „Abgabe verlängert“ oder „statt Kapitel 5 behandeln wir …“, bekommt genau dieser Termin im Kalender einen roten
// Hinweis mit der Zahl der Mails (Klick öffnet die Mail). Ohne KI, nur Regeln, und nur bei klarer Zuordnung:
// Kurs der Mail erkannt (Postfach oder guessCourse), Tag in der Mail (oder „nächster Termin“ bei Änderungswörtern),
// Art passt (Vorlesung/Übung/Abgabe/Klausur), Uhrzeit passt, höchstens 3 Termine.

import { useMemo } from "react";
import { useApp } from "./app-store";
import { useMail, type MailMessage } from "./mail-data";
import { findMailDay, guessCourse } from "./mail-tools";
import type { Course, Deadline } from "./mock-data";

export type EventMailKind = "cancelled" | "moved" | "later" | "room" | "online" | "topic" | "extended" | "info";

export const EVENT_MAIL_LABEL: Record<EventMailKind, string> = {
  cancelled: "Cancelled",
  moved: "Moved",
  later: "Starts later",
  room: "Room changed",
  online: "Online instead",
  topic: "Topic changed",
  extended: "Deadline extended",
  info: "Mail about this",
};

export interface EventMail {
  mail: MailMessage;
  kind: EventMailKind;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").toLowerCase();
const WD = "(montag|dienstag|mittwoch|donnerstag|freitag|monday|tuesday|wednesday|thursday|friday)";

// Reihenfolge = Vorrang (eine Mail bekommt eine Art)
const RULES: [EventMailKind, RegExp][] = [
  [
    "cancelled",
    /(entfallt|entfallen|\bfallt\b[^.\n]{0,40}\baus\b|\bfallen\b[^.\n]{0,40}\baus\b|ausfall|abgesagt|findet[^.\n]{0,40}nicht statt|keine (vorlesung|ubung|tutorium|sitzung|veranstaltung)|cancel+ed|cancel+ation|will not take place|does not take place|won.t take place|no (lecture|class|tutorial|exercise|session)s?\b)/,
  ],
  ["extended", /(verlangert|fristverlangerung|extended|extension)/],
  ["online", /(findet online statt|online statt|nur online|via zoom|per zoom|takes place online|will be (held )?online|virtuell statt)/],
  ["room", /(raumanderung|raumwechsel|anderen raum|neuer raum|neuen raum|room change|new room|different room|room has changed|moved to (room|raum)|verlegt in (raum|den|hs|horsaal))/],
  ["later", /(spater|verspat|beginnt erst|verzogert|starts? later|delayed|late start|begins at)/],
  ["moved", new RegExp(`(verschoben|verlegt|neuer termin|anderer termin|postponed|rescheduled|new date|new time|moved to|statt am ${WD}|instead of ${WD})`)],
  [
    "topic",
    /(themenanderung|anderes thema|neues thema|thema[^.\n]{0,30}(geandert|getauscht)|topic[^.\n]{0,30}(change|switch)|(change|switch)[^.\n]{0,20}topic|new topic|instead[^.\n]{0,60}(cover|discuss|talk about)|statt[^.\n]{0,60}(behandeln|besprechen)|vorgezogen)/,
  ],
];

type EventType = "lecture" | "exercise" | "exam" | "deadline";
const TYPE_WORDS: [EventType, RegExp][] = [
  ["exam", /(klausur|prufung|exam\b|exams\b|probeklausur)/],
  ["deadline", /(abgabe|deadline|\bdue\b|ubungsblatt|\bblatt\b|\bsheet\b|homework|hausaufgabe|submission)/],
  ["exercise", /(ubung|tutorium|tutorial|exercise|seminar|gruppe|group|lab\b|praktikum)/],
  ["lecture", /(vorlesung|lecture|\bvl\b|sitzung|session|class\b)/],
];
const ANY_EVENT = /(vorlesung|lecture|ubung|tutorium|tutorial|exercise|seminar|sitzung|session|klausur|exam|abgabe|deadline|blatt|sheet|termin|class)/;

function typeOf(d: Deadline): EventType {
  if (d.kind === "klausur") return "exam";
  if (d.kind === "abgabe") return "deadline";
  return /(übung|uebung|ubung|exercise|tutor|seminar|group|gruppe|lab|praktikum)/i.test(d.title) ? "exercise" : "lecture";
}

const startOf = (time: string) => {
  const m = /(\d{1,2}):(\d{2})/.exec(time);
  return m ? +m[1] * 60 + +m[2] : -1;
};
const plusDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

interface Reading {
  kind: EventMailKind;
  type: EventType | null;
  day: { date: string; start: string | null } | null;
  mentionsEvent: boolean;
}
const readCache = new Map<string, Reading>();

function read(m: MailMessage): Reading {
  const key = `${m.id}|${m.subject}|${m.body.length}`;
  const hit = readCache.get(key);
  if (hit) return hit;
  const lines = m.body.split("\n").filter((l) => !l.trimStart().startsWith(">"));
  const text = fold(`${m.subject}\n${lines.join("\n").slice(0, 3000)}`);
  const kind = RULES.find(([, re]) => re.test(text))?.[0] ?? "info";
  const type = TYPE_WORDS.find(([, re]) => re.test(text))?.[0] ?? null;
  const day = findMailDay(m.subject, m.body, m.date.slice(0, 10));
  const out = { kind, type, day, mentionsEvent: ANY_EVENT.test(text) };
  readCache.set(key, out);
  return out;
}

/** Was eine Mail über einen Termin sagt (für MailView: bei einer Absage keinen „Looks like an event“-Vorschlag). */
export function mailChangeKind(m: MailMessage): EventMailKind {
  return read(m).kind;
}

/** Ordnet Mails den Terminen zu: Termin-Id → Mails (neueste zuerst). */
export function matchEventMails(deadlines: Deadline[], messages: MailMessage[], courses: Course[], today: string): Map<string, EventMail[]> {
  const out = new Map<string, EventMail[]>();
  if (!today) return out;
  const current = courses.filter((c) => !c.semester || c.semester === "current");
  const since = plusDays(today, -30);
  for (const m of messages) {
    if (m.folder === "sent" || m.folder === "drafts" || m.unsubscribe) continue;
    const mailDay = m.date.slice(0, 10);
    if (mailDay < since) continue;
    const courseId = m.courseId ?? guessCourse(m, current);
    if (!courseId) continue;
    const r = read(m);
    if (!r.mentionsEvent) continue;
    if (r.kind === "info" && !r.day) continue; // ohne Änderungswort nur mit genauem Tag

    let pool = deadlines.filter((d) => d.courseId === courseId && d.date >= mailDay);
    if (r.type) pool = pool.filter((d) => typeOf(d) === r.type);
    else if (r.kind === "extended") pool = pool.filter((d) => d.kind === "abgabe");

    let picked: Deadline[];
    if (r.type === "deadline" || r.kind === "extended") {
      // Abgaben: der genannte Tag ist oft schon der neue; nimm die nächste Abgabe in der Nähe
      const target = r.day?.date ?? mailDay;
      picked = pool
        .filter((d) => Math.abs((Date.parse(d.date) - Date.parse(target)) / 86_400_000) <= 10)
        .sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(target)) - Math.abs(Date.parse(b.date) - Date.parse(target)))
        .slice(0, 1);
    } else if (r.day) {
      picked = pool.filter((d) => d.date === r.day!.date);
      if (r.day.start && picked.length > 1) {
        const t = startOf(r.day.start);
        const near = picked.filter((d) => Math.abs(startOf(d.time) - t) <= 45);
        if (near.length) picked = near;
      }
    } else {
      // „Die Vorlesung fällt aus“ ohne Tag: der nächste passende Termin innerhalb einer Woche
      const soon = pool.filter((d) => d.date <= plusDays(mailDay, 7)).sort((a, b) => a.date.localeCompare(b.date) || startOf(a.time) - startOf(b.time));
      picked = soon.length ? soon.filter((d) => d.date === soon[0].date) : [];
    }
    if (!picked.length || picked.length > 3) continue; // nicht eindeutig: lieber kein Hinweis
    for (const d of picked) out.set(d.id, [...(out.get(d.id) ?? []), { mail: m, kind: r.kind }]);
  }
  for (const list of out.values()) list.sort((a, b) => b.mail.date.localeCompare(a.mail.date));
  return out;
}

/** Hinweise für die Termine der App (Kalender, Startseite, Termin-Fenster). */
export function useEventMails(deadlines: Deadline[]): Map<string, EventMail[]> {
  const mail = useMail();
  const app = useApp();
  return useMemo(() => matchEventMails(deadlines, mail.messages, app.courses, app.today), [deadlines, mail.messages, app.courses, app.today]);
}

/** Wichtigste Art unter mehreren Mails (Absage vor allem anderen). */
export function topKind(list: EventMail[]): EventMailKind {
  const order: EventMailKind[] = ["cancelled", "moved", "later", "room", "online", "extended", "topic", "info"];
  return order.find((k) => list.some((x) => x.kind === k)) ?? "info";
}
