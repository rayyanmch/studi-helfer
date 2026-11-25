"use client";

import { Fragment, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  ArrowDownToLine,
  CalendarDays,
  ChartColumn,
  Folder,
  Layers,
  Mail,
  MapPin,
  Sun,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { AppIcon, TrafficLights } from "../ui";

// Fensterrahmen der App mit Seitenleiste. Die dunkle Markierung gleitet zum aktiven Eintrag,
// wie in der App selbst. Die Oberfläche der App ist englisch, deshalb lang="en".

export type SideKey = "today" | "calendar" | "new" | "courses" | "mail" | "study" | "progress" | "places" | "mensa";

const ITEMS: { key: SideKey; label: string; icon: LucideIcon; count?: number; group?: string }[] = [
  { key: "today", label: "Today", icon: Sun },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "new", label: "New", icon: ArrowDownToLine, count: 5 },
  { key: "courses", label: "Courses", icon: Folder },
  { key: "mail", label: "Mail", icon: Mail, count: 3 },
  { key: "study", label: "Study", icon: Layers, count: 13, group: "Learn" },
  { key: "progress", label: "Progress", icon: ChartColumn },
  { key: "places", label: "Places", icon: MapPin, group: "Campus" },
  { key: "mensa", label: "Mensa", icon: Utensils },
];

export function AppFrame({
  id,
  active,
  note,
  children,
  className = "",
}: {
  id: string;
  active: SideKey;
  note?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div lang="en" className={`flex overflow-hidden bg-bg text-left text-ink ${className}`}>
      <div className="hidden w-[196px] flex-none flex-col gap-0.5 border-r border-line-soft bg-surface px-3 py-4 text-[13px] md:flex">
        <div className="px-1.5 pb-5">
          <TrafficLights size={11} />
        </div>
        <div className="flex items-center gap-2.5 px-1.5 pb-4">
          <AppIcon size={24} />
          <span className="font-semibold">Ordo</span>
        </div>
        {ITEMS.map(({ key, label, icon: Icon, count, group }) => {
          const on = key === active;
          return (
            <Fragment key={key}>
              {group && <div className="px-2.5 pt-3 pb-1 text-xs text-muted">{group}</div>}
              <div className="relative flex h-[30px] items-center gap-2.5 rounded-[8px] px-2.5">
                {on && (
                  <motion.span
                    layoutId={`${id}-side`}
                    className="absolute inset-0 rounded-[8px] bg-accent"
                    transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                  />
                )}
                <Icon
                  aria-hidden
                  size={15}
                  strokeWidth={2}
                  className={`relative transition-colors duration-200 ${on ? "text-on-accent" : "text-muted"}`}
                />
                <span className={`relative transition-colors duration-200 ${on ? "font-semibold text-on-accent" : ""}`}>
                  {label}
                </span>
                {count && (
                  <span className={`tnum relative ml-auto text-xs ${on ? "text-on-accent/70" : "text-muted"}`}>{count}</span>
                )}
              </div>
            </Fragment>
          );
        })}
        {note && <div className="mt-auto px-2.5 pt-4 text-[11.5px] text-muted">{note}</div>}
      </div>
      <div className="relative min-w-0 flex-1">{children}</div>
    </div>
  );
}
