import featured from "@/data/featured.json";
import { FEATURED, type FeaturedSite } from "@/lib/featured";
import type { RiverReport } from "@/lib/river";

export type SavedReport = RiverReport & { site: FeaturedSite };

const SAVED = featured as unknown as Record<string, SavedReport>;

export function savedReport(slug: string): SavedReport | null {
  return SAVED[slug] ?? null;
}

export function savedSites(): SavedReport[] {
  return FEATURED.map((s) => SAVED[s.slug]).filter((r): r is SavedReport => !!r);
}
