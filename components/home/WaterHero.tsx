"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import PlaceSearch from "@/components/PlaceSearch";
import type { RiverReport } from "@/lib/river";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const PHASE = { normal: "Normal", watch: "On watch", early: "Early payout due", flood: "Full payout due" } as const;

// The screen is the river gauge. The bottom edge is zero flow; the red line is this
// river's flood level; the water stands at today's real flow at Lokoja.
export default function WaterHero({ initial }: { initial: RiverReport }) {
  const [r, setR] = useState(initial);
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const level = useRef({ v: 0 }); // current water height, 0..1 of the screen
  const amp = useRef({ v: 1 });

  // Fresh reading after the saved one.
  useEffect(() => {
    let alive = true;
    fetch(`/api/river?lat=${initial.cell.requested.lat}&lon=${initial.cell.requested.lon}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: RiverReport | null) => alive && body?.status && setR(body))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [initial]);

  const now = r.status.latest?.discharge ?? 0;
  const vmax = r.floodLevel * 1.22;
  const frac = (v: number) => Math.min(1, v / vmax) * 0.94;
  const nowFrac = frac(now);
  const share = now / r.floodLevel;

  // Water: three flat translucent layers with their own swell, and a crisp surface line.
  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0, t0 = performance.now(), visible = true;
    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const layers = [
      { a: 0.07, amp: 14, k: 0.0042, s: 0.32, off: -26, ph: 1.7 },
      { a: 0.1, amp: 10, k: 0.0067, s: -0.45, off: -12, ph: 0.4 },
      { a: 0.16, amp: 7, k: 0.0105, s: 0.62, off: 0, ph: 2.9 },
    ];
    const surface = (x: number, t: number, L: (typeof layers)[number], base: number) =>
      base + L.off + amp.current.v * (L.amp * Math.sin(x * L.k + t * L.s + L.ph) + L.amp * 0.45 * Math.sin(x * L.k * 2.3 - t * L.s * 1.6 + L.ph * 2));
    const draw = () => {
      const t = reduce ? 0 : (performance.now() - t0) / 1000;
      ctx.clearRect(0, 0, w, h);
      const base = h * (1 - level.current.v);
      for (const L of layers) {
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w + 8; x += 8) ctx.lineTo(x, surface(x, t, L, base));
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = `rgba(108,184,222,${L.a})`;
        ctx.fill();
      }
      const top = layers[2];
      ctx.beginPath();
      for (let x = 0; x <= w + 8; x += 8) {
        const y = surface(x, t, top, base);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(108,184,222,0.95)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (!reduce && visible) raf = requestAnimationFrame(draw);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(draw);
    });
    io.observe(cv);
    window.addEventListener("resize", size);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", size);
    };
  }, []);

  // Entrance: the river fills to today's level, then the words rise.
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        level.current.v = nowFrac;
        return;
      }
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.fromTo(level.current, { v: 0 }, { v: nowFrac, duration: 2.4, ease: "power2.out" }, 0.1);
      tl.fromTo(".wh-line", { scaleX: 0 }, { scaleX: 1, duration: 1.4, ease: "power2.inOut", stagger: 0.12 }, 0.2);
      tl.fromTo(".wh-tag", { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.12 }, 1.0);
      tl.fromTo(".wh-w", { yPercent: 110 }, { yPercent: 0, duration: 1.1, ease: "power4.out", stagger: 0.07 }, 0.6);
      tl.fromTo(".wh-fade", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.1 }, 1.4);
      // Scrolling on: the words lift away faster than the water, and the swell calms.
      gsap.to(".wh-copy", { yPercent: -18, ease: "none", scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true } });
      gsap.to(amp.current, { v: 0.35, ease: "none", scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true } });
    }, root);
    return () => ctx.revert();
  }, [nowFrac]);

  // A later live reading moves the water to its new height.
  useEffect(() => {
    if (level.current.v > 0) gsap.to(level.current, { v: nowFrac, duration: 1.6, ease: "power2.inOut" });
  }, [nowFrac]);

  const words = "Flood money that arrives before the water does.".split(" ");
  const pct = (v: number) => `${(frac(v) * 100).toFixed(2)}%`;
  return (
    <section className="wh" ref={root} aria-label="The river at Lokoja, right now">
      <canvas ref={canvas} className="wh-canvas" aria-hidden="true" />
      <div className="wh-staff" aria-hidden="true">
        {Array.from({ length: Math.floor(vmax / 5000) + 1 }, (_, i) => i * 5000).map((v) => (
          <span key={v} className={v % 10000 === 0 ? "major" : ""} style={{ bottom: pct(v) }}>
            {v % 10000 === 0 ? fmt(v) : ""}
          </span>
        ))}
      </div>
      <div className="wh-lines" aria-hidden="true">
        <div className="wh-level" style={{ bottom: pct(r.floodLevel) }}>
          <i className="wh-line flood" />
          <span className="wh-tag flood">
            Flood level · {fmt(r.floodLevel)}
            <span className="wh-long"> m³/s · once in 10 years</span>
          </span>
        </div>
        <div className="wh-level" style={{ bottom: pct(r.warnLevel) }}>
          <i className="wh-line warn" />
          <span className="wh-tag warn">Warning · {fmt(r.warnLevel)}</span>
        </div>
      </div>
      <div className="wh-now wh-tag" style={{ bottom: `calc(${(nowFrac * 100).toFixed(2)}% + 18px)` }}>
        <span className="wh-now-k">The Niger at Lokoja, {r.status.latest ? new Date(r.status.latest.date + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "today"}</span>
        <span className="wh-now-v">
          {fmt(now)} <small>m³/s</small>
        </span>
        <span className="wh-now-s">
          {PHASE[r.status.phase]} · {Math.round(share * 100)}% of its flood level
        </span>
      </div>
      <div className="wh-copy">
        <p className="wh-kicker wh-fade">An open protocol for flood funds · USDC on Arc · any river on Earth</p>
        <h1 className="wh-title">
          {words.map((w, i) => (
            <span key={i}>
              <span className="wh-m">
                <span className="wh-w">{w}</span>
              </span>{" "}
            </span>
          ))}
        </h1>
        <p className="wh-lede wh-fade">
          Every registered household gets {r.rules.earlyShareBps / 100}% of its cover in USDC when the forecast reaches the river&apos;s flood level,
          and the rest after {r.rules.consecutiveDays} days over it. No claims. No assessors. The river decides.
        </p>
        <div className="wh-search wh-fade">
          <PlaceSearch />
        </div>
      </div>
      <a className="wh-cue wh-fade" href="#y2022">
        Scroll to watch 2022 happen
      </a>
    </section>
  );
}
