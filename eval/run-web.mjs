#!/usr/bin/env node
// Prüfstand für die Regel-Erkennung in TypeScript/JS: Dokument-Art (web/src/lib/doctype.ts + categoryOf aus
// desktop/lib/modules.js, wie backend.js sie aufruft), Lösung zum Blatt (web/src/lib/solutions.ts) und
// Module bündeln + Kurznamen (desktop/lib/modules.js).
//
// Aufruf (aus dem Repo):  node eval/run-web.mjs [Filter] [-v] [--no-save]
// Echte Fälle lesen Dateinamen aus ~/Uni ($EVAL_UNI_DIR), nie den Inhalt. Fehlt der Ordner, wird übersprungen.
// Exit-Code 2, wenn ein vorher bestandener Fall jetzt fehlschlägt (Vergleich mit results/web.json).

import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join, relative, extname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const require = createRequire(import.meta.url);
const { categoryOf, buildModules } = require(join(REPO, "desktop/lib/modules.js"));
const { autoDocType } = await import(join(REPO, "web/src/lib/doctype.ts"));
const { linkSolutions } = await import(join(REPO, "web/src/lib/solutions.ts"));

const args = process.argv.slice(2);
const verbose = args.includes("-v") || args.includes("--verbose");
const noSave = args.includes("--no-save");
const filter = args.find((a) => !a.startsWith("-"));
const UNI = process.env.EVAL_UNI_DIR || join(homedir(), "Uni");
const RESULTS = join(HERE, "results/web.json");

function walk(root, base = root, out = []) {
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const full = join(root, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else if (e.isFile()) out.push(relative(base, full));
  }
  return out;
}

function loadCases() {
  const cases = [];
  for (const kind of ["real", "synthetic"]) {
    const dir = join(HERE, "cases", kind);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
      const data = JSON.parse(readFileSync(join(dir, f), "utf8"));
      for (const c of Array.isArray(data) ? data : [data]) {
        if (!["doctype", "solutions", "modules"].includes(c.algo)) continue;
        c.id = `${kind}/${c.id}`;
        c.kind = kind;
        if (!filter || c.id.includes(filter)) cases.push(c);
      }
    }
  }
  return cases;
}

class Score {
  constructor() {
    this.cats = {};
    this.msgs = [];
  }
  add(cat, { tp = 0, fp = 0, fn = 0 } = {}, msg) {
    const c = (this.cats[cat] ??= [0, 0, 0]);
    c[0] += tp;
    c[1] += fp;
    c[2] += fn;
    if (msg) this.msgs.push(`${cat}: ${msg}`);
  }
  get errors() {
    return Object.values(this.cats).reduce((s, [, fp, fn]) => s + fp + fn, 0);
  }
}

const fileOf = (rel) => {
  const name = basename(rel);
  const where = dirname(rel) === "." ? "" : dirname(rel);
  const ext = extname(name).slice(1).toLowerCase();
  return { id: rel, name, where, kind: ext === "pdf" ? "pdf" : ext ? "other" : "other" };
};

function runDoctype(c, sc) {
  for (const [rel, want] of Object.entries(c.files)) {
    const f = fileOf(rel);
    const cat = categoryOf(f.name, f.where, c.part ?? "Course");
    const got = autoDocType(f, { category: cat, name: "" });
    const ok = Array.isArray(want) ? want.includes(got) : got === want;
    if (ok) sc.add("doctype", { tp: 1 });
    else sc.add("doctype", { fn: 1 }, `${rel}: ${got}, erwartet ${Array.isArray(want) ? want.join("/") : want} (Ordner-Art ${cat})`);
  }
}

function runSolutions(c, sc, uniRoot) {
  const rels = c.filesFromFolder ? walk(uniRoot).filter((r) => r.toLowerCase().endsWith(".pdf")) : c.files;
  const files = rels.map(fileOf);
  const { sheetOf } = linkSolutions(files);
  for (const [sol, sheet] of Object.entries(c.expect)) {
    const got = sheetOf.get(sol)?.id;
    if (got === sheet) sc.add("solutions", { tp: 1 });
    else sc.add("solutions", { fn: 1 }, `${basename(sol)} → ${got ? basename(got) : "nichts"}, erwartet ${basename(sheet)}`);
  }
  for (const [sol, sheet] of sheetOf) {
    if (!(sol in c.expect)) sc.add("solutions", { fp: 1 }, `Fehlalarm ${basename(sol)} → ${basename(sheet.id)}`);
  }
}

function runModules(c, sc) {
  const names = {};
  for (const [cid, folder] of Object.entries(c.filesFrom ?? {})) {
    const root = join(UNI, folder);
    if (existsSync(root)) names[cid] = walk(root).map((r) => basename(r));
  }
  const { modules } = buildModules(c.courses, {}, names);
  const key = (ids) => [...ids].sort().join("+");
  const want = new Map(c.expect.map((e) => [key(e.parts), e]));
  for (const m of modules) {
    const k = key(m.parts.map((p) => p.courseId));
    const e = want.get(k);
    if (!e) {
      sc.add("modules.group", { fp: 1 }, `Modul ${k} („${m.autoName}“) gibt es so nicht`);
      continue;
    }
    want.delete(k);
    sc.add("modules.group", { tp: 1 });
    if (e.name) {
      if (e.name.includes(m.autoName)) sc.add("modules.name", { tp: 1 });
      else sc.add("modules.name", { fn: 1 }, `${k}: „${m.autoName}“, erwartet ${e.name.map((n) => `„${n}“`).join(" oder ")}`);
    }
  }
  for (const [k] of want) sc.add("modules.group", { fn: 1 }, `verpasst: ${k} als ein Modul`);
}

const cases = loadCases();
const results = {};
const totals = {};
const width = Math.max(20, ...cases.map((c) => c.id.length));
console.log(`${"Fall".padEnd(width)}  Ergebnis  Fehler`);
const t0 = performance.now();
for (const c of cases) {
  const root = c.folder ? join(UNI, c.folder) : null;
  if (c.kind === "real" && root && !existsSync(root)) {
    console.log(`${c.id.padEnd(width)}  übersprungen (Ordner fehlt: ${c.folder})`);
    results[c.id] = { status: "skip", why: `Ordner fehlt: ${c.folder}` };
    continue;
  }
  if (c.kind === "real" && c.algo === "doctype") {
    const missing = Object.keys(c.files).filter((r) => !existsSync(join(root, r)));
    for (const r of missing) delete c.files[r];
  }
  const sc = new Score();
  if (c.algo === "doctype") runDoctype(c, sc);
  else if (c.algo === "solutions") runSolutions(c, sc, root);
  else runModules(c, sc);
  for (const [cat, v] of Object.entries(sc.cats)) {
    const t = (totals[cat] ??= [0, 0, 0]);
    v.forEach((x, i) => (t[i] += x));
  }
  const ok = sc.errors === 0;
  console.log(`${c.id.padEnd(width)}  ${(ok ? "ok" : "FEHLER").padEnd(8)}  ${sc.errors}`);
  if (!ok || verbose) for (const m of sc.msgs) console.log(`    - ${m}`);
  results[c.id] = { status: ok ? "pass" : "fail", errors: sc.errors, details: sc.msgs };
}
const seconds = (performance.now() - t0) / 1000;

console.log(`\n${"Kategorie".padEnd(20)} ${"Treffer".padStart(7)} ${"Fehlalarm".padStart(9)} ${"Verpasst".padStart(8)} ${"Precision".padStart(9)} ${"Recall".padStart(7)}`);
for (const cat of Object.keys(totals).sort()) {
  const [tp, fp, fn] = totals[cat];
  const p = tp + fp ? `${Math.round((100 * tp) / (tp + fp))}%` : "–";
  const r = tp + fn ? `${Math.round((100 * tp) / (tp + fn))}%` : "–";
  console.log(`${cat.padEnd(20)} ${String(tp).padStart(7)} ${String(fp).padStart(9)} ${String(fn).padStart(8)} ${p.padStart(9)} ${r.padStart(7)}`);
}
const sum = (i) => Object.values(totals).reduce((s, v) => s + v[i], 0);
const [tp, fp, fn] = [sum(0), sum(1), sum(2)];
const vals = Object.values(results);
const passed = vals.filter((r) => r.status === "pass").length;
const ran = vals.filter((r) => r.status !== "skip").length;
const skipped = vals.length - ran;
console.log(`\nSumme: ${tp} Treffer, ${fp} Fehlalarme, ${fn} verpasst → ${fp + fn} Fehler · ${passed}/${ran} Fälle bestanden${skipped ? ` · ${skipped} übersprungen` : ""}`);
console.log(`Laufzeit gesamt: ${seconds.toFixed(2)} s`);

let code = 0;
if (existsSync(RESULTS) && !filter) {
  const prev = JSON.parse(readFileSync(RESULTS, "utf8"));
  const regress = Object.entries(results).filter(([id, r]) => r.status === "fail" && prev.cases[id]?.status === "pass").map(([id]) => id);
  const fixed = Object.entries(results).filter(([id, r]) => r.status === "pass" && prev.cases[id]?.status === "fail").map(([id]) => id);
  console.log(`\nVorher: ${prev.summary?.errors} Fehler → jetzt ${fp + fn}`);
  if (fixed.length) console.log(`Neu bestanden: ${fixed.join(", ")}`);
  if (regress.length) {
    console.log(`RÜCKSCHRITT, vorher bestanden: ${regress.join(", ")}`);
    code = 2;
  }
}
if (!noSave && !filter) {
  mkdirSync(dirname(RESULTS), { recursive: true });
  const summary = { errors: fp + fn, tp, fp, fn, passed, ran, skipped, categories: totals, seconds: Number(seconds.toFixed(2)) };
  writeFileSync(RESULTS, JSON.stringify({ when: new Date().toISOString().slice(0, 10), summary, cases: results }, null, 1) + "\n");
}
process.exit(code);
