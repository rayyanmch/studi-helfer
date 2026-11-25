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

type Field = string | undefined | null;

/** Jedes Wort der Eingabe einzeln, mit seinen Wortgruppen („bwl klausur“ → [[bwl], [klausur, exam, …]]). */
export function wordTerms(query: string): string[][] {
  return query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .map(searchTerms);
}

/**
 * Mehrere Wörter: Jedes muss passen, im Eintrag selbst oder im Umfeld (Kursname bei Dateien),
 * mindestens eins im Eintrag selbst. So findet „bwl folien“ die Folien in BWL, aber nicht jede BWL-Datei.
 */
export function matchesAll(words: string[][], own: Field[], context: Field[] = []): boolean {
  if (words.length === 0) return false;
  let ownHit = false;
  for (const terms of words) {
    if (matches(terms, ...own)) ownHit = true;
    else if (!matches(terms, ...context)) return false;
  }
  return ownHit;
}

/** Wörter (ab 3 Zeichen) aus Namen und Titeln; Schlüssel ohne Umlaute/klein, Wert die erste Schreibweise. */
export function vocabulary(texts: Iterable<Field>): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of texts) {
    if (!t) continue;
    for (const w of t.split(/[^\p{L}\p{N}]+/u)) {
      if (w.length < 3 || /^\d+$/.test(w)) continue;
      const k = fold(w);
      if (!out.has(k)) out.set(k, w);
    }
  }
  for (const group of GROUPS) for (const w of group) if (!w.includes(" ") && !out.has(fold(w))) out.set(fold(w), w);
  return out;
}

/** Tippfehler-Abstand (Levenshtein), bricht ab, sobald `max` überschritten ist. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, row[j]);
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/**
 * „Did you mean …?“: ersetzt jedes unbekannte Wort der Eingabe durch das ähnlichste bekannte.
 * `null`, wenn nichts zu verbessern ist oder kein Wort nah genug liegt.
 */
export function suggestQuery(query: string, vocab: Map<string, string>): string | null {
  let changed = false;
  const words = query.trim().split(/\s+/).map((w) => {
    const q = fold(w);
    if (q.length < 3 || /\d/.test(q)) return w;
    for (const k of vocab.keys()) if (k.startsWith(q)) return w; // bekannt oder Wortanfang
    const max = q.length <= 4 ? 1 : q.length <= 8 ? 2 : 3;
    let best: string | null = null;
    let bestD = max + 1;
    for (const [k, original] of vocab) {
      // Kurze Wörter nur als ganzes Wort und mit gleichem Anfangsbuchstaben („bwk“ → BWL, nicht „bwl“ → Belegung)
      if (q.length <= 4 && k[0] !== q[0]) continue;
      // Längere auch als Wortanfang mit Tippfehler („Mathemtik“ → Mathematik, „Softwre“ → Softwaretechnik)
      const prefix = q.length >= 5 && k.length > q.length ? distance(q, k.slice(0, q.length), max) : max + 1;
      const d = Math.min(distance(q, k, max), prefix);
      if (d < bestD) {
        bestD = d;
        best = original;
      }
    }
    if (!best) return w;
    changed = true;
    return best;
  });
  return changed ? words.join(" ") : null;
}
