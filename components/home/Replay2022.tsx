"use client";

import { useEffect, useMemo, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

type Day = [string, number];
interface Props {
  days: Day[]; // 1 Aug – 31 Oct 2022, recorded flow at Lokoja
  floodLevel: number;
  warnLevel: number;
  warnDate: string;
  payDate: string;
  peakDate: string;
  households: number;
}

const W = 1000, H = 420, PADL = 0, PADB = 34;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const dayLabel = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

// Scroll position → day. Slow through the days that matter, quick through the rest.
function dayAt(p: number, k: { warn: number; over: number; pay: number; peak: number; last: number }) {
  const P = [0, 0.14, 0.27, 0.42, 0.5, 0.6, 0.74, 0.82, 1];
  const D = [0, k.warn - 9, k.warn, k.over, k.pay, k.pay + 0.6, k.peak, k.peak + 0.4, k.last];
  for (let i = 0; i + 1 < P.length; i++)
    if (p <= P[i + 1]) return D[i] + ((p - P[i]) / (P[i + 1] - P[i])) * (D[i + 1] - D[i]);
  return k.last;
}

export default function Replay2022({ days, floodLevel, warnLevel, warnDate, payDate, peakDate, households }: Props) {
  const root = useRef<HTMLElement>(null);
  const idx = (d: string) => days.findIndex((x) => x[0] === d);
  const k = useMemo(() => {
    const pay = idx(payDate);
    let over = pay;
    while (over > 0 && days[over - 1][1] >= floodLevel) over--;
    return { warn: idx(warnDate), over, pay, peak: idx(peakDate), last: days.length - 1 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, floodLevel, warnDate, payDate, peakDate]);
  const vmax = Math.ceil((Math.max(...days.map((d) => d[1])) * 1.1) / 5000) * 5000;
  const X = (i: number) => PADL + (i * (W - PADL)) / (days.length - 1);
  const Y = (v: number) => H - PADB - (v / vmax) * (H - PADB - 10);
  const line = days.map((d, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(d[1]).toFixed(1)}`).join(" ");
  const area = `${line} L${X(days.length - 1)} ${H - PADB} L0 ${H - PADB} Z`;
  const peak = days[k.peak][1];
  const chapters = [
    { at: 0, k: "August 2022", t: "The Niger is rising, the way it does every wet season." },
    { at: k.warn - 9, k: dayLabel(days[k.warn - 9][0]), t: `It climbs past ${fmt(20000)} m³/s, with the Benue joining it at Lokoja.` },
    { at: k.warn, k: dayLabel(warnDate), t: "It passes its warning level. The fund is on watch." },
    { at: k.over, k: dayLabel(days[k.over][0]), t: "Over the flood level. Day one of two." },
    { at: k.pay, k: dayLabel(payDate), t: "Day two. The contract pays every household in full, in one transaction.", paid: true },
    { at: k.peak, k: dayLabel(peakDate), t: `The flood peaks at ${fmt(peak)} m³/s. The money arrived ${k.peak - k.pay} days ago.`, flood: true },
    { at: k.peak + 6, k: "After", t: "Aid usually arrives weeks after the water. This would have arrived first." },
  ];
  const cols = 20;

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const el = root.current!;
    const q = (s: string) => el.querySelector(s) as HTMLElement | SVGElement;
    const clip = q(".rp-clip") as SVGRectElement;
    const head = q(".rp-head") as SVGCircleElement;
    const date = q(".rp-date") as HTMLElement;
    const flow = q(".rp-flow b") as HTMLElement;
    const grid = q(".rp-house") as HTMLElement;
    const count = q(".rp-count b") as HTMLElement;
    const caps = Array.from(el.querySelectorAll<HTMLElement>(".rp-cap"));
    const marks = Array.from(el.querySelectorAll<SVGGElement>("[data-at]"));
    let last = -1, lastCap = -1;
    const render = (p: number) => {
      const d = Math.max(0, Math.min(k.last, dayAt(p, k)));
      const i = Math.floor(d), f = d - i;
      const v = i + 1 < days.length ? days[i][1] + (days[i + 1][1] - days[i][1]) * f : days[i][1];
      clip.setAttribute("width", String(X(d) + 2));
      head.setAttribute("cx", X(d).toFixed(1));
      head.setAttribute("cy", Y(v).toFixed(1));
      const day = Math.round(d);
      if (day !== last) {
        last = day;
        const q = days[day][1];
        date.textContent = dayLabel(days[day][0]);
        flow.textContent = fmt(q);
        flow.dataset.tone = q >= floodLevel ? "flood" : q >= warnLevel ? "warn" : "";
        for (const m of marks) m.classList.toggle("on", day >= Number(m.dataset.at));
        const paid = day >= k.pay;
        grid.classList.toggle("paid", paid);
        count.textContent = paid ? `${households} of ${households} families paid in full` : `0 of ${households} families paid`;
        count.dataset.tone = paid ? "paid" : "";
      }
      let c = 0;
      chapters.forEach((ch, j) => {
        if (d >= ch.at - 0.01) c = j;
      });
      if (c !== lastCap) {
        lastCap = c;
        caps.forEach((cap, j) => cap.classList.toggle("on", j === c));
      }
    };
    render(0);
    const st = ScrollTrigger.create({
      trigger: el,
      start: "top top",
      end: "bottom bottom",
      scrub: 0.4,
      onUpdate: (self) => render(self.progress),
    });
    return () => st.kill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const markAt = (i: number, color: string, label: string, row: number, cls = "") => (
    <g data-at={i} className={`rp-mark ${cls}`} key={label}>
      <line x1={X(i)} x2={X(i)} y1={14 + row * 22} y2={H - PADB} stroke={color} strokeWidth="1.5" strokeDasharray={cls === "warn" ? "5 6" : undefined} />
      <circle cx={X(i)} cy={Y(days[i][1])} r="6" fill={color} />
      <text x={X(i) + 8} y={26 + row * 22} fill={color}>
        {label}
      </text>
    </g>
  );

  return (
    <section className="rp" id="y2022" ref={root} aria-label="The 2022 flood at Lokoja, replayed under OMI's rules">
      <div className="rp-stage">
        <div className="rp-top">
          <p className="mono-k">The 2022 flood at Lokoja, played back under OMI&apos;s rules</p>
        </div>
        <div className="rp-main">
          <div className="rp-left">
            <div className="rp-readout">
              <span className="rp-date">1 Aug</span>
              <span className="rp-flow">
                <b>{fmt(days[0][1])}</b> m³/s
              </span>
            </div>
            <svg className="rp-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`River flow at Lokoja, August to October 2022, peaking at ${fmt(peak)} cubic metres a second`}>
              <defs>
                <clipPath id="rp-clip">
                  <rect className="rp-clip" x="0" y="0" width="0" height={H} />
                </clipPath>
              </defs>
              <line x1="0" x2={W} y1={Y(floodLevel)} y2={Y(floodLevel)} className="rp-flood" />
              <line x1="0" x2={W} y1={Y(warnLevel)} y2={Y(warnLevel)} className="rp-warn" />
              <text x={W} y={Y(floodLevel) - 8} className="rp-lab flood" textAnchor="end">Flood level {fmt(floodLevel)}</text>
              <g clipPath="url(#rp-clip)">
                <path d={area} className="rp-area" />
                <path d={line} className="rp-line" />
              </g>
              {markAt(k.warn, "var(--warn)", `${dayLabel(warnDate)} warning`, 0, "warn")}
              {markAt(k.pay, "var(--paid)", `${dayLabel(payDate)} paid`, 1, "paid")}
              {markAt(k.peak, "var(--flood)", `${dayLabel(peakDate)} peak`, 2, "flood")}
              <circle className="rp-head" r="5" cx="0" cy={Y(days[0][1])} />
              {[["1 Aug", 0], ["1 Sep", 31], ["1 Oct", 61]].map(([l, i]) => (
                <text key={l} x={X(Number(i))} y={H - 8} className="rp-axis">
                  {l}
                </text>
              ))}
            </svg>
          </div>
          <div className="rp-right">
            <div className="rp-caps" aria-live="polite">
              {chapters.map((ch, j) => (
                <p className={`rp-cap ${j === 0 ? "on" : ""}`} key={j}>
                  <span className={`mono-k ${ch.paid ? "paid" : ch.flood ? "flood" : ""}`}>{ch.k}</span>
                  <span className="rp-cap-t">{ch.t}</span>
                </p>
              ))}
            </div>
            <div className="rp-house" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
              {Array.from({ length: households }, (_, i) => (
                <i key={i} style={{ transitionDelay: `${((i % cols) * 22 + Math.floor(i / cols) * 9).toFixed(0)}ms` }} />
              ))}
            </div>
            <p className="rp-count">
              <b>0 of {households} families paid</b>
            </p>
          </div>
        </div>
        <p className="rp-foot">
          Recorded 2022 river flow from GloFAS, with an example fund of {households} families. Archived forecasts aren&apos;t public, so the early
          30% payment isn&apos;t shown.
        </p>
      </div>
    </section>
  );
}
