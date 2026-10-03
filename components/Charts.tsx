// Hand-drawn SVG charts. Every mark is placed with one linear scale per axis,
// and every label names a value the chart actually reaches.

import type { ForecastDay, Replay, YearRow } from "@/lib/river";

export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
export const fmtDay = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export const fmtDayYear = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function niceStep(raw: number) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

function yAxis(maxValue: number, count = 4) {
  const step = niceStep(maxValue / count);
  const max = Math.ceil(maxValue / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);
  return { max, ticks };
}

const W = 1000;

// Keeps right-hand line labels at least `gap` px apart.
function spread(ys: number[], gap = 14) {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k++) {
    if (order[k].y - order[k - 1].y < gap) order[k].y = order[k - 1].y + gap;
  }
  const out = [...ys];
  for (const o of order) out[o.i] = o.y;
  return out;
}

// ---------------------------------------------------------------------------

export function RiverChart({
  days,
  floodLevel,
  warnLevel,
  today,
}: {
  days: ForecastDay[];
  floodLevel: number;
  warnLevel: number;
  today: string;
}) {
  const H = 320;
  const m = { l: 64, r: 150, t: 22, b: 34 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const values = days.flatMap((d) => [d.observed, d.median, d.p75]).filter((v): v is number => v !== null);
  const { max, ticks } = yAxis(Math.max(floodLevel * 1.08, ...values));
  const x = (i: number) => m.l + (days.length <= 1 ? 0 : (i / (days.length - 1)) * iw);
  const y = (v: number) => m.t + ih - (v / max) * ih;

  const pastIdx = days.map((d, i) => (d.observed !== null ? i : -1)).filter((i) => i >= 0);
  const futIdx = days.map((d, i) => (d.median !== null ? i : -1)).filter((i) => i >= 0);
  const lastPast = pastIdx.length ? pastIdx[pastIdx.length - 1] : -1;
  const observed = pastIdx.map((i) => `${x(i)},${y(days[i].observed as number)}`).join(" ");
  const medianPts = [
    ...(lastPast >= 0 ? [`${x(lastPast)},${y(days[lastPast].observed as number)}`] : []),
    ...futIdx.map((i) => `${x(i)},${y(days[i].median as number)}`),
  ].join(" ");
  const band =
    futIdx.length > 0
      ? [
          ...futIdx.map((i) => `${x(i)},${y((days[i].p75 ?? days[i].median) as number)}`),
          ...[...futIdx].reverse().map((i) => `${x(i)},${y((days[i].p25 ?? days[i].median) as number)}`),
        ].join(" ")
      : "";
  const todayIdx = Math.max(0, days.findIndex((d) => d.date >= today));
  const [floodLabelY, warnLabelY] = spread([y(floodLevel), y(warnLevel)]);

  const xLabels = [0, todayIdx, days.length - 1].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="River flow for the last two weeks and the 30-day forecast, against the warning and flood levels">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={m.l + iw} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={m.l - 8} y={y(t) + 4} textAnchor="end">
              {fmt(t)}
            </text>
          </g>
        ))}
        {band && <polygon points={band} fill="var(--water-band)" />}
        <line x1={m.l} x2={m.l + iw} y1={y(warnLevel)} y2={y(warnLevel)} stroke="var(--warn)" strokeDasharray="6 5" />
        <line x1={m.l} x2={m.l + iw} y1={y(floodLevel)} y2={y(floodLevel)} stroke="var(--flood)" strokeWidth={1.5} />
        <text x={m.l + iw + 8} y={warnLabelY + 4} style={{ fill: "var(--warn)" }}>
          Warning {fmt(warnLevel)}
        </text>
        <text x={m.l + iw + 8} y={floodLabelY + 4} style={{ fill: "var(--flood)" }}>
          Flood level {fmt(floodLevel)}
        </text>
        <line x1={x(todayIdx)} x2={x(todayIdx)} y1={m.t} y2={m.t + ih} stroke="var(--line-2)" />
        <text x={x(todayIdx) + 6} y={m.t + 10}>
          today
        </text>
        {observed && <polyline points={observed} fill="none" stroke="var(--water)" strokeWidth={2.2} />}
        {futIdx.length > 0 && <polyline points={medianPts} fill="none" stroke="var(--water)" strokeWidth={2} strokeDasharray="5 4" />}
        {xLabels.map((i, k) => (
          <text key={i} x={x(i)} y={H - 10} textAnchor={k === 0 ? "start" : i === days.length - 1 ? "end" : "middle"}>
            {fmtDay(days[i].date)}
          </text>
        ))}
        <text x={14} y={m.t + ih / 2} transform={`rotate(-90 14 ${m.t + ih / 2})`} textAnchor="middle">
          m³/s
        </text>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ReplayChart({ replay, row, floodLevel, warnLevel }: { replay: Replay; row?: YearRow; floodLevel: number; warnLevel: number }) {
  const H = 330;
  const m = { l: 64, r: 150, t: 54, b: 34 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const days = replay.days;
  const t0 = Date.parse(days[0][0]);
  const t1 = Date.parse(days[days.length - 1][0]);
  const x = (d: string) => m.l + ((Date.parse(d) - t0) / (t1 - t0)) * iw;
  const { max, ticks } = yAxis(Math.max(floodLevel * 1.08, ...days.map((d) => d[1])));
  const y = (v: number) => m.t + ih - (v / max) * ih;
  const line = days.map(([d, q]) => `${x(d)},${y(q)}`).join(" ");

  const months: string[] = [];
  for (const [d] of days) if (d.endsWith("-01")) months.push(d);

  const marks: { date: string; label: string; color: string }[] = [];
  if (row?.warnDate) marks.push({ date: row.warnDate, label: `Warning ${fmtDay(row.warnDate)}`, color: "var(--warn)" });
  if (row?.floodDate) marks.push({ date: row.floodDate, label: `Paid in full ${fmtDay(row.floodDate)}`, color: "var(--paid)" });
  if (row) marks.push({ date: row.peakDate, label: `Peak ${fmtDay(row.peakDate)}`, color: "var(--flood)" });
  marks.sort((a, b) => a.date.localeCompare(b.date));
  // Labels sit in lanes above the plot so close dates never overlap.
  const lanes = marks.map((mk, i) => {
    const prev = marks[i - 1];
    return prev && x(mk.date) - x(prev.date) < 150 ? i % 3 : 0;
  });
  const [floodLabelY, warnLabelY] = spread([y(floodLevel), y(warnLevel)]);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`River flow from June to December ${replay.year}, with the dates the warning, payout and peak happened`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={m.l + iw} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={m.l - 8} y={y(t) + 4} textAnchor="end">
              {fmt(t)}
            </text>
          </g>
        ))}
        <line x1={m.l} x2={m.l + iw} y1={y(warnLevel)} y2={y(warnLevel)} stroke="var(--warn)" strokeDasharray="6 5" />
        <line x1={m.l} x2={m.l + iw} y1={y(floodLevel)} y2={y(floodLevel)} stroke="var(--flood)" strokeWidth={1.5} />
        <text x={m.l + iw + 8} y={warnLabelY + 4} style={{ fill: "var(--warn)" }}>
          Warning {fmt(warnLevel)}
        </text>
        <text x={m.l + iw + 8} y={floodLabelY + 4} style={{ fill: "var(--flood)" }}>
          Flood level {fmt(floodLevel)}
        </text>
        <polyline points={line} fill="none" stroke="var(--water)" strokeWidth={2.2} />
        {marks.map((mk, i) => (
          <g key={mk.label}>
            <line x1={x(mk.date)} x2={x(mk.date)} y1={12 + lanes[i] * 14} y2={m.t + ih} stroke={mk.color} strokeDasharray="2 3" />
            <text x={x(mk.date) + 5} y={14 + lanes[i] * 14 + 4} style={{ fill: mk.color }}>
              {mk.label}
            </text>
          </g>
        ))}
        {months.map((d) => (
          <text key={d} x={x(d)} y={H - 10} textAnchor="middle">
            {new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function PeaksChart({ rows, floodLevel }: { rows: YearRow[]; floodLevel: number }) {
  const H = 260;
  const m = { l: 64, r: 150, t: 26, b: 34 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const { max, ticks } = yAxis(Math.max(floodLevel * 1.08, ...rows.map((r) => r.peak)));
  const y = (v: number) => m.t + ih - (v / max) * ih;
  const slot = iw / rows.length;
  const bw = Math.max(4, slot * 0.62);
  const x = (i: number) => m.l + i * slot + (slot - bw) / 2;
  const every = Math.ceil(rows.length / 8);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="The river's highest flow in each year, against its flood level; years that would have paid are marked">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={m.l + iw} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={m.l - 8} y={y(t) + 4} textAnchor="end">
              {fmt(t)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => (
          <g key={r.year}>
            <rect x={x(i)} y={y(r.peak)} width={bw} height={m.t + ih - y(r.peak)} fill={r.paid ? "var(--paid)" : "var(--line-2)"} />
            {r.paid && (
              <text x={x(i) + bw / 2} y={y(r.peak) - 6} textAnchor="middle" style={{ fill: "var(--paid)" }}>
                {r.year}
              </text>
            )}
            {i % every === 0 && (
              <text x={x(i) + bw / 2} y={H - 10} textAnchor="middle">
                {r.year}
              </text>
            )}
          </g>
        ))}
        <line x1={m.l} x2={m.l + iw} y1={y(floodLevel)} y2={y(floodLevel)} stroke="var(--flood)" strokeWidth={1.5} />
        <text x={m.l + iw + 8} y={y(floodLevel) + 4} style={{ fill: "var(--flood)" }}>
          Flood level {fmt(floodLevel)}
        </text>
      </svg>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; band?: boolean; dashed?: boolean }[] }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span key={it.label}>
          <i
            className={it.band ? "band" : undefined}
            style={
              {
                "--c": it.color,
                ...(it.dashed ? { background: `repeating-linear-gradient(90deg, ${it.color} 0 5px, transparent 5px 9px)` } : {}),
              } as React.CSSProperties
            }
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}
