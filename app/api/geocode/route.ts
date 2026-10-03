// GET /api/geocode?q=Makurdi — place search through Open-Meteo's free geocoder.
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

interface Hit {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ error: "Type at least two letters." }, { status: 400 });
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { results?: Hit[] };
    const results = (body.results ?? []).map(({ name, admin1, country, latitude, longitude }) => ({ name, admin1, country, latitude, longitude }));
    return NextResponse.json({ results }, { headers: { "cache-control": "public, s-maxage=86400" } });
  } catch {
    return NextResponse.json({ error: "Place search is unavailable right now. Type a latitude and longitude instead." }, { status: 502 });
  }
}
