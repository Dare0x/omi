// GET /api/river?lat=..&lon=..
// The full river report for any point: snapped river cell, return levels,
// backtest of every past year, replays, 30-day forecast and today's status.
// No key, CORS open. Cached for an hour at the edge.

import { NextRequest, NextResponse } from "next/server";
import { riverReport, validCoord } from "@/lib/river";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const CORS = { "access-control-allow-origin": "*" };

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lon = Number(req.nextUrl.searchParams.get("lon"));
  if (!validCoord(lat, lon)) {
    return NextResponse.json({ error: "Give a latitude and longitude, like ?lat=7.8&lon=6.74." }, { status: 400, headers: CORS });
  }
  try {
    const report = await riverReport(Number(lat.toFixed(4)), Number(lon.toFixed(4)));
    return NextResponse.json(report, {
      headers: { ...CORS, "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (err) {
    const msg = (err as Error).message;
    const notRiver = /No river|full years/.test(msg);
    return NextResponse.json(
      { error: notRiver ? msg : "The river data service didn't answer in time. Try again in a minute.", detail: msg },
      { status: notRiver ? 404 : 502, headers: CORS }
    );
  }
}
