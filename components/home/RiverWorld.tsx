"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { geoNaturalEarth1 } from "d3-geo";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import land from "@/lib/generated/landDots.json";
import PlaceSearch from "@/components/PlaceSearch";

export interface WorldSite {
  slug: string;
  name: string;
  country: string;
  river: string;
  lat: number;
  lon: number;
  floodLevel: number;
  paidYears: number[];
  years: number;
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const href = (s: WorldSite) => `/river?lat=${s.lat}&lon=${s.lon}&name=${encodeURIComponent(`${s.name}, ${s.country}`)}`;

// Land as dots, the saved rivers as live points. The dots sweep in west to east as the
// section arrives; each river opens its own report.
export default function RiverWorld({ sites }: { sites: WorldSite[] }) {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pts, setPts] = useState<{ x: number; y: number }[]>([]);
  const [active, setActive] = useState<string | null>(sites[0]?.slug ?? null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    const D = land.dots as number[];
    const sweep = { v: 0 };
    let w = 0, h = 0;
    let proj = geoNaturalEarth1();
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const cut = -180 + sweep.v * 380;
      ctx.fillStyle = "#31403f";
      for (let i = 0; i < D.length; i += 2) {
        const lon = D[i] / 10, lat = D[i + 1] / 10;
        if (lon > cut) continue;
        const p = proj([lon, lat]);
        if (!p) continue;
        ctx.beginPath();
        ctx.arc(p[0], p[1], Math.max(1, w / 900), 0, Math.PI * 2);
        ctx.fill();
      }
    };
    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      proj = geoNaturalEarth1().fitExtent(
        [
          [4, 4],
          [w - 4, h - 4],
        ],
        { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-180, -56], [180, -56], [180, 80], [-180, 80], [-180, -56]]] } }
      );
      setPts(sites.map((s) => {
        const p = proj([s.lon, s.lat]) ?? [0, 0];
        return { x: (p[0] / w) * 100, y: (p[1] / h) * 100 };
      }));
      draw();
    };
    size();
    window.addEventListener("resize", size);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let tween: gsap.core.Tween | null = null;
    if (reduce) {
      sweep.v = 1;
      draw();
    } else {
      tween = gsap.to(sweep, {
        v: 1,
        duration: 2.2,
        ease: "power2.inOut",
        onUpdate: draw,
        scrollTrigger: { trigger: root.current, start: "top 70%", once: true },
      });
    }
    return () => {
      window.removeEventListener("resize", size);
      tween?.scrollTrigger?.kill();
      tween?.kill();
    };
  }, [sites]);

  const a = sites.find((s) => s.slug === active);
  return (
    <section className="rw" ref={root} aria-labelledby="rw-h">
      <div className="rw-head">
        <p className="mono-k">Same rules · every river&apos;s own record · GloFAS covers the planet</p>
        <h2 id="rw-h" className="rw-h">Any river on Earth.</h2>
        <p className="rw-sub">
          Type a town. OMI finds the main channel nearby, sets its flood level from 29 years of its own record, replays every past year
          and shows today&apos;s forecast.
        </p>
        <div className="rw-search">
          <PlaceSearch />
        </div>
      </div>
      <div className="rw-stage">
      <div className="rw-map">
        <canvas ref={canvas} aria-hidden="true" />
        {sites.map((s, i) =>
          pts[i] ? (
            <Link
              key={s.slug}
              href={href(s)}
              className={`rw-pt ${active === s.slug ? "on" : ""}`}
              style={{ left: `${pts[i].x}%`, top: `${pts[i].y}%` }}
              onMouseEnter={() => setActive(s.slug)}
              onFocus={() => setActive(s.slug)}
              aria-label={`${s.name}, ${s.country}: open the river report`}
            >
              <i />
            </Link>
          ) : null
        )}
      </div>
        {a && (
          <div className="rw-card" aria-live="polite">
            <span className="mono-k">
              {a.river} · {a.country}
            </span>
            <span className="rw-card-n">{a.name}</span>
            <span className="mono">
              Flood level <b className="flood">{fmt(a.floodLevel)}</b> m³/s
            </span>
            <span className="mono">
              Would have paid in <b className="paid">{a.paidYears.join(" · ")}</b>
            </span>
            <Link href={href(a)}>Open the report →</Link>
          </div>
        )}
      </div>
      <ul className="rw-list">
        {sites.map((s) => (
          <li key={s.slug}>
            <Link href={href(s)} onMouseEnter={() => setActive(s.slug)} onFocus={() => setActive(s.slug)}>
              <span>{s.name}</span>
              <span className="mono faint">
                {s.river.split(",")[0]} · paid {s.paidYears.length}× in {s.years} yrs
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
