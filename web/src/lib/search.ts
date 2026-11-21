// Suche, die auch deutsche Wörter versteht: Wer „Klausur“ tippt, findet „Exams“, wer „Folien“ tippt,
// findet „Lecture slides“. Ohne KI, nur Wortgruppen. Groß-/Kleinschreibung und Umlaute egal.

const GROUPS: string[][] = [
  ["exam", "klausur", "altklausur", "prüfung", "pruefung", "probeklausur", "testat"],
  ["exercise", "übung", "uebung", "übungsblatt", "blatt", "sheet", "homework", "hausaufgabe", "assignment", "aufgabe"],
  ["slides", "folien", "folie", "skript", "script"],
  ["lecture", "vorlesung"],
  ["solution", "lösung", "loesung", "musterlösung"],
  ["tutorial", "tutorium", "tutor"],
  ["deadline", "submission", "abgabe", "frist"],
  ["reading", "literatur", "lektüre", "paper"],
  ["self-study", "selbststudium", "selbstlern"],
  // Uni-Termine (desktop/lib/uni-dates.js) und Prüfungsanmeldung, wie Erstis danach suchen
  ["semester fee", "semesterbeitrag", "rückmeldung", "rueckmeldung"],
  ["registration", "register", "anmeldung", "belegung", "klips"],
  ["christmas", "weihnachten", "ferien", "vorlesungsfrei"],
];

/** Klein, ohne Akzente/Umlaute („Übung“ → „ubung“), damit „ubung“ und „übung“ gleich gefunden werden. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Alle Schreibweisen, nach denen gesucht wird: die Eingabe selbst plus passende Wortgruppen. */
export function searchTerms(query: string): string[] {
  const q = fold(query.trim());
  if (!q) return [];
  const terms = new Set([q]);
  if (q.length >= 3) {
    for (const group of GROUPS) {
      const folded = group.map(fold);
      if (folded.some((t) => t.startsWith(q) || q.startsWith(t))) folded.forEach((t) => terms.add(t));
    }
  }
  return [...terms];
}

/** Trifft eine der Schreibweisen in einem der Texte? */
export function matches(terms: string[], ...fields: (string | undefined | null)[]): boolean {
  if (terms.length === 0) return false;
  return fields.some((f) => {
    if (!f) return false;
    const s = fold(f);
    return terms.some((t) => s.includes(t));
  });
}
