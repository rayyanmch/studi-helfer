"use client";

// Tag mit der Art eines Dokuments („Lecture“, „Exercise sheet“ …). Klick öffnet ein kleines Menü zum Ändern;
// „Automatic“ nimmt die Änderung zurück. Die Art bestimmt auch, ob es eine Zusammenfassung oder eine Lernhilfe gibt.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { DOC_TYPES, type DocType, autoDocType, docTypeOverride, docTypeStore, setDocType } from "@/lib/doctype";
import type { CourseFile, Folder } from "@/lib/mock-data";

/** Neu rendern, wenn der Nutzer eine Art ändert. */
export function useDocTypes() {
  return useSyncExternalStore(docTypeStore.subscribe, docTypeStore.version, () => 0);
}

const toneVar = (tone: string, part: "soft" | "ink") => (tone === "gray" ? (part === "soft" ? "var(--sunken)" : "var(--muted)") : `var(--c-${tone}-${part})`);

export function DocTag({ file, folder, editable = true }: { file: CourseFile; folder?: Pick<Folder, "category" | "name">; editable?: boolean }) {
  useDocTypes();
  const auto = autoDocType(file, folder);
  const override = docTypeOverride(file.id);
  const type: DocType = override ?? auto;
  const info = DOC_TYPES.find((d) => d.type === type)!;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) {
        if (e instanceof KeyboardEvent) e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close, true);
    };
  }, [open]);

  const pill = (
    <span
      className="inline-flex h-[18px] shrink-0 items-center rounded-[5px] px-1.5 text-[11px] font-semibold leading-none"
      style={{ background: toneVar(info.tone, "soft"), color: toneVar(info.tone, "ink") }}
    >
      {info.label}
    </span>
  );
  if (!editable) return pill;

  return (
    <span ref={ref} className="relative inline-flex shrink-0">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        aria-haspopup="menu"
        aria-expanded={open}
        title={override ? "You set this type. Click to change." : "Detected automatically. Click to change."}
        className="rounded-[5px] outline-offset-1"
      >
        {pill}
      </button>
      {open && (
        <span role="menu" className="absolute left-0 top-[22px] z-30 w-[230px] rounded-[10px] bg-surface p-1 shadow-[0_8px_30px_rgba(0,0,0,0.18),0_0_0_1px_var(--line)]">
          <span className="block px-2.5 pb-1 pt-1.5 text-[11px] font-semibold text-muted">What is this file?</span>
          {DOC_TYPES.map((d) => (
            <button
              key={d.type}
              role="menuitemradio"
              aria-checked={d.type === type}
              onClick={(e) => {
                e.stopPropagation();
                setDocType(file.id, d.type === auto ? null : d.type);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left text-[13px] hover:bg-hover"
            >
              <span className="size-2 shrink-0 rounded-full" style={{ background: toneVar(d.tone, "ink") }} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{d.label}</span>
                <span className="block truncate text-[11px] text-muted">{d.hint}</span>
              </span>
              {d.type === type && <Check size={13} aria-hidden />}
            </button>
          ))}
          {override && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDocType(file.id, null);
                setOpen(false);
              }}
              className="mt-1 block w-full rounded-[7px] border-t border-line-soft px-2.5 py-1.5 text-left text-[12px] text-muted hover:bg-hover"
            >
              Back to automatic ({DOC_TYPES.find((d) => d.type === auto)?.label})
            </button>
          )}
        </span>
      )}
    </span>
  );
}
