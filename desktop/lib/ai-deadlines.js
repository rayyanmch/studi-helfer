// KI-Fristen aus Übungsblättern: sucht neue/aktuelle Übungsblätter im Zielordner, schickt sie an die
// Server-Route /api/ki/fristen (web/) und merkt sich das Ergebnis pro Datei-Inhalt (SHA-256).
// Jede Datei wird also nur einmal ausgewertet, egal wie oft synchronisiert wird.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MAX_FILES_PER_RUN = 15; // Kostenbremse
const RECENT_DAYS = 28; // nur Blätter, die in den letzten 4 Wochen in ILIAS geändert wurden
const MAX_BYTES = 20 * 1024 * 1024;
// Dateinamen, die nach Übungsblatt/Aufgabe aussehen (Folien und Skripte bleiben außen vor).
const SHEET_NAME =
  /(blatt|sheet|übung|uebung|ubung|exercise|homework|hausaufgabe|assignment|aufgabe|tutorium|hw ?\d|ha ?\d|ü ?\d|abgabe|testat|praktikum)/i;

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** Gleiche Regel wie deadlineId() in web/src/lib/desktop.ts. */
function deadlineId(courseId, title, date) {
  const norm = title.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
  return `${courseId}|${norm}|${date}`;
}

function createAiDeadlines({ dataDir, readJson, writeJson, listFiles, loadConfig }) {
  const CACHE = path.join(dataDir, "ai-deadlines.json");
  let running = null;

  function loadCache() {
    return readJson(CACHE, { files: {} });
  }

  async function candidates() {
    const since = Date.now() - RECENT_DAYS * 86_400_000;
    const out = [];
    for (const course of await listFiles()) {
      for (const folder of course.folders) {
        for (const f of folder.files) {
          if (f.kind !== "pdf" || f.modifiedAt < since) continue;
          if (/(lösung|loesung|losung|solution|musterlösung)/i.test(f.name)) continue; // enthalten selten neue Fristen
          if (!SHEET_NAME.test(f.name) && !SHEET_NAME.test(folder.name)) continue;
          out.push({ courseId: course.id, courseName: course.name, file: f });
        }
      }
    }
    // Neueste zuerst
    return out.sort((a, b) => b.file.modifiedAt - a.file.modifiedAt);
  }

  /**
   * Wertet noch nicht ausgewertete Übungsblätter aus.
   * @param {string} aiBaseUrl z. B. http://localhost:3000 (Server mit /api/ki/fristen)
   */
  async function run(aiBaseUrl) {
    if (running) return running;
    running = (async () => {
      const cache = loadCache();
      let analyzed = 0;
      let found = 0;
      let lastError = null;
      for (const c of await candidates()) {
        if (analyzed >= MAX_FILES_PER_RUN) break;
        let stat;
        try {
          stat = fs.statSync(c.file.path);
        } catch {
          continue;
        }
        if (stat.size > MAX_BYTES) continue;
        const hash = sha256(c.file.path);
        if (cache.files[hash] && !cache.files[hash].error) continue;
        let res;
        try {
          const r = await fetch(`${aiBaseUrl}/api/ki/fristen`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              pdfBase64: fs.readFileSync(c.file.path).toString("base64"),
              fileName: c.file.name,
              course: c.courseName,
              today: new Date().toISOString().slice(0, 10),
            }),
            signal: AbortSignal.timeout(180_000),
          });
          res = await r.json();
        } catch (e) {
          lastError = { code: "unreachable", message: `KI-Server nicht erreichbar (${e.name}).` };
          break;
        }
        if (!res.ok) {
          lastError = { code: res.code, message: res.message };
          // Ohne Schlüssel oder bei Überlastung lohnt der Rest dieses Laufs nicht.
          if (["no_key", "rate_limited", "unreachable", "forbidden"].includes(res.code)) break;
          cache.files[hash] = { courseId: c.courseId, path: c.file.path, fileName: c.file.name, analyzedAt: Date.now(), error: res.code, deadlines: [] };
          continue;
        }
        analyzed += 1;
        found += res.fristen.length;
        cache.files[hash] = {
          courseId: c.courseId,
          path: c.file.path,
          fileName: c.file.name,
          analyzedAt: Date.now(),
          deadlines: res.fristen,
        };
        writeJson(CACHE, cache);
      }
      writeJson(CACHE, cache);
      return lastError ? { ok: false, analyzed, found, ...lastError } : { ok: true, analyzed, found };
    })();
    try {
      return await running;
    } finally {
      running = null;
    }
  }

  /** KI-Fristen in der Form von DesktopDeadline (ohne done). Nur ausgewählte Kurse, ab 14 Tagen zurück. */
  function list() {
    const cfg = loadConfig();
    const selected = new Set(cfg.courses.filter((c) => c.selected).map((c) => c.id));
    const oldest = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
    const out = [];
    for (const entry of Object.values(loadCache().files)) {
      if (!selected.has(entry.courseId)) continue;
      for (const d of entry.deadlines ?? []) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d.datum) || d.datum < oldest) continue;
        const time = d.uhrzeit && /^\d{1,2}:\d{2}$/.test(d.uhrzeit) ? d.uhrzeit.padStart(5, "0") : null;
        out.push({
          id: deadlineId(entry.courseId, d.titel, d.datum),
          courseId: entry.courseId,
          title: d.titel,
          date: d.datum,
          time: time ? (d.art === "abgabe" ? `bis ${time}` : time) : "ganztägig",
          kind: d.art === "termin" ? "termin" : "abgabe",
          category: "ai",
          source: `KI: ${entry.fileName}`,
          start: `${d.datum}T${time ?? "00:00"}:00`,
          url: null,
          location: null,
          file: entry.path,
          evidence: d.beleg,
        });
      }
    }
    return out;
  }

  return { run, list, candidates };
}

module.exports = { createAiDeadlines, deadlineId };
