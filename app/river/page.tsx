"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import LiveGauge from "@/components/LiveGauge";
import OpenFund from "@/components/OpenFund";
import PlaceSearch from "@/components/PlaceSearch";
import { PeaksChart, ReplayChart, fmt, fmtDayYear } from "@/components/Charts";
import type { RiverReport } from "@/lib/river";

export default function RiverPageWrapper() {
  return (
    <Suspense>
      <RiverPage />
    </Suspense>
  );
}

function RiverPage() {
  const params = useSearchParams();
  const lat = params.get("lat");
  const lon = params.get("lon");
  const name = params.get("name");
  const [report, setReport] = useState<RiverReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    if (!lat || !lon) return;
    let alive = true;
    setReport(null);
    setError(null);
    setSecs(0);
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    fetch(`/api/river?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`)
      .then(async (res) => {
        const body = await res.json();
        if (!alive) return;
        if (!res.ok) setError(body.error ?? "Couldn't build a report for this point.");
        else setReport(body as RiverReport);
      })
      .catch(() => alive && setError("Couldn't reach the server. Check your connection and reload."))
      .finally(() => clearInterval(t));
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [lat, lon]);

  if (!lat || !lon) {
    return (
      <main>
        <section className="hero">
          <p className="kicker">Any river on Earth</p>
          <h1>Check a river before you fund it.</h1>
          <p className="lede">
            Type a town. OMI finds the main river channel nearby, sets its flood level from decades of that river&apos;s own record, replays every
            past year against the payout rules and shows the forecast for the next 30 days.
          </p>
        </section>
        <section className="section">
          <PlaceSearch />
        </section>
      </main>
    );
  }

  const label = name ?? `${lat}, ${lon}`;
  return (
    <main>
      <section className="hero">
        <p className="kicker">River report</p>
        <h1 style={{ maxWidth: "22ch" }}>{label}</h1>
        {report && (
          <p className="muted">
            {report.cell.movedKm > 0.5
              ? `Moved ${report.cell.movedKm} km from your point to the main channel (river cell ${report.cell.lat}, ${report.cell.lon}), which carries about ${fmt(report.cell.meanDischarge)} m³/s at the moment.`
              : `River cell ${report.cell.lat}, ${report.cell.lon}, carrying about ${fmt(report.cell.meanDischarge)} m³/s at the moment.`}{" "}
            {report.history.years} years of record, {report.history.firstYear} to {report.history.lastYear}.
          </p>
        )}
      </section>

      {!report && !error && (
        <section className="section">
          <p className="muted">
            Reading {secs > 2 ? "decades of river record and the 30-day forecast" : "the river"}… {secs}s
          </p>
        </section>
      )}
      {error && (
        <section className="section">
          <div className="problem">
            <p>{error}</p>
            <p className="small faint">OMI needs a river with at least 10 years of flow on record within about 10 km of the point.</p>
          </div>
          <PlaceSearch />
        </section>
      )}
      {report && <Report r={report} label={label} />}
    </main>
  );
}

function Report({ r, label }: { r: RiverReport; label: string }) {
  const paid = r.backtest.rows.filter((y) => y.paid);
  const replayYears = r.replays.map((p) => p.year);
  const [year, setYear] = useState(paid.length ? paid[paid.length - 1].year : replayYears[replayYears.length - 1]);
  const replay = r.replays.find((p) => p.year === year);
  const row = r.backtest.rows.find((y) => y.year === year);
  const [homes, setHomes] = useState(200);
  const [cover, setCover] = useState(100);
  const yearly = useMemo(() => homes * cover * r.backtest.fairPremiumShare, [homes, cover, r.backtest.fairPremiumShare]);

  return (
    <>
      <section className="section" aria-labelledby="now">
        <div className="section-head">
          <h2 id="now">Right now</h2>
        </div>
        <LiveGauge initial={r} refresh={false} place={<b>{label}</b>} />
      </section>

      {replay && (
        <section className="section" aria-labelledby="replay">
          <div className="section-head">
            <h2 id="replay">{row?.paid ? `${year}, replayed` : `${year}: a year it would not have paid`}</h2>
            <p>
              {row?.paid
                ? `The warning came on ${fmtDayYear(row.warnDate!)} and the full payout rule was met on ${fmtDayYear(row.floodDate!)}. The river peaked on ${fmtDayYear(row.peakDate)}.`
                : `The river peaked at ${fmt(row?.peak ?? 0)} m³/s on ${row ? fmtDayYear(row.peakDate) : "–"}, below its flood level, so no money would have moved.`}
            </p>
          </div>
          {replayYears.length > 1 && (
            <div className="pager" role="group" aria-label="Year">
              {replayYears.map((y) => (
                <button key={y} type="button" aria-pressed={y === year} onClick={() => setYear(y)}>
                  {y}
                </button>
              ))}
            </div>
          )}
          <ReplayChart replay={replay} row={row} floodLevel={r.floodLevel} warnLevel={r.warnLevel} />
        </section>
      )}

      <section className="section" aria-labelledby="history">
        <div className="section-head">
          <h2 id="history">
            {r.history.years} years: it would have paid {paid.length} {paid.length === 1 ? "time" : "times"}
          </h2>
          <p>
            Flood level {fmt(r.floodLevel)} m³/s (the 1-in-{r.rules.floodReturnYears}-year flow), warning level {fmt(r.warnLevel)} m³/s
            (1-in-{r.rules.warnReturnYears}). Both are fitted to this river&apos;s highest flow in each year.
          </p>
        </div>
        <PeaksChart rows={r.backtest.rows} floodLevel={r.floodLevel} />
        {paid.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Warning</th>
                  <th>Paid in full</th>
                  <th>Peak</th>
                  <th className="num">Peak flow, m³/s</th>
                  <th className="num">Warning to peak</th>
                </tr>
              </thead>
              <tbody>
                {paid.map((y) => (
                  <tr key={y.year} className="paid">
                    <td className="num">{y.year}</td>
                    <td>{y.warnDate ? fmtDayYear(y.warnDate) : "–"}</td>
                    <td>{y.floodDate ? fmtDayYear(y.floodDate) : "–"}</td>
                    <td>{fmtDayYear(y.peakDate)}</td>
                    <td className="num">{fmt(y.peak)}</td>
                    <td className="num">{y.leadDays !== null ? `${y.leadDays} days` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="cost">
        <div className="section-head">
          <h2 id="cost">What covering this river costs</h2>
          <p>
            It would have paid {paid.length} times in {r.backtest.years} years, so the fair yearly cost is{" "}
            {(r.backtest.fairPremiumShare * 100).toFixed(1)}% of the cover, before any margin.
          </p>
        </div>
        <div className="calc">
          <label className="field">
            Households
            <input type="number" min={1} max={500} value={homes} onChange={(e) => setHomes(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} />
          </label>
          <label className="field">
            Cover per household, USDC
            <input type="number" min={1} value={cover} onChange={(e) => setCover(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <div className="figure" style={{ border: 0, padding: 0 }}>
            <span className="label">Fund needed for one bad season</span>
            <span className="value">
              {fmt(homes * cover)}
              <small>USDC</small>
            </span>
          </div>
          <div className="figure" style={{ border: 0, padding: 0 }}>
            <span className="label">Expected payouts per year</span>
            <span className="value">
              {fmt(yearly)}
              <small>USDC</small>
            </span>
          </div>
        </div>
        <p className="small faint">
          Up to 500 households per site, each paid {r.rules.earlyShareBps / 100}% on the forecast and the rest when the river stays over the flood level.
        </p>
        <p>
          <Link href="/fund">See every fund live on Arc →</Link>
        </p>
      </section>

      <section className="section" aria-labelledby="open">
        <div className="section-head">
          <h2 id="open">Open a fund for this river</h2>
        </div>
        <OpenFund r={r} label={label} />
      </section>
    </>
  );
}
