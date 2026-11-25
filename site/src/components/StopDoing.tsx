"use client";

import { useEffect, useRef, useState } from "react";
import { Section } from "./ui";
import type { Tone } from "@/lib/week";

// Jede Zeile wird beim Hereinscrollen in ihrer Kursfarbe durchgestrichen.
const LINES: { text: string; note: string; tone: Tone }[] = [
  { text: "Checking for new slides.", note: "Ordo fetches them every morning, even when it is closed.", tone: "blue" },
  { text: "Downloading Blatt_04 (2).pdf.", note: "Files land on your Mac, one folder per course.", tone: "orange" },
  { text: "Copying deadlines into a calendar.", note: "Found in your course calendar and inside your sheets.", tone: "green" },
  { text: "Missing the exam registration.", note: "Ordo asks weeks ahead whether you registered.", tone: "plum" },
];

export function StopDoing() {
  return (
    <Section className="pt-[200px]">
      <h2 className="m-0 text-[22px] font-semibold text-muted">Things you can stop doing</h2>
      <ul className="m-0 mt-8 list-none border-b border-line p-0">
        {LINES.map((l) => (
          <Line key={l.text} {...l} />
        ))}
      </ul>
    </Section>
  );
}

function Line({ text, note, tone }: { text: string; note: string; tone: Tone }) {
  const ref = useRef<HTMLLIElement>(null);
  const [struck, setStruck] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Erst streichen, wenn die Zeile deutlich im Bild ist (untere Fensterhälfte zählt nicht)
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setStruck(true), {
      rootMargin: "0px 0px -38% 0px",
      threshold: 1,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <li
      ref={ref}
      data-struck={struck}
      className="grid items-baseline gap-x-10 gap-y-2 border-t border-line py-[26px] md:grid-cols-[minmax(0,1fr)_17em]"
      style={{ ["--c" as string]: `var(--c-${tone})` }}
    >
      <span className="text-[clamp(26px,3.6vw,46px)] leading-[1.15] font-medium tracking-[-0.03em]">
        <span className="strike">{text}</span>
      </span>
      <span className="text-[17px] leading-[1.45] text-muted">{note}</span>
    </li>
  );
}
