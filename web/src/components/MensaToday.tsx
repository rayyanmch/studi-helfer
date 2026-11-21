"use client";

// Kleine Zeile auf der Startseite: „Lunch today at Zülpicher Straße“ mit 2–3 Gerichten.
// Nur Mo–Fr bis 15 Uhr (danach ist die Mensa zu); Klick öffnet den Mensa-Tab.

import { UtensilsCrossed } from "lucide-react";
import { useEffect, useState } from "react";
import { loadMensa, readPrefs, useMensa, type MensaPrefs } from "@/lib/mensa";

const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function MensaToday({ onOpen }: { onOpen: () => void }) {
  const { data } = useMensa();
  const [prefs] = useState<MensaPrefs>(readPrefs);
  // Uhrzeit einmal beim Öffnen merken (Rendern bleibt rein)
  const [now] = useState(() => new Date());
  const open = now.getDay() >= 1 && now.getDay() <= 5 && now.getHours() < 15;

  useEffect(() => {
    if (open) void loadMensa();
  }, [open]);

  if (!open || !data) return null;
  const location = data.locations.includes(prefs.location) ? prefs.location : data.locations[0];
  const dishes = (data.days[isoOf(now)] ?? [])
    .filter((d) => d.location === location && d.group !== "side" && d.group !== "dessert" && !d.soldOut)
    .filter((d) => prefs.diet === "all" || (prefs.diet === "vegan" ? d.diet === "vegan" : d.diet !== null))
    .slice(0, 3);
  if (dishes.length === 0) return null;
  const place = location.replace(/^Mensa\s+/i, "");

  return (
    <button
      onClick={onOpen}
      className="mt-3 flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] bg-surface px-4 py-3 text-left transition-colors hover:bg-hover"
    >
      <span className="flex items-center gap-2 font-semibold">
        <UtensilsCrossed size={15} className="text-muted" aria-hidden /> Lunch today at {place}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
        {dishes
          .map((d) => {
            const price = d.prices[prefs.price];
            return price != null ? `${d.name} €${price.toFixed(2)}` : d.name;
          })
          .join(" · ")}
      </span>
      <span className="text-[13px] font-semibold text-[var(--focus)]">See menu</span>
    </button>
  );
}
