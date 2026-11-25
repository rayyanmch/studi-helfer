import { Header } from "@/components/Header";
import { RegisterTabs } from "@/components/RegisterTabs";
import { Hero } from "@/components/Hero";
import { SortingStage } from "@/components/SortingStage";
import { FinePrint } from "@/components/FinePrint";
import { WeekWindow } from "@/components/WeekWindow";
import { Reminders } from "@/components/Reminders";
import { StopDoing } from "@/components/StopDoing";
import { Download, Everyday, Footer, Privacy, Setup } from "@/components/Sections";
import { Section } from "@/components/ui";

export default function Home() {
  return (
    <>
      <Header />
      <RegisterTabs />
      <main>
        <Hero />
        <SortingStage />
        <Section id="deadlines" className="pt-[120px]">
          <FinePrint />
          <WeekWindow />
        </Section>
        <Reminders />
        <div id="more">
          <Everyday />
          <StopDoing />
        </div>
        <Setup />
        <Privacy />
        <Download />
      </main>
      <Footer />
    </>
  );
}
