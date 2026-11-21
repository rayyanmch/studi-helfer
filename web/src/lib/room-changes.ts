"use client";

// Raumänderung per Mail: Steht in einer Mail „Tutorial room changed to 1.21“ mit Tag und Uhrzeit, gilt der neue Raum
// nur für diesen einen Termin. Alle anderen Wochen bleiben beim normalen Raum, es muss also nichts zurückgestellt werden.
// Alles ohne KI, nur Regeln. Nur bei eindeutiger Zuordnung (Kurs, Tag, Uhrzeit) wird etwas geändert.

import { useApp } from "./app-store";
import { findRoomInMail } from "./rooms";
import { findEvent, guessCourse } from "./mail-tools";
import { useMail, type MailMessage } from "./mail-data";
import type { Course, Deadline } from "./mock-data";

interface Detected {
  room: string;
  date: string;
  start: string | null;
}

const detectedCache = new Map<string, Detected | null>();

function detect(m: MailMessage): Detected | null {
  const key = `${m.id}|${m.body.length}|${m.subject}`;
  if (detectedCache.has(key)) return detectedCache.get(key) ?? null;
  let out: Detected | null = null;
  if (m.folder !== "sent" && m.folder !== "drafts") {
    const room = findRoomInMail(m.subject, m.body);
    const ev = room ? findEvent(m.subject, m.body, m.date.slice(0, 10)) : null;
    if (room && ev) out = { room, date: ev.date, start: ev.start };
  }
  detectedCache.set(key, out);
  return out;
}

/** Legt die Raumänderungen aus Mails über die Termine. Spätere Mails gelten vor früheren. */
export function applyRoomChanges(deadlines: Deadline[], messages: MailMessage[], courses: Course[]): Deadline[] {
  const changes = new Map<string, { room: string; mail: MailMessage }>();
  const current = courses.filter((c) => !c.semester || c.semester === "current");
  for (const m of [...messages].sort((a, b) => a.date.localeCompare(b.date))) {
    const d = detect(m);
    if (!d) continue;
    const courseId = m.courseId ?? guessCourse(m, current);
    const candidates = deadlines.filter(
      (x) => x.kind === "termin" && x.date === d.date && (!courseId || x.courseId === courseId) && (!d.start || x.time.startsWith(d.start)),
    );
    if (candidates.length !== 1) continue; // nicht eindeutig: lieber nichts ändern
    changes.set(candidates[0].id, { room: d.room, mail: m });
  }
  if (changes.size === 0) return deadlines;
  return deadlines.map((x) => {
    const c = changes.get(x.id);
    if (!c || (x.location ?? "").trim().toLowerCase() === c.room.trim().toLowerCase()) return x;
    return { ...x, location: c.room, roomChange: { was: x.location ?? null, mailId: c.mail.id, subject: c.mail.subject } };
  });
}

/** Wie `applyRoomChanges`, mit den Mails und Kursen der App. */
export function useRoomChanged(deadlines: Deadline[]): Deadline[] {
  const mail = useMail();
  const app = useApp();
  return applyRoomChanges(deadlines, mail.messages, app.courses);
}
