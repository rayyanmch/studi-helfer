// KI-Fristen aus einem Übungsblatt. Aufgerufen vom Hintergrundteil der Mac-App (desktop/lib/ai-deadlines.js),
// nicht von der Oberfläche. Der API-Key bleibt auf dem Server.
//
// Heute läuft dieser Server lokal (Next-Dev-Server bzw. der in der App mitgelieferte), deshalb werden nur
// Anfragen von 127.0.0.1/localhost angenommen. Für das echte Produkt läuft dieselbe Route auf einem eigenen
// Server mit Geräte-Kennung und Kontingent, siehe NOTIZEN.md → „Produkt“.

import Anthropic from "@anthropic-ai/sdk";
import { aiConfigured, extractDeadlinesFromSheet } from "@/lib/ai";

const MAX_PDF_BYTES = 25 * 1024 * 1024;

function fail(status: number, code: string, message: string) {
  return Response.json({ ok: false, code, message }, { status });
}

function fromLocalhost(request: Request): boolean {
  const host = new URL(request.url).hostname;
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}

export async function POST(request: Request) {
  if (!fromLocalhost(request)) return fail(403, "forbidden", "Only reachable locally.");
  if (!aiConfigured()) {
    return fail(503, "no_key", "No AI key set up (ANTHROPIC_API_KEY in web/.env.local).");
  }

  let body: { pdfBase64?: unknown; fileName?: unknown; course?: unknown; today?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, "invalid", "Invalid request.");
  }
  const { pdfBase64, fileName, course, today } = body;
  if (typeof pdfBase64 !== "string" || typeof fileName !== "string" || typeof course !== "string") {
    return fail(400, "invalid", "pdfBase64, fileName and course are required.");
  }
  const pdf = Buffer.from(pdfBase64, "base64");
  if (pdf.length === 0 || pdf.length > MAX_PDF_BYTES) return fail(413, "too_large", "PDF missing or too large.");
  if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") return fail(400, "invalid", "Not a PDF file.");

  try {
    const result = await extractDeadlinesFromSheet(pdf, {
      course,
      fileName,
      today: typeof today === "string" ? today : new Date().toISOString().slice(0, 10),
    });
    return Response.json({ ok: true, fristen: result.fristen });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return fail(503, "no_key", "Invalid AI key.");
    if (e instanceof Anthropic.RateLimitError) return fail(429, "rate_limited", "AI is busy right now, try again later.");
    if (e instanceof Anthropic.APIConnectionError) return fail(502, "unreachable", "AI not reachable.");
    if (e instanceof Anthropic.APIError) return fail(502, "ai_error", `AI error (${e.status ?? "?"}).`);
    return fail(500, "internal", e instanceof Error ? e.message : "Unknown error.");
  }
}
