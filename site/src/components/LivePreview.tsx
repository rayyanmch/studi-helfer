"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { AppFrame, type SideKey } from "./app/AppFrame";
import { TodayScreen, type Done } from "./app/TodayScreen";
import { CalendarScreen, FilesScreen, MailScreen, MensaScreen, StudyScreen } from "./app/Screens";
import { H2, Section } from "./ui";
import { useNowMinutes, useReducedMotion, useToday } from "@/lib/hooks";
import { dict, type Lang } from "@/lib/i18n";

// Live-Vorschau: Tabs schalten das App-Fenster um und laufen von selbst weiter
// (Strich unter dem Tab = Zeit bis zum nächsten). Klick hält an; Maus über dem Fenster
// oder Fenster außer Sicht pausiert. Bei „Bewegung reduzieren“ kein Weiterlaufen.

const TABS = ["files", "deadlines", "calendar", "mail", "mensa", "study"] as const;
type Tab = (typeof TABS)[number];
const SIDE: Record<Tab, SideKey> = {
  files: "new",
  deadlines: "today",
  calendar: "calendar",
  mail: "mail",
  mensa: "mensa",
  study: "study",
};

export function LivePreview({ lang }: { lang: Lang }) {
  const t = dict[lang].live;
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(true);
  const [hover, setHover] = useState(false);
  const [done, setDone] = useState<Done>({ sheet5: true });
  const frameRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const inView = useInView(frameRef, { amount: 0.35 });
  const reduced = useReducedMotion();
  const today = useToday();
  const now = useNowMinutes();

  const tab = TABS[index];
  const playing = auto && !reduced;
  const paused = hover || !inView;

  const pick = (i: number) => {
    setIndex(i);
    setAuto(false);
  };
  const onKey = (e: KeyboardEvent) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (index + dir + TABS.length) % TABS.length;
    pick(next);
    tabRefs.current[next]?.focus();
  };

  const screen = {
    files: <FilesScreen />,
    deadlines: (
      <TodayScreen today={today} done={done} onToggle={(id) => setDone((d) => ({ ...d, [id]: !d[id] }))} />
    ),
    calendar: <CalendarScreen today={today} now={now} />,
    mail: <MailScreen />,
    mensa: <MensaScreen />,
    study: <StudyScreen />,
  }[tab];

  return (
    <Section id="app" className="flex flex-col items-center pt-[170px] text-center">
      <H2 className="max-w-[14em] text-[clamp(34px,4vw,52px)]">{t.title}</H2>
      <div
        role="tablist"
        aria-label={t.tabsLabel}
        onKeyDown={onKey}
        className="mt-11 inline-flex max-w-full flex-wrap justify-center gap-0.5 rounded-[22px] bg-sunken p-1"
      >
        {TABS.map((k, i) => {
          const on = i === index;
          return (
            <button
              key={k}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={`tab-${k}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls="app-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => pick(i)}
              className={`press relative h-[38px] cursor-pointer overflow-hidden rounded-full px-[18px] text-sm font-semibold transition-colors duration-200 ${on ? "text-ink" : "text-muted hover:text-ink"}`}
            >
              {on && (
                <motion.span
                  layoutId="live-tab"
                  className="absolute inset-0 rounded-full bg-surface shadow-[0_1px_3px_rgb(var(--shadow-color)/0.16)]"
                  transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                />
              )}
              <span className="relative">{t.tabs[k]}</span>
              {on && playing && (
                <span
                  key={index}
                  aria-hidden
                  className="prog absolute right-4 bottom-[5px] left-4 h-[2px] rounded-full"
                  style={{ background: "var(--c-blue)", animationPlayState: paused ? "paused" : "running" }}
                  onAnimationEnd={() => setIndex((x) => (x + 1) % TABS.length)}
                />
              )}
            </button>
          );
        })}
      </div>

      <div
        ref={frameRef}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        className="mt-7 w-full"
      >
        <AppFrame
          id="live"
          active={SIDE[tab]}
          note={t.sample}
          className="min-h-[560px] rounded-[14px] shadow-[0_0_0_1px_var(--ring),0_30px_70px_-30px_rgb(var(--shadow-color)/0.35)] md:h-[560px]"
        >
          <div role="tabpanel" id="app-panel" aria-labelledby={`tab-${tab}`} className="h-full overflow-hidden p-5 sm:px-8 sm:py-7">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                className="h-full"
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              >
                {screen}
              </motion.div>
            </AnimatePresence>
          </div>
        </AppFrame>
      </div>
    </Section>
  );
}
