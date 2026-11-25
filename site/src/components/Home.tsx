import { Header } from "./Header";
import { Hero } from "./Hero";
import { LivePreview } from "./LivePreview";
import { SortingStage } from "./SortingStage";
import { FinePrint } from "./FinePrint";
import { Reminders } from "./Reminders";
import { StopDoing } from "./StopDoing";
import { LangHint } from "./LangHint";
import { Download, Footer, Privacy, Setup } from "./Sections";
import { Section } from "./ui";
import type { Lang } from "@/lib/i18n";

// Die ganze Seite, in der jeweiligen Sprache.
export function Home({ lang }: { lang: Lang }) {
  return (
    <>
      <Header lang={lang} />
      <main>
        <Hero lang={lang} />
        <LivePreview lang={lang} />
        <SortingStage lang={lang} />
        <Section id="deadlines" className="pt-[120px]">
          <FinePrint lang={lang} />
        </Section>
        <Reminders lang={lang} />
        <StopDoing lang={lang} />
        <Setup lang={lang} />
        <Privacy lang={lang} />
        <Download lang={lang} />
      </main>
      <Footer lang={lang} />
      {lang === "en" && <LangHint />}
    </>
  );
}
