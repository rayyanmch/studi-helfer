"use client";

// Text mit Formeln: $…$ (im Text) und $$…$$ (abgesetzt) werden mit KaTeX gesetzt, **fett** wird fett.
// Nur im Mathe-Modus (math), sonst bleibt der Text, wie er ist (BWL-Preise wie „5 $“ sollen keine Formeln werden).

import katex from "katex";
import { Fragment, useMemo } from "react";

const MATH = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)/g;

function bold(text: string, key: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={`${key}-${i}`}>{part}</strong> : <Fragment key={`${key}-${i}`}>{part}</Fragment>));
}

export function MathText({ text, math = true, className }: { text: string; math?: boolean; className?: string }) {
  const nodes = useMemo(() => {
    const t = String(text ?? "");
    if (!math) return bold(t, "t");
    const out: React.ReactNode[] = [];
    let last = 0;
    let n = 0;
    for (const m of t.matchAll(MATH)) {
      out.push(...bold(t.slice(last, m.index), `t${n}`));
      const display = m[1] != null || m[2] != null;
      const tex = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
      // KaTeX erzeugt nur Markup für die Formel (trust: false, keine Links/Skripte)
      const html = katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: "ignore", output: "html" });
      out.push(<span key={`m${n}`} className={display ? "block overflow-x-auto py-1" : undefined} dangerouslySetInnerHTML={{ __html: html }} />);
      last = (m.index ?? 0) + m[0].length;
      n += 1;
    }
    out.push(...bold(t.slice(last), "end"));
    return out;
  }, [text, math]);
  return <span className={className}>{nodes}</span>;
}
