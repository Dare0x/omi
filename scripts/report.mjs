// npm run report -- arc-testnet
// The daily reporter. For every live site: fetch the river from GloFAS (via
// Open-Meteo), post yesterday's flow and the 15-day forecast high on-chain with
// the keccak256 of the exact response body, save that body under
// data/readings/ so anyone can check the hash, then settle every reading whose
// one-hour wait is over.
import fs from "node:fs";
import path from "node:path";
import { Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from "ethers";
import { compile } from "./compile.mjs";
import { loadEnv, network, readDeployment, root } from "./env.mjs";

loadEnv();
const net = network();
const dep = readDeployment(net);
const provider = new JsonRpcProvider(net.rpc, net.chainId);
const wallet = new Wallet(process.env.DEPLOYER_KEY, provider);
const { OmiFund } = compile();
const fund = new Contract(dep.address, OmiFund.abi, wallet);
const LEAD_DAYS = 15;
const unixDay = (iso) => Math.floor(Date.parse(iso + "T00:00:00Z") / 86_400_000);

async function readingFor(s) {
  const lat = Number(s.latE4) / 1e4;
  const lon = Number(s.lonE4) / 1e4;
  const url =
    `https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lon}` +
    `&daily=river_discharge,river_discharge_median&past_days=7&forecast_days=${LEAD_DAYS + 1}&cell_selection=nearest`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const text = await res.text();
  const body = JSON.parse(text);
  const today = new Date().toISOString().slice(0, 10);
  const t = body.daily.time;
  const q = body.daily.river_discharge;
  const med = body.daily.river_discharge_median;
  // Yesterday is the latest whole day the model has analysed.
  let i = t.findIndex((d) => d >= today) - 1;
  while (i >= 0 && (q[i] === null || q[i] === undefined)) i--;
  if (i < 0) throw new Error("No recent river value");
  const future = t.map((d, k) => (d > today ? med[k] ?? q[k] : null)).filter((v) => v !== null).slice(0, LEAD_DAYS);
  return {
    url,
    text,
    day: unixDay(t[i]),
    date: t[i],
    observed: Math.round(q[i]),
    forecastMedianMax: Math.round(Math.max(0, ...future)),
  };
}

// Every site anyone has opened gets a reading, except the testnet replay site,
// which replays 2022 instead (scripts/replay.mjs).
const replayIds = new Set((dep.sites ?? []).filter((s) => s.kind !== "live").map((s) => s.id));
const count = Number(await fund.siteCount());
for (let id = 0; id < count; id++) {
  if (replayIds.has(id)) continue;
  const s = await fund.site(id);
  const now = Math.floor(Date.now() / 1000);
  if (now < Number(s.seasonStart) || now > Number(s.seasonEnd)) {
    console.log(`site ${id}: out of season, nothing to post`);
    continue;
  }
  const r = await readingFor(s);
  if (r.day <= Number(s.lastPostedDay)) {
    console.log(`site ${id}: ${r.date} already posted`);
    continue;
  }
  const sourceHash = keccak256(toUtf8Bytes(r.text));
  const dir = path.join(root, "data/readings", net.key, `site-${id}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${r.date}.json`), JSON.stringify({ url: r.url, fetchedAt: new Date().toISOString(), sourceHash, body: r.text }, null, 2));
  const tx = await fund.postReading(id, r.day, r.observed, r.forecastMedianMax, sourceHash);
  await tx.wait();
  console.log(`site ${id}: posted ${r.date} observed ${r.observed} m3/s, forecast high ${r.forecastMedianMax} m3/s (tx ${tx.hash})`);
}

const pending = Number(await fund.readingCount()) - Number(await fund.nextToSettle());
if (pending > 0) {
  const tx = await fund.settleReady(25);
  await tx.wait();
  console.log(`settled ready readings (tx ${tx.hash}); next in line ${await fund.nextToSettle()} of ${await fund.readingCount()}`);
}
