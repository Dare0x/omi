// OMI river engine.
//
// Everything a payout depends on is computed here, deterministically, from
// public GloFAS river-discharge data served by Open-Meteo (no API key). No AI
// model produces or changes any number. Given the same data, anyone gets the
// same levels, the same status and the same backtest.

export const RULES = {
  version: 1,
  // A site's flood level is the river discharge it reaches about once every
  // 10 years (Gumbel fit to its annual peaks). The warning level is 1-in-5.
  floodReturnYears: 10,
  warnReturnYears: 5,
  // Early payout: the ensemble forecast median reaches the flood level within
  // this many days. Paid once per season.
  earlyLeadDays: 15,
  earlyShareBps: 3000,
  // Full payout: the observed river stays at or above the flood level this
  // many consecutive days. Pays the rest of the cover. Once per season.
  consecutiveDays: 2,
  // Snapping searches a square of cells this many steps from the point, on
  // GloFAS's 0.05° grid, and keeps the one carrying the most water.
  snapRadiusCells: 2,
  gridDegrees: 0.05,
  // Years with fewer valid days than this don't count as an annual peak.
  minDaysPerYear: 300,
} as const;

const FLOOD_API = "https://flood-api.open-meteo.com/v1/flood";

export interface Cell {
  lat: number;
  lon: number;
}

export interface SnapResult extends Cell {
  requested: Cell;
  movedKm: number;
  meanDischarge: number;
  cellsSearched: number;
}

export interface ReturnLevels {
  years: number;
  firstYear: number;
  lastYear: number;
  mean: number;
  sd: number;
  levels: Record<string, number>; // "2" | "5" | "10" | "25" | "50" -> m3/s
}

export interface YearRow {
  year: number;
  peak: number;
  peakDate: string;
  warnDate: string | null; // first day at or above the warning level
  floodDate: string | null; // day the full-payout rule fires (consecutive days)
  leadDays: number | null; // warning date to peak, in days
  paid: boolean;
}

export interface Backtest {
  rows: YearRow[];
  events: number;
  years: number;
  eventsPerYear: number;
  // Expected cost of the cover per year as a share of the cover (0..1):
  // the fair premium before any margin.
  fairPremiumShare: number;
}

export interface ForecastDay {
  date: string;
  observed: number | null; // past days: model analysis of what the river did
  median: number | null;
  p25: number | null;
  p75: number | null;
  min: number | null;
  max: number | null;
}

export type Phase = "normal" | "watch" | "early" | "flood";

export interface Status {
  phase: Phase;
  today: string;
  latest: { date: string; discharge: number } | null;
  forecastPeak: { date: string; median: number; p75: number } | null;
  daysToFloodLevel: number | null; // first forecast day the median reaches the flood level
  aboveStreak: number; // consecutive observed days at/above the flood level, ending at the latest day
  reason: string;
}

export interface Replay {
  year: number;
  days: [string, number][]; // [date, m3/s], June to mid-December
}

export interface RiverReport {
  rules: typeof RULES;
  cell: SnapResult;
  history: ReturnLevels;
  floodLevel: number;
  warnLevel: number;
  backtest: Backtest;
  // Daily flow for every year the payout would have fired, plus the last full
  // year, so a past flood can be replayed against the rules.
  replays: Replay[];
  forecast: ForecastDay[];
  status: Status;
  source: { name: string; url: string; licence: string };
  computedAt: string;
}

// ---------------------------------------------------------------------------
// Fetching

type Fetcher = (url: string) => Promise<unknown>;

// Responses are cached in memory: river history changes once a day at most,
// and Open-Meteo's free tier limits how often one server may ask.
const cache = new Map<string, { at: number; value: unknown }>();
const TTL_MS = 60 * 60 * 1000;

let fetcher: Fetcher = async (url: string) => {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (res.status === 429 || res.status >= 500) {
        const wait = Number(res.headers.get("retry-after"));
        lastErr = new Error(`The river data service is busy (HTTP ${res.status}). Try again in a minute.`);
        await new Promise((r) => setTimeout(r, (Number.isFinite(wait) && wait > 0 ? wait : 2 + attempt * 4) * 1000));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const value = await res.json();
      cache.set(url, { at: Date.now(), value });
      return value;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
};

// Tests swap in recorded responses.
export function setFetcher(f: Fetcher) {
  fetcher = f;
}

interface DailyPayload {
  latitude: number;
  longitude: number;
  daily: Record<string, (number | null)[] | string[]> & { time: string[] };
}

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

function kmBetween(a: Cell, b: Cell): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function validCoord(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

// ---------------------------------------------------------------------------
// Snap a point to the main river channel nearby.

export async function snapToRiver(lat: number, lon: number): Promise<SnapResult> {
  const r = RULES.snapRadiusCells;
  const step = RULES.gridDegrees;
  const lats: number[] = [];
  const lons: number[] = [];
  for (let i = -r; i <= r; i++) {
    for (let j = -r; j <= r; j++) {
      lats.push(round(lat + i * step));
      lons.push(round(lon + j * step));
    }
  }
  // A recent 60-day window is enough to tell the main channel from a side
  // stream (the main channel carries far more water in any season) and keeps
  // the request light on the free API.
  const url =
    `${FLOOD_API}?latitude=${lats.join(",")}&longitude=${lons.join(",")}` +
    `&daily=river_discharge&past_days=60&forecast_days=1&cell_selection=nearest`;
  const body = (await fetcher(url)) as DailyPayload | DailyPayload[];
  const list = Array.isArray(body) ? body : [body];
  let best: { lat: number; lon: number; mean: number } | null = null;
  const seen = new Set<string>();
  for (const p of list) {
    const k = `${p.latitude},${p.longitude}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const q = (p.daily.river_discharge as (number | null)[]).filter((v): v is number => v !== null);
    if (q.length < 30) continue;
    const mean = q.reduce((s, v) => s + v, 0) / q.length;
    if (!best || mean > best.mean) best = { lat: p.latitude, lon: p.longitude, mean };
  }
  if (!best || best.mean <= 0) {
    throw new Error("No river with flow data was found within about 10 km of this point.");
  }
  return {
    lat: round(best.lat),
    lon: round(best.lon),
    requested: { lat, lon },
    movedKm: round(kmBetween({ lat, lon }, best), 1),
    meanDischarge: round(best.mean, 1),
    cellsSearched: seen.size,
  };
}

// ---------------------------------------------------------------------------
// History and return levels

export interface DailySeries {
  time: string[];
  q: (number | null)[];
}

export async function fetchHistory(cell: Cell, endYear = new Date().getUTCFullYear() - 1): Promise<DailySeries> {
  const url =
    `${FLOOD_API}?latitude=${cell.lat}&longitude=${cell.lon}&daily=river_discharge` +
    `&start_date=1984-01-01&end_date=${endYear}-12-31&cell_selection=nearest`;
  const body = (await fetcher(url)) as DailyPayload;
  return { time: body.daily.time, q: body.daily.river_discharge as (number | null)[] };
}

export function annualPeaks(s: DailySeries): { year: number; peak: number; date: string }[] {
  const by = new Map<number, { peak: number; date: string; n: number }>();
  s.time.forEach((day, i) => {
    const v = s.q[i];
    if (v === null || v === undefined) return;
    const y = Number(day.slice(0, 4));
    const cur = by.get(y) ?? { peak: -1, date: day, n: 0 };
    cur.n++;
    if (v > cur.peak) {
      cur.peak = v;
      cur.date = day;
    }
    by.set(y, cur);
  });
  return [...by.entries()]
    .filter(([, v]) => v.n >= RULES.minDaysPerYear)
    .sort((a, b) => a[0] - b[0])
    .map(([year, v]) => ({ year, peak: v.peak, date: v.date }));
}

// Gumbel (EV1) fit by the method of moments: the standard first-pass
// flood-frequency method. Returns the discharge expected once per T years.
export function returnLevels(peaks: { year: number; peak: number }[]): ReturnLevels {
  if (peaks.length < 10) throw new Error(`Only ${peaks.length} full years of river data here; at least 10 are needed.`);
  const xs = peaks.map((p) => p.peak);
  const n = xs.length;
  const mean = xs.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(xs.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  const beta = (sd * Math.sqrt(6)) / Math.PI;
  const mu = mean - 0.5772156649 * beta;
  const level = (T: number) => mu - beta * Math.log(-Math.log(1 - 1 / T));
  const levels: Record<string, number> = {};
  for (const T of [2, 5, 10, 25, 50]) levels[String(T)] = Math.round(level(T));
  return {
    years: n,
    firstYear: peaks[0].year,
    lastYear: peaks[n - 1].year,
    mean: Math.round(mean),
    sd: Math.round(sd),
    levels,
  };
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

// Replays the payout rules over every past year. Forecast-based early payouts
// can't be replayed (archived forecasts aren't public), so the backtest
// reports the warning-level lead time instead and charges the full cover in
// any year the full-payout rule fires.
export function backtest(s: DailySeries, floodLevel: number, warnLevel: number): Backtest {
  const rows: YearRow[] = [];
  const peaks = annualPeaks(s);
  const need = RULES.consecutiveDays;
  for (const { year, peak, date } of peaks) {
    let warnDate: string | null = null;
    let floodDate: string | null = null;
    let streak = 0;
    const prefix = String(year);
    for (let i = 0; i < s.time.length; i++) {
      const day = s.time[i];
      if (!day.startsWith(prefix)) continue;
      const v = s.q[i];
      if (v === null || v === undefined) {
        streak = 0;
        continue;
      }
      if (warnDate === null && v >= warnLevel) warnDate = day;
      streak = v >= floodLevel ? streak + 1 : 0;
      if (floodDate === null && streak >= need) floodDate = day;
    }
    rows.push({
      year,
      peak: Math.round(peak),
      peakDate: date,
      warnDate,
      floodDate,
      leadDays: warnDate !== null ? dayDiff(warnDate, date) : null,
      paid: floodDate !== null,
    });
  }
  const events = rows.filter((r) => r.paid).length;
  return {
    rows,
    events,
    years: rows.length,
    eventsPerYear: rows.length ? events / rows.length : 0,
    fairPremiumShare: rows.length ? events / rows.length : 0,
  };
}

// ---------------------------------------------------------------------------
// Forecast and live status

export async function fetchForecast(cell: Cell): Promise<ForecastDay[]> {
  const vars = [
    "river_discharge",
    "river_discharge_median",
    "river_discharge_p25",
    "river_discharge_p75",
    "river_discharge_min",
    "river_discharge_max",
  ];
  const url =
    `${FLOOD_API}?latitude=${cell.lat}&longitude=${cell.lon}&daily=${vars.join(",")}` +
    `&past_days=14&forecast_days=30&cell_selection=nearest`;
  const body = (await fetcher(url)) as DailyPayload;
  const d = body.daily;
  const col = (k: string) => (d[k] as (number | null)[] | undefined) ?? [];
  const today = new Date().toISOString().slice(0, 10);
  return d.time.map((date, i) => {
    const past = date <= today;
    const v = (k: string) => {
      const x = col(k)[i];
      return x === null || x === undefined ? null : Math.round(x);
    };
    return {
      date,
      observed: past ? v("river_discharge") : null,
      median: past ? null : v("river_discharge_median") ?? v("river_discharge"),
      p25: past ? null : v("river_discharge_p25"),
      p75: past ? null : v("river_discharge_p75"),
      min: past ? null : v("river_discharge_min"),
      max: past ? null : v("river_discharge_max"),
    };
  });
}

export function liveStatus(days: ForecastDay[], floodLevel: number, warnLevel: number, today = new Date().toISOString().slice(0, 10)): Status {
  const past = days.filter((d) => d.observed !== null && d.date <= today);
  const future = days.filter((d) => d.date > today && d.median !== null);
  const latestDay = past.length ? past[past.length - 1] : null;
  const latest = latestDay ? { date: latestDay.date, discharge: latestDay.observed as number } : null;

  let aboveStreak = 0;
  for (let i = past.length - 1; i >= 0 && (past[i].observed as number) >= floodLevel; i--) aboveStreak++;

  const window = future.slice(0, RULES.earlyLeadDays);
  let forecastPeak: Status["forecastPeak"] = null;
  for (const d of window) {
    if (!forecastPeak || (d.median as number) > forecastPeak.median) {
      forecastPeak = { date: d.date, median: d.median as number, p75: d.p75 ?? (d.median as number) };
    }
  }
  const hit = window.find((d) => (d.median as number) >= floodLevel);
  const daysToFloodLevel = hit ? dayDiff(today, hit.date) : null;

  let phase: Phase = "normal";
  let reason = "The river is below its warning level and the forecast stays below the flood level.";
  if (aboveStreak >= RULES.consecutiveDays) {
    phase = "flood";
    reason = `The river has been at or above its flood level for ${aboveStreak} days in a row: the full payout rule is met.`;
  } else if (hit) {
    phase = "early";
    reason = `The forecast median reaches the flood level on ${hit.date}, ${daysToFloodLevel} days from now: the early payout rule is met.`;
  } else if ((latest && latest.discharge >= warnLevel) || window.some((d) => (d.p75 ?? 0) >= warnLevel)) {
    phase = "watch";
    reason = "The river is at its warning level, or a quarter of the forecast runs reach it. No payout yet.";
  }
  return { phase, today, latest, forecastPeak, daysToFloodLevel, aboveStreak, reason };
}

export function replays(s: DailySeries, years: number[]): Replay[] {
  const wanted = [...new Set(years)].sort((a, b) => a - b);
  return wanted.map((year) => {
    const from = `${year}-06-01`;
    const to = `${year}-12-15`;
    const days: [string, number][] = [];
    s.time.forEach((d, i) => {
      const v = s.q[i];
      if (d >= from && d <= to && v !== null && v !== undefined) days.push([d, Math.round(v)]);
    });
    return { year, days };
  });
}

// ---------------------------------------------------------------------------
// Everything for one place

export async function riverReport(lat: number, lon: number): Promise<RiverReport> {
  if (!validCoord(lat, lon)) throw new Error("That isn't a valid latitude and longitude.");
  const cell = await snapToRiver(lat, lon);
  const [hist, forecast] = await Promise.all([fetchHistory(cell), fetchForecast(cell)]);
  const history = returnLevels(annualPeaks(hist));
  const floodLevel = history.levels[String(RULES.floodReturnYears)];
  const warnLevel = history.levels[String(RULES.warnReturnYears)];
  const bt = backtest(hist, floodLevel, warnLevel);
  return {
    rules: RULES,
    cell,
    history,
    floodLevel,
    warnLevel,
    backtest: bt,
    replays: replays(hist, [...bt.rows.filter((r) => r.paid).map((r) => r.year), history.lastYear]),
    forecast,
    status: liveStatus(forecast, floodLevel, warnLevel),
    source: {
      name: "GloFAS river discharge (Copernicus Emergency Management Service), via Open-Meteo",
      url: "https://open-meteo.com/en/docs/flood-api",
      licence: "CC BY 4.0",
    },
    computedAt: new Date().toISOString(),
  };
}
