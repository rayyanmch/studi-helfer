// Kleine Helfer für Mail: Snooze-Zeiten, Termine im Text finden, Suchbefehle lesen.
// Alles ohne KI, nur Regeln. Reine Funktionen (keine Uhr im Code): Datum und „jetzt“ kommen als Eingabe.

const pad = (n: number) => String(n).padStart(2, "0");
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-21T08:00" in lokaler Zeit. */
export function stamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const day = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Datum aus "2026-11-21" ohne Zeitzonen-Überraschung. */
function parseDay(iso: string): Date {
  return new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  return x;
}

// ------------------------------------------------------------------ Snooze

export interface SnoozeOption {
  id: string;
  label: string; // „Tomorrow“
  hint: string; // „Sun 08:00“
  short: string; // für schmale Knöpfe: „18:00“, „Tomorrow“, „Mon“
  when: string; // "2026-11-22T08:00"
}

/** Zeiten zum Wiederkommen. Doppelte Tage (z. B. „Tomorrow“ = Samstag) werden weggelassen. */
export function snoozeOptions(now: Date): SnoozeOption[] {
  const out: SnoozeOption[] = [];
  const at = (d: Date, h: number) => stamp(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 0));
  const dow = now.getDay();

  if (now.getHours() < 16) out.push({ id: "today", label: "Later today", hint: "18:00", short: "18:00", when: at(now, 18) });

  const tomorrow = addDays(now, 1);
  out.push({ id: "tomorrow", label: "Tomorrow", hint: `${WEEKDAYS[tomorrow.getDay()]} 08:00`, short: "Tomorrow", when: at(tomorrow, 8) });

  const toSat = (6 - dow + 7) % 7 || 7;
  const sat = addDays(now, toSat);
  if (dow >= 1 && dow <= 5 && toSat > 1) out.push({ id: "weekend", label: "This weekend", hint: "Sat 09:00", short: "Sat", when: at(sat, 9) });

  const toMon = (1 - dow + 7) % 7 || 7;
  const mon = addDays(now, toMon);
  if (toMon > 1) out.push({ id: "week", label: "Next week", hint: "Mon 08:00", short: "Mon", when: at(mon, 8) });

  return out;
}

/** „Sun 08:00“, heute „18:00“, morgen „Tomorrow 08:00“. */
export function snoozeLabel(when: string, today: string): string {
  const d = when.slice(0, 10);
  const time = when.slice(11, 16);
  if (d === today) return time;
  if (d === day(addDays(parseDay(today), 1))) return `Tomorrow ${time}`;
  return `${WEEKDAYS[parseDay(d).getDay()]} ${time}`;
}

/** „today at 18:00“, „tomorrow at 08:00“, „on Sunday at 08:00“. */
export function snoozePhrase(when: string, today: string): string {
  const d = when.slice(0, 10);
  const time = when.slice(11, 16);
  if (d === today) return `today at ${time}`;
  if (d === day(addDays(parseDay(today), 1))) return `tomorrow at ${time}`;
  return `on ${WEEKDAYS_LONG[parseDay(d).getDay()]} at ${time}`;
}

// ------------------------------------------------------------------ Termine im Text

export interface FoundEvent {
  date: string; // "2026-11-28"
  start: string | null; // "14:00"
  end: string | null; // "15:30"
  location: string;
  label: string; // „Friday, Nov 28 · 14:00 to 15:30 · Room 1.21“
  short: string; // „Fri 14:00“
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const WEEKDAY_WORDS: [string, number][] = [
  ["sunday", 0], ["sonntag", 0], ["monday", 1], ["montag", 1], ["tuesday", 2], ["dienstag", 2],
  ["wednesday", 3], ["mittwoch", 3], ["thursday", 4], ["donnerstag", 4], ["friday", 5], ["freitag", 5],
  ["saturday", 6], ["samstag", 6], ["sonnabend", 6],
  ["sun", 0], ["mon", 1], ["tue", 2], ["tues", 2], ["wed", 3], ["thu", 4], ["thur", 4], ["thurs", 4], ["fri", 5], ["sat", 6],
  ["so", 0], ["mo", 1], ["di", 2], ["mi", 3], ["do", 4], ["fr", 5], ["sa", 6],
];

const MONTH_WORDS: [string, number][] = [
  ["january", 1], ["januar", 1], ["jan", 1], ["february", 2], ["februar", 2], ["feb", 2], ["march", 3], ["marz", 3], ["mar", 3],
  ["april", 4], ["apr", 4], ["may", 5], ["mai", 5], ["june", 6], ["juni", 6], ["jun", 6], ["july", 7], ["juli", 7], ["jul", 7],
  ["august", 8], ["aug", 8], ["september", 9], ["sept", 9], ["sep", 9], ["october", 10], ["oktober", 10], ["oct", 10], ["okt", 10],
  ["november", 11], ["nov", 11], ["december", 12], ["dezember", 12], ["dec", 12], ["dez", 12],
];

const KEYWORDS = /(meeting|exam|tutorial|lecture|deadline|due|appointment|termin|klausur|abgabe|treffen|vorlesung|ubung|seminar|sprechstunde|office hours|call|zoom|dinner|party|workshop|presentation|praesentation|prasentation)/;

const monthAlt = MONTH_WORDS.map(([w]) => w).sort((a, b) => b.length - a.length).join("|");
const weekdayAlt = WEEKDAY_WORDS.filter(([w]) => w.length >= 3).map(([w]) => w).sort((a, b) => b.length - a.length).join("|");
const monthOf = (w: string) => MONTH_WORDS.find(([x]) => x === w)?.[1] ?? 0;
const weekdayOf = (w: string) => WEEKDAY_WORDS.find(([x]) => x === w)?.[1] ?? -1;

interface DateHit {
  index: number;
  end: number;
  date: Date;
  explicit: boolean; // genaues Datum (28.11., Nov 28), nicht „Friday“ oder „tomorrow“
}

function findDate(text: string, base: Date): DateHit | null {
  const hits: DateHit[] = [];
  const push = (index: number, len: number, date: Date, explicit = true) => hits.push({ index, end: index + len, date, explicit });
  const inYear = (month: number, d: number, year?: number): Date => {
    let y = year ?? base.getFullYear();
    if (y < 100) y += 2000;
    let date = new Date(y, month - 1, d);
    if (year === undefined && date < addDays(base, -30)) date = new Date(y + 1, month - 1, d);
    return date;
  };
  let m: RegExpExecArray | null;

  const iso = /\b(20\d\d)-(\d\d)-(\d\d)\b/g;
  while ((m = iso.exec(text))) push(m.index, m[0].length, new Date(+m[1], +m[2] - 1, +m[3]));

  const dotted = /\b(\d{1,2})\.\s?(\d{1,2})\.(?:\s?(20\d\d|\d\d)\b)?/g;
  while ((m = dotted.exec(text))) {
    if (+m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12) push(m.index, m[0].length, inYear(+m[2], +m[1], m[3] ? +m[3] : undefined));
  }

  const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\.?\\s+(?:of\\s+)?(${monthAlt})\\b\\.?(?:,?\\s+(20\\d\\d))?`, "g");
  while ((m = dayFirst.exec(text))) {
    if (+m[1] >= 1 && +m[1] <= 31) push(m.index, m[0].length, inYear(monthOf(m[2]), +m[1], m[3] ? +m[3] : undefined));
  }

  const monthFirst = new RegExp(`\\b(${monthAlt})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(20\\d\\d))?`, "g");
  while ((m = monthFirst.exec(text))) {
    if (+m[2] >= 1 && +m[2] <= 31) push(m.index, m[0].length, inYear(monthOf(m[1]), +m[2], m[3] ? +m[3] : undefined));
  }

  const rel = /\b(tomorrow|heute|today)\b/g;
  while ((m = rel.exec(text))) push(m.index, m[0].length, m[1] === "tomorrow" ? addDays(base, 1) : base, false);

  const wd = new RegExp(`\\b(?:(next|nachsten)\\s+)?(${weekdayAlt})\\b`, "g");
  while ((m = wd.exec(text))) {
    const target = weekdayOf(m[2]);
    if (target < 0) continue;
    let diff = (target - base.getDay() + 7) % 7;
    if (m[1] && diff === 0) diff = 7;
    push(m.index, m[0].length, addDays(base, diff), false);
  }

  const today = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const future = hits.filter((h) => h.date >= today && h.date <= addDays(today, 400));
  // Ein genaues Datum schlägt „Friday“; sonst gilt die erste Stelle im Text
  future.sort((a, b) => Number(b.explicit) - Number(a.explicit) || a.index - b.index);
  return future[0] ?? null;
}

interface TimeHit {
  index: number;
  start: string;
  end: string | null;
}

function findTimes(text: string): TimeHit[] {
  const out: (TimeHit & { len?: number })[] = [];
  const hm = (h: number, min: number) => `${pad(h)}:${pad(min)}`;
  const ok = (h: number, min: number) => h >= 0 && h < 24 && min >= 0 && min < 60;
  let m: RegExpExecArray | null;

  const range = /\b(\d{1,2}):(\d{2})\s*(?:-|–|—|bis|to|until|and|und)\s*(\d{1,2}):(\d{2})\b/g;
  while ((m = range.exec(text))) if (ok(+m[1], +m[2]) && ok(+m[3], +m[4])) out.push({ index: m.index, len: m[0].length, start: hm(+m[1], +m[2]), end: hm(+m[3], +m[4]) });

  const single = /\b(\d{1,2}):(\d{2})\b/g;
  while ((m = single.exec(text))) if (ok(+m[1], +m[2]) && !out.some((o) => m!.index >= o.index && m!.index < o.index + (o.len ?? 3))) out.push({ index: m.index, start: hm(+m[1], +m[2]), end: null });

  const uhr = /\b(\d{1,2})(?:[:.](\d{2}))?\s*uhr\b/g;
  while ((m = uhr.exec(text))) if (ok(+m[1], m[2] ? +m[2] : 0)) out.push({ index: m.index, start: hm(+m[1], m[2] ? +m[2] : 0), end: null });

  const ampm = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/g;
  while ((m = ampm.exec(text))) {
    let h = +m[1] % 12;
    if (m[3] === "pm") h += 12;
    if (+m[1] >= 1 && +m[1] <= 12 && ok(h, m[2] ? +m[2] : 0)) out.push({ index: m.index, start: hm(h, m[2] ? +m[2] : 0), end: null });
  }
  return out.sort((a, b) => a.index - b.index);
}

function plusMinutes(hhmm: string, add: number): string {
  const t = Math.min(23 * 60 + 59, +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5) + add);
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

/**
 * Sucht in Betreff und Text ein Datum mit Uhrzeit („Friday, Nov 28 at 14:00“, „Freitag, 28.11. um 14 Uhr“).
 * `mailDay` ist der Tag der Mail („2026-11-19“), von dort aus zählen „Friday“ und „tomorrow“.
 */
export function findEvent(subject: string, body: string, mailDay: string): FoundEvent | null {
  const lines = body.split("\n").filter((l) => !l.trimStart().startsWith(">"));
  const text = fold(`${subject}\n${lines.join("\n").slice(0, 4000)}`);
  const base = parseDay(mailDay);
  const date = findDate(text, base);
  if (!date) return null;

  const times = findTimes(text).filter((t) => t.index >= date.index - 60 && t.index <= date.end + 80);
  times.sort((a, b) => Math.abs(a.index - date.index) - Math.abs(b.index - date.index));
  const time = times[0] ?? null;

  const near = text.slice(Math.max(0, date.index - 120), date.end + 160);
  // Ohne Uhrzeit nur bei genauem Datum und einem Stichwort („exam on November 26“)
  if (!time && !(date.explicit && KEYWORDS.test(near))) return null;

  const loc = /\b(?:room|raum|saal|horsaal|hs|hall)\s+([a-z]?\d[\w.\-/]*)/.exec(text.slice(Math.max(0, date.index - 200), date.end + 240));
  const location = loc ? `Room ${loc[1].replace(/[.\-/]+$/, "")}` : "";

  const d = date.date;
  const start = time?.start ?? null;
  const end = time ? (time.end ?? plusMinutes(time.start, 90)) : null;
  const when = `${WEEKDAYS_LONG[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  const label = [when, start ? `${start} to ${end}` : "all day", location].filter(Boolean).join(" · ");
  return { date: day(d), start, end, location, label, short: `${WEEKDAYS[d.getDay()]}${start ? ` ${start}` : ""}` };
}

// ------------------------------------------------------------------ Suche

export interface ParsedSearch {
  text: string; // Rest ohne Befehle
  from: string; // „from:lindner“
  unread: boolean; // „is:unread“
  attachment: boolean; // „has:attachment“
}

/** Liest Befehle wie in Gmail: from:name, is:unread, has:attachment. */
export function parseSearch(input: string): ParsedSearch {
  let from = "";
  let unread = false;
  let attachment = false;
  const text = input
    .replace(/\bfrom:(\S+)/gi, (_, v: string) => {
      from = v;
      return "";
    })
    .replace(/\bis:unread\b/gi, () => {
      unread = true;
      return "";
    })
    .replace(/\bhas:attachment\b/gi, () => {
      attachment = true;
      return "";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { text, from, unread, attachment };
}

/** Montag dieser Woche als "2026-11-16". */
export function weekStart(today: string): string {
  const d = parseDay(today);
  return day(addDays(d, -((d.getDay() + 6) % 7)));
}

// ------------------------------------------------------------------ Kurs erkennen

interface CourseLike {
  id: string;
  name: string;
  short?: string;
  fullName?: string;
  lecturer?: string;
}

const STOP = new Set(["einfuhrung", "introduction", "grundlagen", "fundamentals", "vorlesung", "lecture", "ubung", "exercise", "tutorium", "tutorial", "seminar", "modul", "fur", "und", "the", "and", "for", "studierende", "students", "informatik", "systems", "system", "management", "information", "data", "university", "uni"]);
const foldWords = (s: string) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w));
const hasWord = (text: string, word: string) => new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text);

/**
 * Welcher Kurs gehört zu einer Mail? Ohne KI, nur Regeln: Absender = Dozent, Kurzname oder Kursname im Betreff,
 * ILIAS-Benachrichtigung mit Kursnamen. Gibt die Kurs-Id zurück oder null, wenn es nicht eindeutig ist.
 */
export function guessCourse(m: { fromName: string; fromAddress: string; subject: string; body: string }, courses: CourseLike[]): string | null {
  const from = fold(`${m.fromName} ${m.fromAddress}`);
  const subject = fold(m.subject);
  const body = fold(m.body.slice(0, 3000));
  const ilias = from.includes("ilias");
  const scored = courses.map((c) => {
    let score = 0;
    const surname = fold((c.lecturer ?? "").replace(/(prof|dr|apl|jun|pd)\.?\s*/gi, "").trim().split(/\s+/).pop() ?? "");
    if (surname.length >= 4 && from.includes(surname)) score += 5;
    const short = fold(c.short ?? "");
    if (short.length >= 3) {
      if (hasWord(subject, short)) score += 4;
      else if (hasWord(body, short)) score += 2;
    }
    const words = [...new Set([...foldWords(c.name), ...foldWords(c.fullName ?? "")])];
    const inSubject = words.filter((w) => subject.includes(w)).length;
    const inBody = words.filter((w) => body.includes(w)).length;
    score += Math.min(8, inSubject * 4) + Math.min(2, inBody);
    if (ilias && inSubject + inBody > 0) score += 3;
    return { id: c.id, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (!best || best.score < 4 || (second && best.score - second.score < 2)) return null;
  return best.id;
}
