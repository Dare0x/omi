// npm run backtest -- <lat> <lon>
// Prints the full river report for one place: where it snapped, the flood
// levels, every past year the payout rules would have fired, and today's status.

import { riverReport } from "../lib/river";

async function main() {
  const [latS, lonS] = process.argv.slice(2);
  const lat = latS ? Number(latS) : 7.8;
  const lon = lonS ? Number(lonS) : 6.74;
  const r = await riverReport(lat, lon);
  const c = r.cell;
  console.log(`Requested ${lat}, ${lon} -> river cell ${c.lat}, ${c.lon} (moved ${c.movedKm} km, ${c.cellsSearched} cells searched, mean flow ${c.meanDischarge} m3/s)`);
  console.log(`History ${r.history.firstYear}-${r.history.lastYear} (${r.history.years} years). Levels m3/s:`, r.history.levels);
  console.log(`Warning level (1-in-${r.rules.warnReturnYears}): ${r.warnLevel}   Flood level (1-in-${r.rules.floodReturnYears}): ${r.floodLevel}`);
  console.log("Years the full payout would have fired:");
  for (const y of r.backtest.rows.filter((y) => y.paid)) {
    console.log(`  ${y.year}: warning ${y.warnDate}, payout ${y.floodDate}, peak ${y.peak} on ${y.peakDate} (warning ${y.leadDays} days before peak)`);
  }
  console.log(`Events ${r.backtest.events}/${r.backtest.years} years -> fair premium ${(r.backtest.fairPremiumShare * 100).toFixed(1)}% of cover per year`);
  console.log(`Status ${r.status.phase}: ${r.status.reason}`);
  console.log(`Latest`, r.status.latest, `forecast peak`, r.status.forecastPeak);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
