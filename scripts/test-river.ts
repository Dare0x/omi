// River engine tests on synthetic data (offline). Run: npm run test:river
import assert from "node:assert/strict";
import { RULES, annualPeaks, backtest, liveStatus, returnLevels, setFetcher, snapToRiver, type DailySeries, type ForecastDay } from "../lib/river";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`PASS  ${name}`);
}

// A synthetic river: a seasonal wave each year, with a big flood in two years.
function series(years: number[], bigYears: Record<number, number>): DailySeries {
  const time: string[] = [];
  const q: (number | null)[] = [];
  for (const y of years) {
    for (let d = 0; d < 365; d++) {
      const date = new Date(Date.UTC(y, 0, 1 + d)).toISOString().slice(0, 10);
      const base = 5000 + 15000 * Math.exp(-(((d - 260) / 25) ** 2)); // peak around 17 Sep
      const extra = bigYears[y] ? bigYears[y] * Math.exp(-(((d - 265) / 6) ** 2)) : 0;
      time.push(date);
      q.push(Math.round(base + extra + (y % 7) * 150));
    }
  }
  return { time, q };
}

async function main() {
  const years = Array.from({ length: 30 }, (_, i) => 1996 + i);
  const s = series(years, { 2012: 12000, 2022: 11000 });

  await check("annual peaks: one per full year, on the right day", () => {
    const p = annualPeaks(s);
    assert.equal(p.length, 30);
    const y22 = p.find((x) => x.year === 2022)!;
    assert.ok(y22.peak > 30000, `2022 peak ${y22.peak}`);
    assert.equal(y22.date.slice(0, 7), "2022-09");
  });

  await check("return levels rise with the return period", () => {
    const r = returnLevels(annualPeaks(s));
    assert.ok(r.levels["2"] < r.levels["5"] && r.levels["5"] < r.levels["10"] && r.levels["10"] < r.levels["25"]);
    assert.equal(r.years, 30);
    assert.equal(r.firstYear, 1996);
  });

  await check("too little history is refused rather than guessed", () => {
    assert.throws(() => returnLevels([{ year: 2020, peak: 1 }]), /at least 10/);
  });

  await check("backtest pays exactly in the big-flood years, after the warning", () => {
    const r = returnLevels(annualPeaks(s));
    const b = backtest(s, r.levels["10"], r.levels["5"]);
    const paid = b.rows.filter((x) => x.paid).map((x) => x.year);
    assert.deepEqual(paid, [2012, 2022]);
    for (const row of b.rows.filter((x) => x.paid)) {
      assert.ok(row.warnDate! <= row.floodDate!, "warning comes first");
      assert.ok(row.leadDays! >= 0);
    }
    assert.equal(b.events, 2);
    assert.ok(Math.abs(b.fairPremiumShare - 2 / 30) < 1e-9);
  });

  await check("the full-payout rule needs consecutive days", () => {
    // A flat year with three single-day spikes over the level, then a two-day spike.
    const year = series([2020], {});
    const q = year.q.map(() => 1000);
    q[100] = 5000;
    q[102] = 5000;
    q[104] = 5000;
    const spiky: DailySeries = { time: year.time, q };
    assert.equal(backtest(spiky, 4000, 3000).rows[0].paid, false, "single days never pay");
    q[200] = 5000;
    q[201] = 5000;
    const b = backtest({ time: year.time, q }, 4000, 3000);
    assert.equal(b.rows[0].paid, true);
    assert.equal(b.rows[0].floodDate, year.time[201]);
    assert.equal(b.rows[0].warnDate, year.time[100]);
  });

  const fc = (obs: number[], med: number[], p75?: number[]): ForecastDay[] => {
    const days: ForecastDay[] = [];
    const t0 = Date.parse("2026-10-03");
    obs.forEach((v, i) =>
      days.push({ date: new Date(t0 - (obs.length - 1 - i) * 86_400_000).toISOString().slice(0, 10), observed: v, median: null, p25: null, p75: null, min: null, max: null })
    );
    med.forEach((v, i) =>
      days.push({ date: new Date(t0 + (i + 1) * 86_400_000).toISOString().slice(0, 10), observed: null, median: v, p25: v, p75: p75?.[i] ?? v, min: v, max: v })
    );
    return days;
  };

  await check("status: normal, watch, early and flood", () => {
    const today = "2026-10-03";
    assert.equal(liveStatus(fc([100, 110], [120, 130]), 1000, 800, today).phase, "normal");
    assert.equal(liveStatus(fc([100, 810], [700, 700]), 1000, 800, today).phase, "watch");
    assert.equal(liveStatus(fc([100, 110], [500, 600], [500, 850]), 1000, 800, today).phase, "watch");
    const early = liveStatus(fc([100, 900], [950, 1001, 1100]), 1000, 800, today);
    assert.equal(early.phase, "early");
    assert.equal(early.daysToFloodLevel, 2);
    const flood = liveStatus(fc([100, 1000, 1200], [900]), 1000, 800, today);
    assert.equal(flood.phase, "flood");
    assert.equal(flood.aboveStreak, 2);
  });

  await check(`status ignores a forecast beyond ${RULES.earlyLeadDays} days`, () => {
    const med = Array.from({ length: 20 }, (_, i) => (i === 18 ? 5000 : 100));
    assert.equal(liveStatus(fc([100], med), 1000, 800, "2026-10-03").phase, "normal");
  });

  await check("snapping keeps the cell that carries the most water", async () => {
    setFetcher(async (url: string) => {
      const lat = new URL(url).searchParams.get("latitude")!.split(",").map(Number);
      const lon = new URL(url).searchParams.get("longitude")!.split(",").map(Number);
      return lat.map((la, i) => ({
        latitude: la,
        longitude: lon[i],
        daily: { time: Array(60).fill("2026-01-01"), river_discharge: Array(60).fill(la === 7.75 && lon[i] === 6.7 ? 5000 : 40) },
      }));
    });
    const r = await snapToRiver(7.8, 6.75);
    assert.equal(r.lat, 7.75);
    assert.equal(r.lon, 6.7);
    assert.equal(r.meanDischarge, 5000);
    assert.ok(r.movedKm > 5 && r.movedKm < 10, `moved ${r.movedKm} km`);
    assert.equal(r.cellsSearched, 25);
  });

  await check("snapping fails clearly where there is no river", async () => {
    setFetcher(async () => [{ latitude: 0, longitude: 0, daily: { time: [], river_discharge: [] } }]);
    await assert.rejects(snapToRiver(0, 0), /No river/);
  });

  console.log(`\nAll ${passed} river engine tests passed.`);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
