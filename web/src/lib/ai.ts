import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

// Nur serverseitig verwenden: Der API-Key liegt in .env.local und erreicht nie den Browser.
// Nutzer brauchen keinen eigenen Key, die App bezahlt die Aufrufe zentral.
// Client erst beim ersten Aufruf anlegen: ohne Key soll nur der KI-Aufruf scheitern, nicht das Laden der Seite.
let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

/** Ist ein KI-Schlüssel eingerichtet? (ANTHROPIC_API_KEY in web/.env.local) */
export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export const AI_MODEL = process.env.AI_MODEL ?? "claude-opus-5-5";

export const SlideExtraction = z.object({
  kurs: z.string().describe("Name der Lehrveranstaltung, falls erkennbar"),
  termine: z.array(
    z.object({
      titel: z.string(),
      datum: z.string().describe("ISO-8601-Datum, z. B. 2026-12-03 oder 2026-12-03T10:00"),
      art: z.enum(["klausur", "abgabe", "uebung", "vorlesung", "sonstiges"]),
      quelle: z.string().describe("Folie oder Seite, auf der der Termin steht"),
    }),
  ),
  merkzettel: z.array(
    z.object({
      thema: z.string(),
      kernpunkte: z.array(z.string()),
    }),
  ),
});
export type SlideExtraction = z.infer<typeof SlideExtraction>;

/** Liest Vorlesungsfolien (PDF) und liefert Termine und einen Merkzettel. */
export async function extractFromSlides(pdf: Buffer, heute = new Date()): Promise<SlideExtraction> {
  const response = await anthropic().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    // Lehnt das Modell ab, beantwortet ein Ersatzmodell dieselbe Anfrage im selben Aufruf.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system:
      "Du hilfst Studierenden. Extrahiere aus Vorlesungsfolien alle konkreten Termine " +
      "(Klausuren, Abgaben, Übungen) und fasse die Inhalte als kompakten Lernzettel auf Deutsch zusammen. " +
      "Erfinde keine Termine: Nimm nur auf, was mit Datum in den Folien steht.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") },
          },
          { type: "text", text: `Heute ist der ${heute.toISOString().slice(0, 10)}.` },
        ],
      },
    ],
    output_config: { format: betaZodOutputFormat(SlideExtraction) },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The AI declined the request.");
  }
  if (!response.parsed_output) {
    throw new Error(`No valid response received (stop_reason: ${response.stop_reason}).`);
  }
  return response.parsed_output;
}

export const SheetDeadlines = z.object({
  fristen: z.array(
    z.object({
      titel: z.string().describe('Short and specific, in English, e.g. "Submit exercise sheet 7" or "Quiz 2"'),
      datum: z.string().describe("Datum als YYYY-MM-DD"),
      uhrzeit: z.string().nullable().describe("Uhrzeit als HH:MM, falls angegeben, sonst null"),
      art: z
        .enum(["abgabe", "klausur", "termin"])
        .describe("abgabe = etwas muss bis dann eingereicht werden; klausur = Klausur, Testat, Zwischentest; termin = sonstiges Ereignis (z. B. Präsentation)"),
      beleg: z.string().describe("Die Stelle im Dokument, auf der die Frist beruht, wörtlich und kurz"),
    }),
  ),
});
export type SheetDeadlines = z.infer<typeof SheetDeadlines>;

/**
 * Liest ein Übungsblatt (PDF) und findet Abgabefristen und Termine.
 * Gibt nur Fristen zurück, die mit Datum im Dokument stehen (oder sich eindeutig daraus ergeben).
 */
export async function extractDeadlinesFromSheet(
  pdf: Buffer,
  info: { course: string; fileName: string; today: string },
): Promise<SheetDeadlines> {
  const response = await anthropic().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system:
      "You read university exercise sheets (often in German) and find deadlines students must not miss: " +
      "submission deadlines, quizzes/tests, presentations, exams. Only include what the document states with a date " +
      "or what follows unambiguously from it (e.g. „Abgabe bis Montag, 24.11.“). Skip relative mentions without a date " +
      "(„next week“) and plain lecture dates. Write titles in English. If there is no deadline, return an empty list.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") },
            title: info.fileName,
          },
          {
            type: "text",
            text: `Course: ${info.course}\nFile: ${info.fileName}\nToday is ${info.today}. If the year is missing, use the year that puts the date closest to today.`,
          },
        ],
      },
    ],
    output_config: { format: betaZodOutputFormat(SheetDeadlines) },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The AI declined the request.");
  }
  if (!response.parsed_output) {
    throw new Error(`No valid response received (stop_reason: ${response.stop_reason}).`);
  }
  return response.parsed_output;
}
