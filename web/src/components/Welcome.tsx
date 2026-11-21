"use client";

// Kurze Begrüßung auf der Startseite: drei Sätze, was die App tut. Einmal wegklicken, dann nie wieder.
// Gemerkt im Browser-Speicher des Fensters (pro Mac), wie die anderen Ansichts-Vorlieben.

import { CalendarDays, FolderOpen, UtensilsCrossed } from "lucide-react";
import { useState, type ReactNode } from "react";
import * as store from "@/lib/app-store";
import { useApp } from "@/lib/app-store";
import { folderName } from "./ui";

const KEY = "studi.welcomeSeen";

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function Welcome({ onMensa }: { onMensa: () => void }) {
  const app = useApp();
  const [hidden, setHidden] = useState(seen);
  if (hidden || app.courses.length === 0) return null;

  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // ohne Speicher erscheint die Begrüßung beim nächsten Start noch einmal
    }
    setHidden(true);
  };
  const folder = folderName(app.targetDir);

  return (
    <section aria-labelledby="welcome-title" className="mb-7 rounded-[10px] bg-surface px-5 pb-5 pt-4">
      <div className="flex items-center gap-3">
        <h2 id="welcome-title" className="min-w-0 flex-1 text-[17px] font-semibold">
          Here’s what Studi-Helfer does for you
        </h2>
        <button onClick={close} className="h-8 shrink-0 rounded-lg bg-accent px-3.5 text-[13px] font-semibold text-on-accent hover:opacity-90">
          Got it
        </button>
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <Item icon={<FolderOpen size={16} aria-hidden />} title="Your files">
          Everything from ILIAS is saved in the “{folder}” folder on your Mac. New files arrive by themselves.
          {app.mode === "desktop" && app.targetPath && (
            <LinkButton onClick={() => store.revealFile(app.targetPath ?? undefined)}>Open folder</LinkButton>
          )}
        </Item>
        <Item icon={<CalendarDays size={16} aria-hidden />} title="Your week">
          Deadlines and classes show up below. Click one to change or hide it, tick the circle when you’re done.
        </Item>
        <Item icon={<UtensilsCrossed size={16} aria-hidden />} title="Lunch">
          See what’s on the menu at your Mensa today, with prices and vegan options.
          <LinkButton onClick={onMensa}>Open Mensa</LinkButton>
        </Item>
      </div>
    </section>
  );
}

function Item({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-sunken">{icon}</span>
      <p className="min-w-0 text-[13px] leading-snug text-muted">
        <span className="block font-semibold text-text">{title}</span>
        {children}
      </p>
    </div>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="mt-1 block rounded font-semibold text-[var(--focus)] hover:underline">
      {children}
    </button>
  );
}
