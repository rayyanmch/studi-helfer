// Raum → Ort: Wo liegt „100 Aula 1“ oder „118 Seminarraum“? Die Uni Köln schreibt vor jeden Raum die Gebäudenummer;
// diese Nummern stehen in OpenStreetMap an den Gebäuden (lib/campus-koeln.json, © OpenStreetMap contributors).
// Nur wenn wir den Ort wirklich kennen, gibt es einen Routen-Knopf. Online-Räume (Zoom) haben keinen.

import campusKoeln from "./campus-koeln.json";

export interface Building {
  ref: string; // Gebäudenummer, z. B. "100"
  name: string; // „Hauptgebäude Universität zu Köln“
  lat: number;
  lon: number;
  street: string;
}

export interface RoomPlace {
  building: Building;
  label: string; // „Building 100, Hauptgebäude“
  /** Raumtext ohne Gebäudenummer, z. B. „Aula 1“ */
  room: string;
}

const BUILDINGS = campusKoeln as Building[];

/** Gebäudenummer am Anfang des Raums: „100 Aula 1“, „118 Seminarraum“, „216a Raum 3“. */
export function resolveRoom(text: string | null | undefined): RoomPlace | null {
  if (!text) return null;
  const first = text.trim().split("\n")[0].trim();
  if (!first || /zoom|virtuell|virtual|online|https?:/i.test(first)) return null;
  // Gebäudenummer hat 2–3 Stellen; „1.21“ oder „12.3“ sind Raumnummern ohne Gebäude
  const m = /^(?:geb(?:äude|\.)?\s*)?(\d{2,3}[a-z]?)(?![\d.]\d)(?=\s|$|[,/:-])\s*[,/:-]?\s*(.*)$/i.exec(first);
  if (!m) return null;
  const ref = m[1].toLowerCase();
  const b = BUILDINGS.find((x) => x.ref.toLowerCase() === ref);
  if (!b) return null;
  const name = b.name || (b.street ? `${b.street}` : "");
  return { building: b, label: `Building ${b.ref}${name ? `, ${name}` : ""}`, room: m[2].trim() };
}

const isVirtual = (t: string) => /zoom|virtuell|virtual|online|teams\.microsoft|https?:/i.test(t);

export interface Route {
  url: string;
  label: string; // was wir dem Studenten als Ziel nennen
  exact: boolean; // true = Lage des Gebäudes bekannt; false = Apple Karten sucht den Text selbst
}

/**
 * Ziel für „Route“: Mit Gebäudenummer (Uni-Raum) die genaue Lage. Bei Terminen, die jemand selbst eingetragen hat
 * (Google Kalender, eigene Termine), ist der Ort meist eine Adresse oder ein Name: den reicht die App an Apple Karten weiter
 * (`allowText`). Online-Termine und bloße Raumnummern ohne Gebäude haben kein Ziel.
 */
export function routeFor(location: string | null | undefined, opts: { allowText?: boolean } = {}): Route | null {
  const room = resolveRoom(location);
  if (room) return { url: routeUrl(room.building.lat, room.building.lon), label: room.label, exact: true };
  const first = (location ?? "").trim().split("\n")[0].trim();
  if (opts.allowText && first.length >= 6 && /[A-Za-zÄÖÜäöüß]{3}/.test(first) && !isVirtual(first)) {
    return { url: `https://maps.apple.com/?daddr=${encodeURIComponent(first)}&dirflg=w`, label: first, exact: false };
  }
  return null;
}

/** Wegbeschreibung zu Fuß in der Karten-App des Macs (Apple Karten); der Startpunkt ist der Standort des Studenten. */
export const routeUrl = (lat: number, lon: number) => `https://maps.apple.com/?daddr=${lat},${lon}&dirflg=w`;

// ------------------------------------------------------------------ Raumänderung per Mail

export interface RoomChange {
  room: string; // neuer Raum, wie in der Mail
  date: string | null; // "2026-11-27", nur dieser Tag ist betroffen
  start: string | null; // "14:00", wenn die Mail eine Uhrzeit nennt
  mailId: string;
}

const CHANGE_WORDS = /(changed|change|moved|move|relocat|switch|new room|different room|instead|verlegt|verlegen|geandert|andert|raumanderung|raumwechsel|neuer raum|statt in|findet .* in raum|findet .* statt in|sondern|stattdessen|nicht in|ausweich)/;
const ROOM_WORDS = /(room|raum|saal|horsaal|seminarraum)/;
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Alle Räume in einem Satz, in der Reihenfolge, wie sie dort stehen. */
function roomsIn(sentence: string): string[] {
  const found: { at: number; end: number; text: string }[] = [];
  const withBuilding = /\b\d{2,3}[a-z]?\s+(?:Aula(?:\s*\d+)?|Seminarraum(?:\s*\d+)?|H(?:ö|oe)rsaal\s*[A-Z0-9]+|Raum\s*[A-Za-z0-9.]+)/g;
  for (const m of sentence.matchAll(withBuilding)) found.push({ at: m.index ?? 0, end: (m.index ?? 0) + m[0].length, text: m[0] });
  const labelled = /\b(?:room|raum|seminarraum|h(?:ö|oe)rsaal|saal)\s*:?\s+((?:[A-Z]\s?)?\d[\w.\-/]*|[IVX]{1,5}\b)/gi;
  for (const m of sentence.matchAll(labelled)) {
    const at = m.index ?? 0;
    if (found.some((f) => at >= f.at && at < f.end)) continue; // schon als „118 Seminarraum“ erfasst
    found.push({ at, end: at + m[0].length, text: m[1].replace(/[.\-/]+$/, "") });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.text.trim());
}

/** Nennt die Mail einen anderen Raum? Gibt den neuen Raum zurück, sonst null (Datum und Uhrzeit kommen von findEvent). */
export function findRoomInMail(subject: string, body: string): string | null {
  const lines = body.split("\n").filter((l) => !l.trimStart().startsWith(">"));
  const text = `${subject}\n${lines.join("\n").slice(0, 3000)}`;
  // Raum und Änderungswort müssen im selben Satz stehen („Sheet 7 moves … Room 3 is not needed“ zählt nicht)
  for (const sentence of text.split(/\n+|[.!?]\s+(?=[A-ZÄÖÜ])/)) {
    const f = fold(sentence);
    if (!ROOM_WORDS.test(f) || !CHANGE_WORDS.test(f)) continue;
    const rooms = roomsIn(sentence);
    if (rooms.length === 0) continue;
    // „A statt B“ → A; „nicht in A, sondern in B“ / „von A nach B“ → B
    return /instead of|anstatt/i.test(sentence) ? rooms[0] : rooms[rooms.length - 1];
  }
  return null;
}
