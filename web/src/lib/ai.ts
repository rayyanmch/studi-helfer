import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

// Nur serverseitig verwenden: Der API-Key liegt in .env.local und erreicht nie den Browser.
// Nutzer brauchen keinen eigenen Key, die App bezahlt die Aufrufe zentral.
const client = new Anthropic();

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
  const response = await client.beta.messages.parse({
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
    throw new Error("Die KI hat die Anfrage abgelehnt.");
  }
  if (!response.parsed_output) {
    throw new Error(`Keine gültige Antwort erhalten (stop_reason: ${response.stop_reason}).`);
  }
  return response.parsed_output;
}
