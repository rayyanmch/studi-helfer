// Lösung neben dem Blatt: ordnet Lösungen ihrem Übungsblatt zu, nur mit Regeln (ohne KI).
// „BWL_Fall_Woche_3_Lösungen.pdf“ → „BWL_Fall_Woche_3.pdf“, „Solution Sheet 6.pdf“ → „Sheet 6.pdf“.

import type { CourseFile } from "./mock-data";

const SOLUTION = /(l(ö|oe|o)sung|solution|musterl|answer[\s_-]*key|answers\b)/i;
// Wörter vor der Nummer, die auf ein Blatt hinweisen (Woche/Einheit, weil manche Kurse nach Wochen zählen)
const UNIT = /(?<![a-zäöüß])(?:blatt|sheet|übung(?:sblatt)?|uebung(?:sblatt)?|ubung|exercise|homework|hw|aufgabe(?:nblatt)?|assignment|tutorial|tutorium|fall|case|woche|week|einheit|unit|ex|ü|u)[\s_\-.]*0*(\d{1,2})(?!\d)/gi;
const LECTURE = /(^|[\s_\-])(vl|vorlesung|lecture|folien|slides|chapter|kapitel)([\s_\-\d]|$)/i;
const SEMESTER = /(WS|SS|WiSe|SoSe)[\s_\-]?\d{2,4}([_\-/]\d{2,4})?/gi;

export function isSolution(name: string) {
  return SOLUTION.test(name);
}

/** Nummer des Blatts aus dem Dateinamen (zuerst nach einem Blatt-Wort, sonst die einzige Zahl). */
function unitNumberOf(name: string): number | null {
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, "").replace(SEMESTER, " ");
  const labelled = [...base.matchAll(UNIT)].map((m) => Number(m[1]));
  if (labelled.length) return labelled[0];
  const plain = base.match(/(?<![\d.])\d{1,2}(?![\d.])/g);
  return plain && plain.length === 1 ? Number(plain[0]) : null;
}

const STOP = new Set(["pdf", "the", "der", "die", "das", "und", "and", "of", "zu", "for"]);
function words(name: string) {
  return new Set(
    name
      .replace(/\.[a-z0-9]{1,5}$/i, "")
      .replace(SEMESTER, " ")
      .replace(SOLUTION, " ")
      .toLowerCase()
      .split(/[^a-zäöüß]+/)
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
}

function topFolder(where?: string) {
  return (where ?? "").split("/")[0] ?? "";
}

export interface SolutionLinks {
  /** Blatt-Id → Lösungen dazu */
  solutionsOf: Map<string, CourseFile[]>;
  /** Lösungs-Id → Blatt */
  sheetOf: Map<string, CourseFile>;
}

/** Ordnet jeder Lösung eines Moduls höchstens ein Blatt zu. Bei Gleichstand gewinnt derselbe ILIAS-Ordner. */
export function linkSolutions(files: CourseFile[]): SolutionLinks {
  const solutionsOf = new Map<string, CourseFile[]>();
  const sheetOf = new Map<string, CourseFile>();
  const sheets = files.filter((f) => !isSolution(f.name) && !LECTURE.test(f.name));
  const seen = new Set<string>(); // dieselbe Lösung kann in Übung und Gruppe liegen

  for (const sol of files) {
    if (!isSolution(sol.name) || seen.has(sol.id)) continue;
    seen.add(sol.id);
    const n = unitNumberOf(sol.name);
    const solWords = words(sol.name);
    let best: CourseFile | null = null;
    let bestScore = 0;
    for (const sheet of sheets) {
      const sameFolder = Boolean(sol.where) && sheet.where === sol.where;
      const m = unitNumberOf(sheet.name);
      // Mit Nummer: Nummern müssen gleich sein. Ohne Nummer: nur im selben Ordner.
      if (n !== null ? m !== n : !sameFolder) continue;
      let score = 1;
      if (sameFolder) score += 6;
      else if (sol.where && topFolder(sheet.where) === topFolder(sol.where)) score += 3;
      for (const w of words(sheet.name)) if (solWords.has(w)) score += 1;
      if (score > bestScore) {
        best = sheet;
        bestScore = score;
      }
    }
    if (!best) continue;
    sheetOf.set(sol.id, best);
    solutionsOf.set(best.id, [...(solutionsOf.get(best.id) ?? []), sol]);
  }
  return { solutionsOf, sheetOf };
}
