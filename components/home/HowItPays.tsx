"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const STEPS = [
  { k: "Money in", t: "Donors", d: "Anyone puts USDC into a river town's fund." },
  { k: "Held", t: "The fund, on Arc", d: "The contract holds it. It has no withdraw function, for anyone." },
  { k: "Every day", t: "A river reading", d: "Yesterday's flow and the 15-day forecast from GloFAS, with a fingerprint of the source data." },
  { k: "One hour", t: "Time to object", d: "A guardian can veto a reading that doesn't match its source." },
  { k: "The rule", t: "Is it met?", d: "Forecast reaches the flood level: 30%. Two days over it: the rest." },
  { k: "Money out", t: "Every household", d: "Paid in the same transaction. Nobody files a claim." },
];

// The contract as a machine: one USDC token travels the pipe as you scroll, and each
// stage lights as the money passes through it.
export default function HowItPays({ rules }: { rules: { floodReturnYears: number; earlyShareBps: number; earlyLeadDays: number; consecutiveDays: number } }) {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const el = root.current!;
    const nodes = Array.from(el.querySelectorAll<HTMLElement>(".hp-node"));
    const fill = el.querySelector(".hp-fill") as HTMLElement;
    const token = el.querySelector(".hp-token") as HTMLElement;
    const render = (p: number) => {
      const n = p * (STEPS.length - 1);
      fill.style.setProperty("--p", String(p));
      token.style.setProperty("--p", String(p));
      token.classList.toggle("paid", p > 0.985);
      nodes.forEach((nd, i) => nd.classList.toggle("on", n >= i - 0.05));
    };
    render(0);
    const st = ScrollTrigger.create({ trigger: el.querySelector(".hp-pin"), start: "top top", end: "bottom bottom", scrub: 0.3, onUpdate: (s) => render(s.progress) });
    return () => st.kill();
  }, []);

  return (
    <section className="hp" ref={root} aria-labelledby="hp-h">
      <div className="hp-pin">
        <div className="hp-stage">
          <p className="mono-k">How the money moves</p>
          <h2 id="hp-h" className="hp-h">A rule, not a committee.</h2>
          <div className="hp-pipe">
            <div className="hp-track" aria-hidden="true">
              <i className="hp-fill" />
              <i className="hp-token">$</i>
            </div>
            <ol className="hp-nodes">
              {STEPS.map((s) => (
                <li className="hp-node" key={s.t}>
                  <span className="mono-k">{s.k}</span>
                  <span className="hp-t">{s.t}</span>
                  <span className="hp-d">{s.d}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
      <div className="hp-terms" aria-labelledby="hp-terms-h">
        <h3 id="hp-terms-h" className="mono-k">The terms, fixed in the contract before the season</h3>
        <ol>
          <li>
            <b>Flood level.</b> The flow this stretch of river reaches about once in {rules.floodReturnYears} years, from its own record.
          </li>
          <li>
            <b>Early payout.</b> {rules.earlyShareBps / 100}% of the cover, once, when the forecast median reaches the flood level within{" "}
            {rules.earlyLeadDays} days.
          </li>
          <li>
            <b>Full payout.</b> The rest of the cover, once, when the river has been at or above the flood level {rules.consecutiveDays} days in a
            row.
          </li>
          <li>
            <b>Who gets paid.</b> Households registered before the season starts. Nobody can be added once a flood is forecast.
          </li>
          <li>
            <b>Every reading waits.</b> One hour before it can move money; a guardian can stop one that doesn&apos;t match its source.
          </li>
          <li>
            <b>Where money can go.</b> Only to the households of the fund it was given to. Nobody can change these terms mid-season, including us.
          </li>
        </ol>
      </div>
    </section>
  );
}
