// npm run snapshot — saves full river reports for the featured places to
// data/featured.json, so the site opens instantly and doesn't depend on the
// free data API being quick at the moment a judge visits.
import fs from "node:fs";
import path from "node:path";
import { FEATURED } from "../lib/featured";
import { riverReport, type RiverReport } from "../lib/river";

async function main() {
  const out: Record<string, RiverReport & { site: (typeof FEATURED)[number] }> = {};
  const file = path.join(__dirname, "../data/featured.json");
  if (fs.existsSync(file)) Object.assign(out, JSON.parse(fs.readFileSync(file, "utf8")));
  for (const site of FEATURED) {
    const t0 = Date.now();
    try {
      const r = await riverReport(site.lat, site.lon);
      out[site.slug] = { ...r, site };
      console.log(
        `${site.name}: cell ${r.cell.lat},${r.cell.lon} (moved ${r.cell.movedKm} km), flood level ${r.floodLevel} m3/s, ` +
          `paid in ${r.backtest.rows.filter((y) => y.paid).map((y) => y.year).join(", ") || "no year"}; now ${r.status.phase} (${Date.now() - t0} ms)`
      );
    } catch (e) {
      console.log(`${site.name}: FAILED ${(e as Error).message} (kept the previous copy if any)`);
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out));
  console.log(`Saved ${Object.keys(out).length} places to data/featured.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
