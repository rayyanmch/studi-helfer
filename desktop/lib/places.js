// Study places: holt die Orte rund um die Uni von OpenStreetMap (Overpass). Das macht die Mac-App selbst, mit
// ehrlicher Kennung im User-Agent, so wie es der Betreiber des Dienstes verlangt.

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

async function fetchOverpass(query) {
  if (typeof query !== "string" || query.length > 2000 || !/^\[out:json\]/.test(query)) return { ok: false, code: "invalid", message: "Invalid query." };
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(`${url}?data=${encodeURIComponent(query)}`, {
        headers: { "User-Agent": "StudiHelfer/0.1 (student project; github.com/rayyanmch/studi-helfer)", Accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) continue;
      return { ok: true, data: await res.json() };
    } catch {
      // nächster Server
    }
  }
  return { ok: false, code: "offline", message: "Could not reach the map service." };
}

function register(handle) {
  handle("studi:places:fetch", (query) => fetchOverpass(query));
}

module.exports = { register, fetchOverpass };
