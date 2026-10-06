"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

interface Row {
  year: number;
  peak: number;
  paid: boolean;
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

// 29 years of the river's highest flow rise one by one as you scroll. The rule was
// never told which years were bad; the bars that turn green are the ones it picked.
export default function YearsStrip({ rows, floodLevel, fairShare }: { rows: Row[]; floodLevel: number; fairShare: number }) {
  const root = useRef<HTMLElement>(null);
  const vmax = Math.max(...rows.map((r) => r.peak), floodLevel) * 1.08;
  const paid = rows.filter((r) => r.paid).map((r) => r.year);
  const first = rows[0].year, lastY = rows[rows.length - 1].year;
  const perHundred = fairShare * 100;

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const el = root.current!;
    const bars = Array.from(el.querySelectorAll<HTMLElement>(".ys-bar"));
    const reveal = Array.from(el.querySelectorAll<HTMLElement>(".ys-after"));
    const counter = el.querySelector(".ys-count") as HTMLElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const render = (p: number) => {
      const n = p * (bars.length + 2);
      bars.forEach((b, i) => {
        const g = reduce ? 1 : Math.max(0, Math.min(1, n - i));
        b.style.transform = `scaleY(${g.toFixed(3)})`;
        b.classList.toggle("done", g >= 1);
      });
      const shown = Math.min(bars.length, Math.max(0, Math.floor(n)));
      counter.textContent = String(first + Math.max(0, shown - 1));
      const end = n >= bars.length + 0.5;
      reveal.forEach((r) => r.classList.toggle("on", end));
    };
    render(0);
    const st = ScrollTrigger.create({ trigger: el, start: "top top", end: "bottom bottom", scrub: 0.3, onUpdate: (s) => render(s.progress) });
    return () => st.kill();
  }, [first]);

  return (
    <section className="ys" ref={root} aria-label={`Every year from ${first} to ${lastY}`}>
      <div className="ys-stage">
        <p className="mono-k">
          The Niger at Lokoja · highest flow of each year, <span className="ys-count">{first}</span>
        </p>
        <h2 className="ys-h">Nobody told the rules which years were bad.</h2>
        <p className="ys-h2 ys-after">
          They picked{" "}
          {paid.map((y, i) => (
            <span key={y}>
              <b className="paid">{y}</b>
              {i < paid.length - 2 ? ", " : i === paid.length - 2 ? " and " : ""}
            </span>
          ))}
          .
        </p>
        <div className="ys-chart" role="img" aria-label={`Yearly peaks; the payout rule fires in ${paid.join(", ")}`}>
          <i className="ys-flood" style={{ bottom: `${((floodLevel / vmax) * 100).toFixed(2)}%` }}>
            <span>Flood level {fmt(floodLevel)} m³/s, once in 10 years</span>
          </i>
          {rows.map((r) => (
            <div className="ys-col" key={r.year}>
              <div className={`ys-bar ${r.paid ? "is-paid" : ""}`} style={{ height: `${((r.peak / vmax) * 100).toFixed(2)}%` }} />
              {r.paid && (
                <span className="ys-yl" style={{ bottom: `${((r.peak / vmax) * 100).toFixed(2)}%` }}>
                  {r.year}
                </span>
              )}
            </div>
          ))}
        </div>
        <p className="ys-legend mono-k">
          <span className="flood">Red line</span>: flood level, {fmt(floodLevel)} m³/s, the flow it reaches about once in 10 years
        </p>
        <div className="ys-foot ys-after">
          <p>2012 and 2022 were Nigeria&apos;s two worst flood years in decades.</p>
          <p>
            {paid.length} payouts in {rows.length} years means covering a family for <b>$100</b> costs a donor about{" "}
            <b className="paid">${Math.round(perHundred)}</b> a year.
          </p>
        </div>
      </div>
    </section>
  );
}
