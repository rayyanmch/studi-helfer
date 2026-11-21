// Wichtige Termine der Uni Köln, die für alle Studis gelten (Rückmeldung, KLIPS-Belegung, Vorlesungszeit).
// Erstis kennen sie nicht; wer den Semesterbeitrag nicht bis zur Frist zahlt, wird exmatrikuliert.
// Einmal pro Semester von Hand pflegen. Quellen (geprüft 2026-11-21):
//   Vorlesungszeit, Weihnachtsruhe: https://studierende.uni-koeln.de/studienorganisation/termine/index_ger.html
//   Semesterbeitrag bis 15.02.:      https://studsek.uni-koeln.de/studium/rueckmeldung__semesterbeitrag/zahlungsdaten___bankverbindung/index_ger.html
//   KLIPS-Belegphasen SoSe 2027:     https://klips2-support.uni-koeln.de/fileadmin/sites/KLIPS2-Support/Downloads/Semesterplan_KLIPS_2027S_V3.pdf
// Erscheinen ohne Kurs („Other“), lassen sich wie jeder erkannte Termin ausblenden; Abgaben bekommen Erinnerungen.

const DATES = [
  { key: "2026W-xmas", date: "2026-12-23", time: "all day", kind: "termin", title: "Christmas break, no lectures until Jan 6" },
  { key: "2027S-klips1-open", date: "2027-02-03", time: "08:00", kind: "termin", title: "KLIPS: course registration for summer opens" },
  { key: "2026W-lectures-end", date: "2027-02-05", time: "all day", kind: "termin", title: "Last day of lectures" },
  { key: "2027S-fee", date: "2027-02-15", time: "all day", kind: "abgabe", title: "Pay semester fee for summer 2027" },
  { key: "2027S-klips1-close", date: "2027-02-17", time: "by 23:59", kind: "abgabe", title: "KLIPS: course registration closes (1st round)" },
  { key: "2027S-klips1-result", date: "2027-02-26", time: "all day", kind: "termin", title: "KLIPS: course places for summer announced" },
  { key: "2027S-klips2-close", date: "2027-03-18", time: "by 23:59", kind: "abgabe", title: "KLIPS: course registration closes (2nd round)" },
  { key: "2027S-lectures-start", date: "2027-04-05", time: "all day", kind: "termin", title: "Summer semester lectures start" },
];

/** Uni-Termine in der Form von getDeadlines() (ohne Modul). */
function uniDates() {
  return DATES.map((d) => ({
    id: `uni|${d.key}`,
    courseId: null,
    moduleId: null,
    title: d.title,
    date: d.date,
    time: d.time,
    kind: d.kind,
    category: "uni",
    source: "University dates",
    start: d.time === "all day" ? `${d.date}T00:00:00` : `${d.date}T${(d.time.match(/\d{2}:\d{2}/) || ["00:00"])[0]}:00`,
    url: null,
    location: null,
  }));
}

module.exports = { uniDates };
