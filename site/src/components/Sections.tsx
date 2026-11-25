import { Layers, Lock, Mail, MapPin, Utensils, type LucideIcon } from "lucide-react";
import { AppIcon, DownloadButtons, H2, Lead, Section, tone } from "./ui";
import type { Tone } from "@/lib/week";

const EVERYDAY: { icon: LucideIcon; title: string; text: string; tone: Tone }[] = [
  { icon: Mail, title: "Mail", text: "Uni mail and Gmail in one inbox. Mails from your lecturers show their course.", tone: "blue" },
  { icon: Utensils, title: "Mensa", text: "Today's menu with photos. Vegan and vegetarian at a glance.", tone: "orange" },
  { icon: Layers, title: "Study", text: "Flashcards and one-page study sheets made from your own slides.", tone: "green" },
  { icon: MapPin, title: "Places", text: "Libraries that are open right now and the walk to your lecture hall.", tone: "plum" },
];

export function Everyday() {
  return (
    <Section className="pt-[200px]">
      <H2 className="max-w-[14em] text-[clamp(32px,3.6vw,48px)]">And the things you check ten times a day.</H2>
      <div className="mt-12 grid gap-x-12 gap-y-11 sm:grid-cols-2 lg:grid-cols-4">
        {EVERYDAY.map(({ icon: Icon, title, text, tone: t }) => (
          <div key={title} className="flex flex-col gap-3 border-t border-line pt-6" style={tone(t)}>
            <span className="grid size-11 place-items-center rounded-[12px]" style={{ background: "var(--soft)" }}>
              <Icon aria-hidden size={22} strokeWidth={1.8} style={{ color: "var(--ink-c)" }} />
            </span>
            <span className="text-[19px] font-semibold">{title}</span>
            <span className="text-base leading-[1.5] text-muted">{text}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

const STEPS: { title: string; text: string; tone: Tone }[] = [
  {
    title: "Sign in with your uni account.",
    text: "The same login as ILIAS or Moodle. Your password goes into your Mac's Keychain and nowhere else.",
    tone: "blue",
  },
  {
    title: "Tap your courses.",
    text: "Ordo suggests this semester's courses. Lecture, exercise and your group become one course.",
    tone: "orange",
  },
  {
    title: "That's it.",
    text: "Files and deadlines stay up to date on their own. The first download tells you how long it will take.",
    tone: "green",
  },
];

export function Setup() {
  return (
    <Section id="setup" className="pt-[200px]">
      <H2 className="max-w-[12em]">Set up once. Then forget about it.</H2>
      <ol className="m-0 mt-14 grid list-none gap-10 p-0 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-3 border-t-2 pt-6" style={{ borderColor: `var(--c-${s.tone})` }}>
            <span className="tnum text-[15px] font-semibold" style={{ color: `var(--c-${s.tone})` }}>
              {i + 1}
            </span>
            <span className="text-[22px] font-semibold tracking-[-0.01em]">{s.title}</span>
            <span className="text-[17px] leading-[1.5] text-muted">{s.text}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function Privacy() {
  return (
    <Section id="privacy" className="pt-[200px]">
      <Lock aria-hidden size={30} strokeWidth={1.6} className="text-muted" />
      <p className="m-0 mt-7 max-w-[22em] text-[clamp(28px,3.6vw,46px)] leading-[1.15] font-medium tracking-[-0.03em] text-balance">
        Your password stays on your Mac.{" "}
        <span className="text-muted">
          Deadlines are found without AI. Files only leave your Mac when you ask for study help.
        </span>
      </p>
    </Section>
  );
}

export function Download() {
  return (
    <Section id="download" className="flex flex-col items-center pt-[220px] pb-40 text-center">
      <AppIcon size={124} className="shadow-[0_24px_48px_-20px_rgb(var(--shadow-color)/0.5)]" />
      <h2 className="m-0 mt-9 text-[clamp(44px,6vw,80px)] leading-none font-medium tracking-[-0.045em]">Ordo for Mac</h2>
      <Lead className="mt-5 max-w-[28em] text-[20px]">
        Sign in with your uni account, tap your courses, done. Ordo keeps itself up to date.
      </Lead>
      <div className="mt-9">
        <DownloadButtons align="center" />
      </div>
      <p className="m-0 mt-4 text-sm text-muted">For Macs with Apple silicon. Works with ILIAS and Moodle.</p>
    </Section>
  );
}

export function Footer() {
  return (
    <footer className="mx-auto max-w-[1160px] px-6 sm:px-8">
      <div className="flex flex-wrap items-center gap-6 border-t border-line pt-7 pb-10 text-sm text-muted">
      <span>Made by two students in Cologne.</span>
      <nav aria-label="Legal" className="ml-auto flex gap-6">
        <a href="#" className="text-muted hover:text-ink">
          Privacy
        </a>
        <a href="#" className="text-muted hover:text-ink">
          Imprint
        </a>
        <a href="#" className="text-muted hover:text-ink">
          Contact
        </a>
      </nav>
      </div>
    </footer>
  );
}
