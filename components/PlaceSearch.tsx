"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Place {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

export default function PlaceSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Place[]>([]);

  const go = (p: Place) => {
    const label = [p.name, p.admin1, p.country].filter(Boolean).join(", ");
    router.push(`/river?lat=${p.latitude.toFixed(4)}&lon=${p.longitude.toFixed(4)}&name=${encodeURIComponent(label)}`);
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    setError(null);
    setResults([]);
    // "7.8, 6.74" goes straight to the map point.
    const m = text.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
    if (m) {
      router.push(`/river?lat=${m[1]}&lon=${m[2]}`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(text)}`);
      const body = (await res.json()) as { results?: Place[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Search failed.");
      if (!body.results?.length) setError(`No place called "${text}" was found. Try a nearby town, or type a latitude and longitude.`);
      else if (body.results.length === 1) go(body.results[0]);
      else setResults(body.results);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <form className="search" onSubmit={search} role="search">
        <label htmlFor="place" className="faint small" style={{ flexBasis: "100%" }}>
          Town, or latitude and longitude
        </label>
        <input id="place" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Makurdi, or 7.73, 8.54" autoComplete="off" />
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Searching…" : "Check this river"}
        </button>
      </form>
      {error && <p className="muted small">{error}</p>}
      {results.length > 0 && (
        <div className="results">
          {results.map((p) => (
            <button key={`${p.latitude},${p.longitude}`} type="button" onClick={() => go(p)}>
              <span>{p.name}</span>
              <span className="faint">{[p.admin1, p.country].filter(Boolean).join(", ")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
