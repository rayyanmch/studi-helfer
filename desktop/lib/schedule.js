// Stundenplan aus den Orga-Folien (services/ilias-sync/studi_sync/orga.py → orga-events.json) in Termine verwandeln.
//
// - Wochentermine laufen von Vorlesungsbeginn bis Vorlesungsende (Uni Köln, Faustregel; „Beginn:“ aus den Folien
//   und „Übungen ab Woche 3“ gehen vor), ohne Feiertage in NRW, Weihnachtspause, Rosenmontag und Ausfälle.
// - Vorlesungen und die eigene Gruppe (ILIAS-Gruppe „Group 3“) kommen in den Kalender. Wahltermine („Übung Mo 12:00
//   oder Mi 17:45“) erst, wenn man einen davon auswählt (cfg.slotChoices), sonst nur als Auswahl auf der Modulseite.
// - Doppelte mit ILIAS-Sitzungen und Kalender-Abos entfernt getDeadlines() (gleiches Modul, gleicher Tag, ±45 min).

const LABEL = { lecture: "Lecture", exercise: "Exercise", tutorial: "Tutorial", seminar: "Seminar" };
const DAY = 86_400_000;

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function nthWeekday(year, month, weekday, n) {
  // weekday: 0 = Montag
  const first = new Date(year, month, 1);
  const offset = (weekday - ((first.getDay() + 6) % 7) + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

/** Vorlesungszeit an der Uni Köln (Faustregel): WiSe 2. Montag im Oktober bis 1. Freitag im Februar, SoSe 2. Montag im April bis 4. Freitag im Juli. */
function lecturePeriod(today) {
  const y = today.getFullYear();
  const m = today.getMonth();
  if (m >= 7 || m <= 1) {
    const ys = m >= 7 ? y : y - 1;
    return { start: nthWeekday(ys, 9, 0, 2), end: nthWeekday(ys + 1, 1, 4, 1), winter: true, year: ys };
  }
  return { start: nthWeekday(y, 3, 0, 2), end: nthWeekday(y, 6, 4, 4), winter: false, year: y };
}

function easter(year) {
  // Gaußsche Osterformel (anonymer gregorianischer Algorithmus)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Tage ohne Lehre in Köln: Feiertage NRW, Weihnachtspause, Rosenmontag; Weiberfastnacht ab 12 Uhr. */
function closedDays(years) {
  const full = new Set();
  const afternoon = new Set();
  for (const y of years) {
    const e = easter(y);
    for (const d of [
      new Date(y, 0, 1),
      addDays(e, -2), // Karfreitag
      addDays(e, 1), // Ostermontag
      new Date(y, 4, 1),
      addDays(e, 39), // Christi Himmelfahrt
      addDays(e, 50), // Pfingstmontag
      addDays(e, 60), // Fronleichnam
      new Date(y, 9, 3),
      new Date(y, 10, 1),
      addDays(e, -48), // Rosenmontag
    ])
      full.add(iso(d));
    // Weihnachtsruhe der Uni Köln: 23.12.–06.01. (studierende.uni-koeln.de, Termine WS 26/27)
    for (let d = new Date(y, 11, 23); d <= new Date(y + 1, 0, 6); d = addDays(d, 1)) full.add(iso(d));
    afternoon.add(iso(addDays(e, -52))); // Weiberfastnacht
  }
  return { full, afternoon };
}

/**
 * Alle Termine aus orga-events.json.
 * @returns {{ events: object[], slotsByModule: Map<string, object[]> }}
 */
function buildSchedule({ orga, cfg, moduleOf, modules, today = new Date() }) {
  const events = [];
  const slotsByModule = new Map();
  if (!orga || !orga.courses) return { events, slotsByModule };

  const period = lecturePeriod(today);
  const closed = closedDays([period.year, period.year + 1]);
  const lo = addDays(today, -14);
  const hi = addDays(today, 200);
  const choices = cfg.slotChoices || {};
  const myGroupOf = new Map();
  for (const [courseId, n] of Object.entries(orga.myGroups || {})) {
    const mod = moduleOf(courseId);
    if (mod) myGroupOf.set(mod, n);
  }
  const moduleById = new Map(modules.map((m) => [m.id, m]));

  for (const [courseId, b] of Object.entries(orga.courses)) {
    const moduleId = moduleOf(courseId);
    if (!moduleId || !moduleById.has(moduleId)) continue;
    const mod = moduleById.get(moduleId);
    const mine = myGroupOf.get(moduleId);
    const chosen = new Set(choices[moduleId] || []);
    const list = slotsByModule.get(moduleId) || [];

    for (const s of b.slots || []) {
      const ownGroup = s.group != null && mine != null && s.group === mine;
      const state = chosen.has(s.key) ? "chosen" : s.mine || ownGroup ? "mine" : s.alternative ? "option" : "fixed";
      const label = `${LABEL[s.type] || "Class"}${s.group != null ? ` · Group ${s.group}` : ""}`;
      const source = s.source === "ILIAS group" ? "Your ILIAS group" : s.source ? `Course info: ${s.source}` : "Course info";
      if (!list.some((x) => x.key === s.key)) {
        list.push({ key: s.key, type: s.type, label, weekday: s.weekday, start: s.start, end: s.end, room: s.room || null, group: s.group ?? null, state, source, file: s.file || null, evidence: s.evidence || null });
      }
      if (state === "option") continue;

      // Erster Termin: „Beginn:“ aus den Folien, „Übungen ab Woche 3“, sonst Vorlesungsbeginn
      let first = period.start;
      const starts = b.starts || {};
      const explicit = starts[s.type] || starts.all; // „Beginn: Donnerstag, 15.10.“ → Mittwochs-Übung ab 21.10.
      if (explicit && Math.abs(parse(explicit) - period.start) < 60 * DAY) first = parse(explicit);
      const offset = (b.weekOffsets || {})[s.type];
      if (offset) {
        const fromWeek = addDays(mondayOf(period.start), (offset - 1) * 7);
        if (fromWeek > first) first = fromWeek;
      }

      const cancelled = new Set((b.cancellations || []).filter((c) => !c.type || c.type === s.type).map((c) => c.date));
      let d = addDays(mondayOf(first), s.weekday);
      if (d < first) d = addDays(d, 7);
      for (; d <= period.end && d <= hi; d = addDays(d, 7)) {
        if (d < lo) continue;
        const day = iso(d);
        if (closed.full.has(day) || cancelled.has(day)) continue;
        if (closed.afternoon.has(day) && minutes(s.end) > 12 * 60) continue;
        events.push({
          id: `orga|${moduleId}|${s.key}|${day}`,
          courseId: mod.mainCourseId,
          moduleId,
          title: label,
          date: day,
          time: `${s.start}–${s.end}`,
          kind: "termin",
          category: "schedule",
          source,
          start: `${day}T${s.start}:00`,
          url: null,
          location: s.room || null,
          file: s.file || null,
          evidence: s.evidence || null,
        });
      }
    }

    for (const x of b.extras || []) {
      const d = parse(x.date);
      if (d < lo || d > hi) continue;
      events.push({
        id: `orga-x|${moduleId}|${x.date}|${x.start}`,
        courseId: mod.mainCourseId,
        moduleId,
        title: x.title,
        date: x.date,
        time: `${x.start}–${x.end}`,
        kind: "termin",
        category: "schedule",
        source: `Course info: ${x.source}`,
        start: `${x.date}T${x.start}:00`,
        url: null,
        location: x.room || null,
        file: x.file || null,
        evidence: x.evidence || null,
      });
    }
    list.sort((a, b2) => a.weekday - b2.weekday || a.start.localeCompare(b2.start));
    slotsByModule.set(moduleId, list);
  }
  return { events, slotsByModule };
}

/** Gibt es am selben Tag im selben Modul schon einen Termin um diese Zeit (±45 min)? */
function overlaps(existing, ev) {
  const t = minutes(ev.start.slice(11, 16));
  return existing.some((x) => {
    const s = String(x.start || "");
    if (s.length < 16) return false;
    return Math.abs(minutes(s.slice(11, 16)) - t) <= 45;
  });
}

module.exports = { buildSchedule, lecturePeriod, closedDays, overlaps, LABEL };
