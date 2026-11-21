"use client";

// Glossar und Formelsammlung eines Moduls. Füllt sich von selbst aus allen Zusammenfassungen und Lernhilfen
// (Begriffe, Formeln, mit Woche und Fundstelle) und wächst mit jedem neuen Material. Nutzer können Einträge ändern,
// ausblenden und eigene hinzufügen (gespeichert in <App-Daten>/study/glossary.json über desktop/lib/study.js).

import { useMemo, useState } from "react";
import { Check, Download, EyeOff, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Button, tone } from "./ui";
import { displayName } from "./files";
import { MathText } from "./MathText";
import type { Course, CourseColor } from "@/lib/mock-data";
import * as store from "@/lib/app-store";
import { type GlossaryData, type GlossaryEntry, exportAnki, fileKey, saveGlossary, useGlossaryData, useStudy, useWeeks } from "@/lib/study";
import type { Week } from "@/lib/weeks";

type Kind = "term" | "formula";

export interface Item {
  key: string; // auto: "term:<begriff>" bzw. "formula:<name>", eigene: "own:<id>"
  kind: Kind;
  term: string;
  definition: string;
  note?: string;
  sources: { label: string; path?: string; week: number | null }[];
  own: boolean;
  edited: boolean;
  hidden: boolean;
  fresh: boolean; // aus einer Datei, die in den letzten 7 Tagen ausgewertet wurde
  week: number | null; // erste Woche, in der der Eintrag vorkommt
}

const norm = (s: string) =>
  s
    .normalize("NFC")
    .toLowerCase()
    .replace(/\$[^$]*\$/g, (m) => m) // Formeln bleiben, wie sie sind
    .replace(/[^a-z0-9äöüß$\\^_{}=+\-*/() ]/gi, "")
    .replace(/\s+/g, " ")
    .trim();

/** Automatische und eigene Einträge eines Moduls, mit Änderungen des Nutzers verrechnet. */
export function useGlossary(course: Course) {
  const study = useStudy();
  const weeks = useWeeks(course);
  const data = useGlossaryData(course.id);
  // „new“ nur für Einträge aus Dateien, die nach dem ersten Öffnen des Glossars dazukamen (sonst ist am ersten Tag alles neu)
  const [seen] = useState(() => {
    try {
      const k = `studi.glossarySeen.${course.id}`;
      const v = Number(localStorage.getItem(k));
      if (v) return v;
      localStorage.setItem(k, String(Date.now()));
    } catch {
      // egal
    }
    return Date.now();
  });
  const items = useMemo(() => build(weeks, study.files, data, seen), [weeks, study.files, data, seen]);
  return { items, data };
}

function build(weeks: Week[], files: ReturnType<typeof useStudy>["files"], data: GlossaryData, seen: number): Item[] {
  const map = new Map<string, Item>();
  const weekAgo = Math.max(seen, Date.now() - 7 * 86_400_000);
  const ordered = [...weeks.filter((w) => w.kind === "week"), ...weeks.filter((w) => w.kind !== "week")];
  // Duplikate zusammenführen: „AIDA-Formel“ = „AIDA-Modell“, gleiche Formel unter anderem Namen
  const GENERIC = new Set("modell model formel formula prinzip principle konzept concept schema ansatz approach methode method regel rule satz theorem gesetz law begriff".split(" "));
  const keyOf = (kind: Kind, term: string, definition: string) => {
    if (kind === "formula") return `formula:${definition.replace(/\s+/g, "").replace(/[{}]/g, "").toLowerCase().slice(0, 80)}`;
    const tokens = norm(term).split(/[\s-]+/).filter(Boolean);
    const core = tokens.length > 1 && tokens[0].length >= 4 ? tokens.filter((t, i) => i === 0 || !GENERIC.has(t)) : tokens;
    return `term:${core.join(" ")}`;
  };
  const add = (kind: Kind, term: string, definition: string, note: string | undefined, source: Item["sources"][number], at: number) => {
    if (!term.trim() || !definition.trim()) return;
    const key = keyOf(kind, term, definition);
    const cur = map.get(key);
    if (cur) {
      if (!cur.sources.some((s) => s.label === source.label)) cur.sources.push(source);
      if (definition.length > cur.definition.length && cur.definition.length < 40) cur.definition = definition;
      if (at > weekAgo) cur.fresh = true;
      return;
    }
    map.set(key, { key, kind, term, definition, note, sources: [source], own: false, edited: false, hidden: false, fresh: at > weekAgo, week: source.week });
  };
  for (const w of ordered) {
    for (const x of w.files) {
      const a = files[fileKey(x.file)];
      if (!a) continue;
      const src = (page: number) => ({
        label: `${w.kind === "week" ? `Week ${w.n}` : w.kind === "info" ? "Course info" : "Exam prep"} · ${displayName(x.file.name)}${page > 0 ? `, p. ${page}` : ""}`,
        path: x.file.path,
        week: w.n,
      });
      // Begriffe nur aus Lernstoff (keine Fallstudien, Altklausuren, Lösungen: dort stecken Fall-Details in den Definitionen)
      const learning = ["lecture", "notes", "reading", "selfstudy", "exslides", "tutorial"].includes(x.type);
      if (learning) for (const t of a.terms ?? []) add("term", t.term, t.definition, undefined, src(t.page), a.at);
      if (x.type !== "info") for (const f of a.formulas ?? []) add("formula", f.name, f.formula, f.meaning, src(f.page), a.at);
      // ältere Vorlesungs-Auswertungen ohne Formel-Liste: Formel-Karten übernehmen (keine Lückentexte)
      if (!a.formulas && learning && a.kind !== "help")
        for (const c of a.cards.filter((c) => c.type === "formula" && !/_{2,}/.test(c.q) && c.a.length < 300)) add("formula", c.q.replace(/^(wie lautet|what is|gib|nenne)\s+/i, "").replace(/\?$/, ""), c.a, undefined, src(c.page), a.at);
    }
  }
  // Änderungen des Nutzers
  for (const [key, e] of Object.entries(data.edits)) {
    const it = map.get(key);
    if (!it) continue;
    if (e.term != null) it.term = e.term;
    if (e.definition != null) it.definition = e.definition;
    it.edited = e.term != null || e.definition != null;
    it.hidden = Boolean(e.hidden);
  }
  const list = [...map.values()];
  for (const c of data.custom)
    list.push({ key: `own:${c.id}`, kind: c.kind, term: c.term, definition: c.definition, note: c.note, sources: [{ label: "Added by you", week: null }], own: true, edited: false, hidden: false, fresh: c.at > weekAgo, week: null });
  return list;
}

export function GlossaryPanel({ course, color, kind, math }: { course: Course; color: CourseColor; kind: Kind; math: boolean }) {
  const { items, data } = useGlossary(course);
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [week, setWeek] = useState<number | "all">("all");
  const q = norm(query);
  const all = items.filter((i) => i.kind === kind);
  const hiddenCount = all.filter((i) => i.hidden).length;
  const weeksPresent = [...new Set(all.map((i) => i.week).filter((w): w is number => w != null))].sort((a, b) => a - b);
  const shown = all
    .filter((i) => showHidden || !i.hidden)
    .filter((i) => week === "all" || i.sources.some((s) => s.week === week) || (i.own && false))
    .filter((i) => !q || norm(`${i.term} ${i.definition} ${i.note ?? ""}`).includes(q))
    .sort((a, b) => (kind === "formula" ? (a.week ?? 99) - (b.week ?? 99) || a.term.localeCompare(b.term, "de") : a.term.localeCompare(b.term, "de", { sensitivity: "base" })));

  const save = (next: GlossaryData) => void saveGlossary(course.id, next);
  const update = (it: Item, term: string, definition: string, note?: string) => {
    if (it.own) save({ ...data, custom: data.custom.map((c) => (`own:${c.id}` === it.key ? { ...c, term, definition, note } : c)) });
    else save({ ...data, edits: { ...data.edits, [it.key]: { ...data.edits[it.key], term, definition } } });
    setEditing(null);
  };
  const hide = (it: Item, hidden: boolean) => {
    if (it.own) save({ ...data, custom: data.custom.filter((c) => `own:${c.id}` !== it.key) });
    else save({ ...data, edits: { ...data.edits, [it.key]: { ...data.edits[it.key], hidden } } });
  };
  const reset = (it: Item) => {
    const next = { ...data.edits };
    delete next[it.key];
    save({ ...data, edits: next });
  };
  const addOwn = (term: string, definition: string, note?: string) => {
    const entry: GlossaryEntry = { id: crypto.randomUUID(), kind, term, definition, note, at: Date.now() };
    save({ ...data, custom: [...data.custom, entry] });
    setAdding(false);
  };

  // Begriffe: Gruppen nach Anfangsbuchstabe; Formeln: nach Woche
  const groups = new Map<string, Item[]>();
  for (const it of shown) {
    const g = kind === "term" ? (it.term.replace(/^[^A-Za-zÄÖÜäöü0-9]+/, "")[0] ?? "#").toUpperCase() : it.week != null ? `Week ${it.week}` : "Your own and general";
    groups.set(g, [...(groups.get(g) ?? []), it]);
  }

  return (
    <section aria-label={kind === "term" ? "Glossary" : "Formula collection"} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-9 min-w-[220px] flex-1 items-center gap-2 rounded-lg bg-surface px-3 shadow-[inset_0_0_0_1px_var(--line)] focus-within:shadow-[inset_0_0_0_2px_var(--focus)]">
          <Search size={14} className="shrink-0 text-muted" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder={kind === "term" ? `Search ${all.length} terms` : `Search ${all.length} formulas`}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted"
          />
        </label>
        {weeksPresent.length > 1 && (
          <select
            value={week}
            onChange={(e) => setWeek(e.target.value === "all" ? "all" : Number(e.target.value))}
            aria-label="Filter by week"
            className="h-9 rounded-lg bg-surface px-2.5 text-[13px] shadow-[inset_0_0_0_1px_var(--line)] outline-none"
          >
            <option value="all">All weeks</option>
            {weeksPresent.map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>
        )}
        <Button onClick={() => setAdding(true)}>
          <Plus size={14} aria-hidden /> {kind === "term" ? "Add term" : "Add formula"}
        </Button>
        <Button
          variant="plain"
          disabled={!shown.length}
          title="Save as a text file for Anki"
          onClick={async () => {
            const msg = await exportAnki(
              `${course.name} ${kind === "term" ? "glossary" : "formulas"}`,
              shown.map((i) => ({ id: i.key, q: i.term, a: i.note ? `${i.definition}\n${i.note}` : i.definition, page: 0, file: course.name, path: "" })),
            );
            if (msg) setError(msg);
          }}
        >
          <Download size={14} aria-hidden /> Anki
        </Button>
      </div>
      <p className="-mt-1 text-[12px] text-muted">
        {kind === "term"
          ? "Collected from all summaries of this course and updated with every new file. Edit, hide or add your own."
          : "Every formula from the lectures and sheets, by week. Updated with every new file. Write formulas as $…$."}
        {hiddenCount > 0 && (
          <button onClick={() => setShowHidden(!showHidden)} className="ml-2 font-semibold hover:underline">
            {showHidden ? "Don’t show hidden" : `${hiddenCount} hidden`}
          </button>
        )}
      </p>
      {error && <p className="text-[13px] text-danger">{error}</p>}

      {adding && <EntryEditor kind={kind} math={math} onCancel={() => setAdding(false)} onSave={addOwn} />}

      {shown.length === 0 && !adding ? (
        <p className="rounded-[12px] bg-surface px-4 py-5 text-[13px] text-muted">
          {query
            ? `Nothing matches “${query}”.`
            : kind === "term"
              ? "No terms yet. They appear here as soon as files of this course are summarized."
              : "No formulas yet. They appear here as soon as lectures with formulas are summarized."}
        </p>
      ) : (
        [...groups.entries()].map(([g, list]) => (
          <div key={g}>
            <h3 className="mb-1 px-1 text-[12px] font-bold text-muted">{g}</h3>
            <ul className="rounded-[12px] bg-surface px-1.5 py-1">
              {list.map((it) =>
                editing === it.key ? (
                  <li key={it.key} className="px-1 py-1">
                    <EntryEditor
                      kind={kind}
                      math={math}
                      initial={it}
                      onCancel={() => setEditing(null)}
                      onSave={(t, d, n) => update(it, t, d, n)}
                      onReset={it.edited ? () => (reset(it), setEditing(null)) : undefined}
                    />
                  </li>
                ) : (
                  <EntryRow key={it.key} it={it} color={color} math={math} onEdit={() => setEditing(it.key)} onHide={(h) => hide(it, h)} />
                ),
              )}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

function EntryRow({ it, color, math, onEdit, onHide }: { it: Item; color: CourseColor; math: boolean; onEdit: () => void; onHide: (hidden: boolean) => void }) {
  return (
    <li className={`group flex items-start gap-3 border-b border-line-soft px-2.5 py-2.5 last:border-0 ${it.hidden ? "opacity-50" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold">
            <MathText text={it.term} math={math} />
          </span>
          {it.fresh && !it.own && <span className="rounded-full bg-[var(--c-green-soft)] px-1.5 text-[11px] font-semibold text-[var(--c-green-ink)]">new</span>}
          {it.own && (
            <span className="rounded-full px-1.5 text-[11px] font-semibold" style={{ background: tone(color, "soft"), color: tone(color, "ink") }}>
              yours
            </span>
          )}
          {it.edited && <span className="text-[11px] text-muted">edited</span>}
        </p>
        <div className={`mt-0.5 text-[14px] leading-relaxed ${it.kind === "formula" ? "" : "text-muted"}`}>
          <MathText text={it.definition} math={math || it.kind === "formula"} />
        </div>
        {it.note && (
          <p className="mt-0.5 text-[13px] text-muted">
            <MathText text={it.note} math={math || it.kind === "formula"} />
          </p>
        )}
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
          {it.sources.slice(0, 3).map((s) =>
            s.path ? (
              <button key={s.label} onClick={() => store.openFile(s.path)} className="hover:text-text hover:underline" title="Open the file">
                {s.label}
              </button>
            ) : (
              <span key={s.label}>{s.label}</span>
            ),
          )}
          {it.sources.length > 3 && <span>+{it.sources.length - 3} more</span>}
        </p>
      </div>
      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button onClick={onEdit} className="rounded p-1.5 text-muted hover:bg-hover hover:text-text" aria-label="Edit" title="Edit">
          <Pencil size={14} aria-hidden />
        </button>
        <button
          onClick={() => onHide(!it.hidden)}
          className="rounded p-1.5 text-muted hover:bg-hover hover:text-text"
          aria-label={it.own ? "Delete" : it.hidden ? "Show again" : "Hide"}
          title={it.own ? "Delete" : it.hidden ? "Show again" : "Hide (comes back with “hidden”)"}
        >
          {it.own ? <Trash2 size={14} aria-hidden /> : it.hidden ? <Check size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}
        </button>
      </div>
    </li>
  );
}

function EntryEditor({
  kind,
  math,
  initial,
  onSave,
  onCancel,
  onReset,
}: {
  kind: Kind;
  math: boolean;
  initial?: Item;
  onSave: (term: string, definition: string, note?: string) => void;
  onCancel: () => void;
  onReset?: () => void;
}) {
  const [term, setTerm] = useState(initial?.term ?? "");
  const [definition, setDefinition] = useState(initial?.definition ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const formula = kind === "formula";
  const field = "w-full rounded-lg bg-sunken px-3 py-2 text-[13px] outline-none placeholder:text-muted focus:shadow-[inset_0_0_0_2px_var(--focus)]";
  return (
    <div
      className="rounded-[12px] bg-surface p-3 shadow-[inset_0_0_0_1px_var(--line)]"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && term.trim() && definition.trim()) onSave(term.trim(), definition.trim(), note.trim() || undefined);
      }}
    >
      <input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder={formula ? "Name, e.g. “Betriebsergebnis”" : "Term"} className={field} />
      <textarea
        value={definition}
        onChange={(e) => setDefinition(e.target.value)}
        rows={formula ? 2 : 3}
        placeholder={formula ? "Formula, e.g. $BE = L - SK$" : "Explanation in your own words"}
        className={`${field} mt-2 resize-y`}
      />
      {formula && <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What the symbols mean (optional)" className={`${field} mt-2`} />}
      {(math || formula) && /\$/.test(definition) && (
        <div className="mt-2 rounded-lg bg-sunken/60 px-3 py-2 text-[14px]">
          <span className="mr-2 text-[11px] font-semibold text-muted">Preview</span>
          <MathText text={definition} math />
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        {onReset && (
          <Button variant="plain" className="mr-auto text-muted" onClick={onReset}>
            Back to original
          </Button>
        )}
        <span className="mr-auto text-[11px] text-muted">{onReset ? "" : "⌘↵ to save"}</span>
        <Button variant="plain" onClick={onCancel}>
          <X size={14} aria-hidden /> Cancel
        </Button>
        <Button variant="primary" disabled={!term.trim() || !definition.trim()} onClick={() => onSave(term.trim(), definition.trim(), note.trim() || undefined)}>
          <Check size={14} aria-hidden /> Save
        </Button>
      </div>
    </div>
  );
}
