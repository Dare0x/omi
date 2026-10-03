"use client";

import { useEffect, useState } from "react";
import { Legend, RiverChart, fmt, fmtDay } from "@/components/Charts";
import type { RiverReport } from "@/lib/river";

const PHASE_TEXT = {
  normal: "Normal",
  watch: "On watch",
  early: "Early payout rule met",
  flood: "Full payout rule met",
} as const;

// Shows a saved report straight away, then swaps in a fresh one.
export default function LiveGauge({ initial, place, refresh = true }: { initial: RiverReport; place: React.ReactNode; refresh?: boolean }) {
  const [r, setR] = useState(initial);
  const [fresh, setFresh] = useState(!refresh);

  useEffect(() => {
    setR(initial);
    if (!refresh) return;
    let alive = true;
    fetch(`/api/river?lat=${initial.cell.requested.lat}&lon=${initial.cell.requested.lon}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: RiverReport | null) => {
        if (alive && body?.status) {
          setR(body);
          setFresh(true);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [initial, refresh]);

  const s = r.status;
  return (
    <div className="gauge">
      <div className="gauge-top">
        <div className="place">{place}</div>
        <div className="phase" data-phase={s.phase}>
          {PHASE_TEXT[s.phase]}
        </div>
      </div>
      <div className="figures">
        <div className="figure">
          <span className="label">River now{s.latest ? `, ${fmtDay(s.latest.date)}` : ""}</span>
          <span className="value">
            {s.latest ? fmt(s.latest.discharge) : "–"}
            <small>m³/s</small>
          </span>
        </div>
        <div className="figure">
          <span className="label">Forecast high, next {r.rules.earlyLeadDays} days</span>
          <span className="value">
            {s.forecastPeak ? fmt(s.forecastPeak.median) : "–"}
            <small>m³/s</small>
          </span>
        </div>
        <div className="figure" data-tone="warn">
          <span className="label">Warning level (1 in {r.rules.warnReturnYears} years)</span>
          <span className="value">
            {fmt(r.warnLevel)}
            <small>m³/s</small>
          </span>
        </div>
        <div className="figure" data-tone="flood">
          <span className="label">Flood level (1 in {r.rules.floodReturnYears} years)</span>
          <span className="value">
            {fmt(r.floodLevel)}
            <small>m³/s</small>
          </span>
        </div>
      </div>
      <p className="reason">{s.reason}</p>
      <RiverChart days={r.forecast} floodLevel={r.floodLevel} warnLevel={r.warnLevel} today={s.today} />
      <Legend
        items={[
          { label: "River, last 14 days", color: "var(--water)" },
          { label: "Forecast median", color: "var(--water)", dashed: true },
          { label: "Middle half of forecast runs", color: "var(--water)", band: true },
          { label: "Warning level", color: "var(--warn)", dashed: true },
          { label: "Flood level", color: "var(--flood)" },
        ]}
      />
      <p className="small faint">
        {fresh ? "Live" : "Saved"} reading for the river cell at {r.cell.lat}, {r.cell.lon}, computed {new Date(r.computedAt).toUTCString().slice(5, 22)} UTC.
      </p>
    </div>
  );
}
