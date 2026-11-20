// Lesbare Namen für Dateien und ILIAS-Ordner (ohne KI, nur Regeln).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Ordner aus ILIAS kurz, aber erkennbar:
 *  „Woche 3 - Absatzmärkte gestalten/Vorlesung“ → „Woche 3 › Vorlesung“
 *  „2026-10-16, 10:00 - 11:30: ISM - Vorlesung“  → „Session Oct 16“ */
export function shortWhere(where?: string) {
  if (!where) return "";
  const parts = where.split("/").map((p) => {
    const session = p.match(/^(\d{4})-(\d{2})-(\d{2}),\s*\d{1,2}:\d{2}/);
    if (session) return `Session ${MONTHS[Number(session[2]) - 1]} ${Number(session[3])}`;
    // Langer Zusatz nach „ - “ fällt weg („Woche 1 - In Unternehmen wirtschaftlich denken…“ → „Woche 1“)
    const dash = p.indexOf(" - ");
    return (dash > 0 && p.length > 28 ? p.slice(0, dash) : p).trim();
  });
  return parts.filter(Boolean).slice(-2).join(" › ");
}

/** Lesbarer Dateiname: Kürzel und Semester vorne weg, Unterstriche zu Leerzeichen, ohne Endung.
 *  „ISM_WS26_27_VL08_Computer_Supported_Cooperative_Work.pdf“ → „VL08 Computer Supported Cooperative Work“ */
export function displayName(name: string) {
  let n = name.replace(/\.[a-z0-9]{1,5}$/i, "");
  n = n.replace(/^[A-Z]{2,5}\d{0,2}[_\-\s]+(?=\S)/, ""); // „ISM_“, „BWL26_“, „SSE_“
  n = n.replace(/(^|[_\-\s])(WS|SS|WiSe|SoSe)[_\-\s]?\d{2,4}([_\-/]\d{2,4})?(?=[_\-\s]|$)/gi, " ");
  n = n.replace(/_+/g, " ").replace(/\s{2,}/g, " ").trim();
  return n || name;
}

