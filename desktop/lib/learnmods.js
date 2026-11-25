// ILIAS-Lernmodule (Selbstlerneinheiten) als PDF in den Kursordner drucken.
//
// Der Python-Helfer (studi_sync/learnmods.py) holt beim Sync die Druckansicht jedes Lernmoduls und legt
// sie aufgeräumt, mit eingebetteten Bildern als <App-Daten>/learnmods/<ref>.html ab; Liste in
// learnmods.json. Hier wird daraus <Kursordner>/<rel> (…/Selbststudium/<Titel>.pdf) gedruckt, sobald
// sich der Inhalt geändert hat oder die PDF fehlt. Gedruckte Stände stehen in learnmods-rendered.json
// (eigene Datei, damit sich Electron und Python nie dieselbe Datei teilen).

const fs = require("node:fs");
const path = require("node:path");

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function createLearnmods({ backend, BrowserWindow }) {
  const INDEX = path.join(backend.DATA_DIR, "learnmods.json");
  const HTML_DIR = path.join(backend.DATA_DIR, "learnmods");
  const RENDERED = path.join(backend.DATA_DIR, "learnmods-rendered.json");
  let running = null;

  async function printPdf(htmlFile, outFile) {
    const win = new BrowserWindow({
      show: false,
      width: 900,
      height: 1200,
      webPreferences: { javascript: false, sandbox: true, nodeIntegration: false, contextIsolation: true },
    });
    try {
      await win.loadFile(htmlFile);
      const pdf = await win.webContents.printToPDF({
        pageSize: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        generateTaggedPDF: true,
        generateDocumentOutline: true, // Kapitel/Seiten als Lesezeichen in Vorschau (braucht Tagged PDF)
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate:
          '<div style="width:100%;font:7.5pt -apple-system,Helvetica,sans-serif;color:#9ca3af;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      });
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      const tmp = path.join(path.dirname(outFile), `.${path.basename(outFile)}.tmp`);
      fs.writeFileSync(tmp, pdf);
      fs.renameSync(tmp, outFile);
    } finally {
      win.destroy();
    }
  }

  /** Fehlende oder veraltete PDFs drucken. → Anzahl gedruckter PDFs. Läuft nie doppelt. */
  async function renderPending() {
    if (running) return running;
    running = (async () => {
      const cfg = backend.loadConfig();
      const mods = Object.values(readJson(INDEX, {}).modules || {});
      if (!cfg.targetDir || mods.length === 0) return 0;
      const rendered = readJson(RENDERED, {});
      let n = 0;
      for (const m of mods) {
        const course = cfg.courses.find((c) => c.id === m.course);
        if (!course || !m.hash || typeof m.rel !== "string" || !m.rel.endsWith(".pdf")) continue;
        const out = path.join(cfg.targetDir, course.folder || backend.folderName(course.title), m.rel);
        const html = path.join(HTML_DIR, `${m.ref}.html`);
        if (!backend.insideTarget(out) || !fs.existsSync(html)) continue;
        if (rendered[m.ref] === m.hash && fs.existsSync(out)) continue;
        try {
          await printPdf(html, out);
          rendered[m.ref] = m.hash;
          n += 1;
          fs.mkdirSync(path.dirname(RENDERED), { recursive: true });
          fs.writeFileSync(RENDERED, JSON.stringify(rendered, null, 2));
        } catch (e) {
          if (process.env.STUDI_DEBUG) console.log("[learnmods]", m.rel, e.message);
        }
      }
      return n;
    })();
    try {
      return await running;
    } finally {
      running = null;
    }
  }

  return { renderPending };
}

module.exports = { createLearnmods };
