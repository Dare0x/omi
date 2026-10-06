import RiverClient from "@/components/RiverClient";
import type { WorldSite } from "@/components/home/RiverWorld";
import { savedSites } from "@/lib/snapshot";
import "../home.css";

export default function RiverPage() {
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
  return <RiverClient sites={sites} />;
}
