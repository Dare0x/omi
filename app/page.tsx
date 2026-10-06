import WaterHero from "@/components/home/WaterHero";
import Replay2022 from "@/components/home/Replay2022";
import YearsStrip from "@/components/home/YearsStrip";
import RiverWorld, { type WorldSite } from "@/components/home/RiverWorld";
import HowItPays from "@/components/home/HowItPays";
import Proof from "@/components/home/Proof";
import SmoothScroll from "@/components/home/SmoothScroll";
import { HOME_SITE } from "@/lib/featured";
import { savedReport, savedSites } from "@/lib/snapshot";
import "./home.css";

export default function Home() {
  const r = savedReport(HOME_SITE);
  if (!r) {
    return (
      <main className="problem">
        <p>The saved river data is missing. Run npm run snapshot.</p>
      </main>
    );
  }
  const y2022 = r.backtest.rows.find((y) => y.year === 2022);
  const replay = r.replays.find((p) => p.year === 2022);
  const days = (replay?.days ?? []).filter(([d]) => d >= "2022-08-01" && d <= "2022-10-31") as [string, number][];
  const sites: WorldSite[] = savedSites().map((s) => ({
    slug: s.site.slug,
    name: s.site.name,
    country: s.site.country,
    river: s.site.river,
    lat: s.site.lat,
    lon: s.site.lon,
    floodLevel: s.floodLevel,
    paidYears: s.backtest.rows.filter((y) => y.paid).map((y) => y.year),
    years: s.backtest.years,
  }));

  return (
    <main className="home">
      <SmoothScroll />
      <WaterHero initial={r} />
      {y2022?.warnDate && y2022.floodDate && days.length > 0 && (
        <Replay2022
          days={days}
          floodLevel={r.floodLevel}
          warnLevel={r.warnLevel}
          warnDate={y2022.warnDate}
          payDate={y2022.floodDate}
          peakDate={y2022.peakDate}
          households={200}
        />
      )}
      <YearsStrip
        rows={r.backtest.rows.map((y) => ({ year: y.year, peak: y.peak, paid: y.paid }))}
        floodLevel={r.floodLevel}
        fairShare={r.backtest.fairPremiumShare}
      />
      <RiverWorld sites={sites} />
      <HowItPays rules={r.rules} />
      <Proof />
    </main>
  );
}
