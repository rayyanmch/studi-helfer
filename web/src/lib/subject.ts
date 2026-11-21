"use client";

// Mathe-Modus je Kurs: Formeln in LaTeX, andere Kartentypen (Definition, Satz, Formel, „Welche Methode?“, Rechenaufgabe,
// Wahr/Falsch, Beweisidee) und Lernzettel mit Definitions-/Satz-Kästen, Formeltabelle und Rechenwegen.
// Automatisch nach Kursname oder Formeldichte der Zusammenfassungen, per Schalter überschreibbar (localStorage).

import { useSyncExternalStore } from "react";
import type { Course } from "./mock-data";
import type { Analysis } from "./study";

const NAME = /(mathe|mathematik|analysis|algebra|statistik|stochastik|wahrscheinlichkeit|probability|statistics|calculus|physik|physics|numerik|numerical|logik|logic|ökonometrie|oekonometrie|econometrics|diskrete|discrete|geometrie|geometry|optimierung|optimization|operations research|theoretische informatik|formale sprachen|automaten|regelungstechnik|signale|mechanik|thermodynamik|elektrotechnik|finanzmathematik|quantitative)/i;
const FORMULA = /[=^∑∫√≤≥∈→²³]|\\frac|\\sum|\$/g;

export function looksLikeMath(course: Pick<Course, "name" | "fullName">, analyses: (Analysis | null | undefined)[]) {
  if (NAME.test(`${course.name} ${course.fullName ?? ""}`)) return true;
  const list = analyses.filter((a): a is Analysis => Boolean(a));
  if (list.some((a) => a.math)) return true;
  if (list.length < 3) return false;
  const dense = list.filter((a) => (`${a.summary} ${a.keyPoints.map((k) => k.text).join(" ")}`.match(FORMULA)?.length ?? 0) >= 6);
  return dense.length / list.length >= 0.5;
}

// Schalter je Kurs („on“/„off“), sonst automatisch
const listeners = new Set<() => void>();
const key = (id: string) => `studi.math.${id}`;
function read(id: string): "on" | "off" | null {
  try {
    const v = localStorage.getItem(key(id));
    return v === "on" || v === "off" ? v : null;
  } catch {
    return null;
  }
}
let version = 0;

export function setMathMode(id: string, value: "on" | "off" | null) {
  try {
    if (value) localStorage.setItem(key(id), value);
    else localStorage.removeItem(key(id));
  } catch {
    // egal
  }
  version += 1;
  for (const l of listeners) l();
}

/** Mathe-Modus eines Kurses: { math, auto, override }. */
export function useMathMode(course: Pick<Course, "id" | "name" | "fullName"> | null, analyses: (Analysis | null | undefined)[]) {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => 0,
  );
  if (!course) return { math: false, auto: false, override: null as "on" | "off" | null };
  const auto = looksLikeMath(course, analyses);
  const override = typeof window === "undefined" ? null : read(course.id);
  return { math: override ? override === "on" : auto, auto, override };
}

export type Subject = "business" | "math" | "cs" | "law" | "science" | "humanities";

export const SUBJECTS: { id: Subject; label: string; hint: string }[] = [
  { id: "business", label: "Business", hint: "Process flows, frameworks, matrices, calculations" },
  { id: "math", label: "Math & stats", hint: "Definitions, theorems, formulas, graphs" },
  { id: "cs", label: "Computer science", hint: "UML, state machines, algorithms, code" },
  { id: "law", label: "Law", hint: "Prüfungsschema, definitions, cases" },
  { id: "science", label: "Sciences", hint: "Processes, cycles, curves with units" },
  { id: "humanities", label: "Humanities", hint: "Timelines, concept maps, theories" },
];

/** Fachrichtung eines Kurses für den Stil des Lernzettels (nur ein Vorschlag, im Baukasten änderbar). */
export function subjectOf(course: Pick<Course, "name" | "fullName">, math: boolean): Subject {
  const n = `${course.name} ${course.fullName ?? ""}`.toLowerCase();
  if (math || NAME.test(n)) return "math";
  if (/(informatik|software|programm|algorithm|daten|data|datenbank|database|informationssystem|information systems|ism\b|wirtschaftsinformatik|computer|netzwerk|visualisierung|web|machine learning|ki\b)/.test(n)) return "cs";
  if (/(recht|jura|law|legal|verfassung|zivil|straf)/.test(n)) return "law";
  if (/(bwl|vwl|betriebs|volkswirt|marketing|accounting|rechnungswesen|finanz|finance|management|ökonom|oekonom|economics|controlling|unternehmen)/.test(n)) return "business";
  if (/(chemie|biologie|physik|medizin|anatomie|physiologie|biochem|geo|umwelt|neuro)/.test(n)) return "science";
  return "humanities";
}
