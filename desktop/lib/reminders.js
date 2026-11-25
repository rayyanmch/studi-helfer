// Erinnerungen an Abgaben und Klausuren als Mac-Mitteilung, solange die App läuft (auch ohne Fenster).
// Abgabe: am Vortag 18:00 („Due tomorrow“) und 3 Stunden vorher („Due in 3 hours“).
// Klausur: 7 Tage vorher 09:00 und am Vortag 18:00.
// Verpasste Erinnerungen (Mac im Ruhezustand) kommen bis zu 6 Stunden später noch, nie nach der Frist.
// Was schon gezeigt wurde, steht in <App-Daten>/reminders-sent.json, damit nichts doppelt kommt.

const fs = require("node:fs");
const path = require("node:path");

const HOUR = 3600_000;
const GRACE = 6 * HOUR;

/** Datum (YYYY-MM-DD) + Uhrzeit (HH:MM, auch 24:00) in Ortszeit als Millisekunden. */
function at(date, hhmm) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d, h, min).getTime();
}

/** Uhrzeit der Frist aus „by 23:55“, „12:00–13:30“, „all day“ … (null = ganztägig). */
function timeOf(text) {
  const m = /(\d{1,2}):(\d{2})/.exec(String(text || ""));
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

function dayBefore(date) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(y, m - 1, d - 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function daysBefore(date, n) {
  let x = date;
  for (let i = 0; i < n; i++) x = dayBefore(x);
  return x;
}

/**
 * Alle Erinnerungen zu einer Liste von Fristen.
 * @param {{id: string, kind: string, title: string, date: string, time?: string, course?: string, early?: boolean}[]} items
 * @returns {{key: string, fireAt: number, until: number, title: string, body: string}[]}
 */
function remindersFor(items) {
  const out = [];
  for (const d of items) {
    if (!d || typeof d.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue;
    const t = timeOf(d.time);
    const course = d.course ? ` · ${d.course}` : "";
    if (d.kind === "abgabe") {
      const due = at(d.date, t ?? "23:59");
      const by = t ? `, by ${t}` : "";
      // Frühe Erinnerung eine Woche vorher, wo man Vorlauf braucht (Semesterbeitrag: Überweisung dauert)
      if (d.early) out.push({ key: `${d.id}|7d`, fireAt: at(daysBefore(d.date, 7), "09:00"), until: due, title: "Due in one week", body: `${d.title}${course}${by}` });
      out.push({ key: `${d.id}|1d`, fireAt: at(dayBefore(d.date), "18:00"), until: due, title: "Due tomorrow", body: `${d.title}${course}${by}` });
      // „In 3 Stunden“ nur mit echter Uhrzeit (bei ganztägigen wie dem Semesterbeitrag hilft es abends nicht mehr)
      if (t) out.push({ key: `${d.id}|3h`, fireAt: due - 3 * HOUR, until: due, title: "Due in 3 hours", body: `${d.title}${course}${by}` });
    } else if (d.kind === "klausur") {
      const start = at(d.date, t ?? "09:00");
      const when = t ? ` at ${t}` : "";
      // Klausurtitel aus den Regeln sind oft nur „1st date“, deshalb Kurs zuerst: „BWL – 1st date at 12:00“
      const what = d.course ? `${d.course} – ${d.title}` : d.title;
      out.push({ key: `${d.id}|7d`, fireAt: at(daysBefore(d.date, 7), "09:00"), until: start, title: "Exam in one week", body: `${what}${when}` });
      out.push({ key: `${d.id}|1d`, fireAt: at(dayBefore(d.date), "18:00"), until: start, title: "Exam tomorrow", body: `${what}${when}` });
    }
  }
  return out;
}

/** Erinnerungen, die jetzt fällig sind und noch nicht gezeigt wurden. */
function dueNow(items, now, sent) {
  return remindersFor(items).filter((r) => now >= r.fireAt && now < Math.min(r.fireAt + GRACE, r.until) && !sent.has(r.key));
}

/**
 * Zahl fürs Dock-Symbol: offene Abgaben und Klausuren mit Datum heute, deren Uhrzeit noch nicht vorbei ist
 * (ganztägige zählen den ganzen Tag). Vergangene, nicht abgehakte zählen nicht, sonst stapelt sich die Zahl.
 * @param {{date: string, time?: string}[]} items
 */
function todayCount(items, now = Date.now()) {
  const t = new Date(now);
  const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  return items.filter((d) => {
    if (d.date !== today) return false;
    const hhmm = timeOf(d.time);
    return !hhmm || at(d.date, hhmm) > now;
  }).length;
}

/**
 * @param {{dataDir: string, items: () => object[], enabled: () => boolean, show: (r: {title: string, body: string}) => void}} opts
 */
function createReminders({ dataDir, items, enabled, show }) {
  const file = path.join(dataDir, "reminders-sent.json");
  let sent;
  try {
    const v = JSON.parse(fs.readFileSync(file, "utf8"));
    sent = new Set(Array.isArray(v) ? v : []);
  } catch {
    sent = new Set();
  }
  const save = () => {
    try {
      fs.writeFileSync(file, JSON.stringify([...sent].slice(-500)));
    } catch {
      // egal, schlimmstenfalls kommt eine Erinnerung doppelt
    }
  };

  function check() {
    if (!enabled()) return;
    let list;
    try {
      list = items();
    } catch (e) {
      console.error("[reminders]", e);
      return;
    }
    const due = dueNow(list, Date.now(), sent);
    if (due.length === 0) return;
    for (const r of due) sent.add(r.key);
    save();
    // Mehrere auf einmal (z. B. nach dem Aufwachen): höchstens zwei einzeln, sonst eine Sammelmeldung.
    if (due.length <= 2) for (const r of due) show(r);
    else show({ title: `${due.length} reminders`, body: due.map((r) => r.body.split(" · ")[0]).slice(0, 3).join(", ") + (due.length > 3 ? " …" : "") });
  }

  return { check, start: (everyMs = 60_000) => setInterval(check, everyMs) };
}

module.exports = { createReminders, remindersFor, dueNow, timeOf, todayCount };
