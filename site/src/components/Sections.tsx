import Link from "next/link";
import { Layers, Lock, Mail, MapPin, Utensils, type LucideIcon } from "lucide-react";
import { AppIcon, DownloadButtons, H2, Lead, Section, tone } from "./ui";
import { LangLink } from "./LangHint";
import { dict, type Lang } from "@/lib/i18n";
import type { Tone } from "@/lib/week";

const EVERYDAY: { icon: LucideIcon; tone: Tone }[] = [
  { icon: Mail, tone: "blue" },
  { icon: Utensils, tone: "orange" },
  { icon: Layers, tone: "green" },
  { icon: MapPin, tone: "plum" },
];

export function Everyday({ lang }: { lang: Lang }) {
  const t = dict[lang].everyday;
  return (
    <Section className="pt-[200px]">
      <H2 className="max-w-[14em] text-[clamp(32px,3.6vw,48px)]">{t.title}</H2>
      <div className="mt-12 grid gap-x-12 gap-y-11 sm:grid-cols-2 lg:grid-cols-4">
        {t.items.map((item, i) => {
          const { icon: Icon, tone: c } = EVERYDAY[i];
          return (
            <div key={item.title} className="flex flex-col gap-3 border-t border-line pt-6" style={tone(c)}>
              <span className="grid size-11 place-items-center rounded-[12px]" style={{ background: "var(--soft)" }}>
                <Icon aria-hidden size={22} strokeWidth={1.8} style={{ color: "var(--ink-c)" }} />
              </span>
              <span className="text-[19px] font-semibold">{item.title}</span>
              <span className="text-base leading-[1.5] text-muted">{item.text}</span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

const STEP_TONES: Tone[] = ["blue", "orange", "green"];

export function Setup({ lang }: { lang: Lang }) {
  const t = dict[lang].setup;
  return (
    <Section id="setup" className="pt-[200px]">
      <H2 className="max-w-[12em]">{t.title}</H2>
      <ol className="m-0 mt-14 grid list-none gap-10 p-0 md:grid-cols-3">
        {t.steps.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-3 border-t-2 pt-6" style={{ borderColor: `var(--c-${STEP_TONES[i]})` }}>
            <span className="tnum text-[15px] font-semibold" style={{ color: `var(--c-${STEP_TONES[i]})` }}>
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

export function Privacy({ lang }: { lang: Lang }) {
  const t = dict[lang].privacy;
  return (
    <Section id="privacy" className="pt-[200px]">
      <Lock aria-hidden size={30} strokeWidth={1.6} className="text-muted" />
      <p className="m-0 mt-7 max-w-[22em] text-[clamp(28px,3.6vw,46px)] leading-[1.15] font-medium tracking-[-0.03em] text-balance">
        {t.strong} <span className="text-muted">{t.rest}</span>
      </p>
    </Section>
  );
}

export function Download({ lang }: { lang: Lang }) {
  const t = dict[lang].download;
  return (
    <Section id="download" className="flex flex-col items-center pt-[220px] pb-40 text-center">
      <AppIcon size={124} className="shadow-[0_24px_48px_-20px_rgb(var(--shadow-color)/0.5)]" />
      <h2 className="m-0 mt-9 text-[clamp(44px,6vw,80px)] leading-none font-medium tracking-[-0.045em]">{t.title}</h2>
      <Lead className="mt-5 max-w-[28em] text-[20px]">{t.lead}</Lead>
      <div className="mt-9">
        <DownloadButtons lang={lang} align="center" />
      </div>
      <p className="m-0 mt-4 text-sm text-muted">{t.note}</p>
    </Section>
  );
}

export function Footer({ lang }: { lang: Lang }) {
  const t = dict[lang].footer;
  return (
    <footer className="mx-auto max-w-[1160px] px-6 sm:px-8">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-7 pb-10 text-sm text-muted">
        <span>{t.made}</span>
        <nav aria-label="Legal" className="ml-auto flex flex-wrap gap-6">
          <Link href="#" className="text-muted hover:text-ink">
            {t.privacy}
          </Link>
          <Link href="#" className="text-muted hover:text-ink">
            {t.imprint}
          </Link>
          <Link href="#" className="text-muted hover:text-ink">
            {t.contact}
          </Link>
          <LangLink lang={lang} />
        </nav>
      </div>
    </footer>
  );
}
