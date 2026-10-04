// GET /api/fund — the live state of every OmiFund deployment, read from Arc:
// sites, households, balances, the latest readings and every payout.
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { Contract, JsonRpcProvider } from "ethers";
import abi from "@/lib/generated/omiFundAbi.json";
import { NETWORKS, type NetKey } from "@/lib/networks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

interface Deployment {
  network: NetKey;
  address: string;
  guardian: string;
  reporter: string;
  challengeWindow: number;
  deployBlock: number;
  deployTx: string;
  sites?: { id: number; slug: string; kind: string }[];
}

const toNum = (v: unknown) => Number(v as bigint);

async function readNetwork(dep: Deployment) {
  const net = NETWORKS[dep.network];
  const provider = new JsonRpcProvider(net.rpc, net.chainId, { staticNetwork: true });
  const fund = new Contract(dep.address, abi, provider);
  const [siteCount, readingCount, nextToSettle, totalPaid, latest] = await Promise.all([
    fund.siteCount(),
    fund.readingCount(),
    fund.nextToSettle(),
    fund.totalPaid(),
    provider.getBlockNumber(),
  ]);
  const sites = await Promise.all(
    [...Array(toNum(siteCount)).keys()].map(async (id) => {
      const [s, hs] = await Promise.all([fund.site(id), fund.households(id)]);
      return {
        id,
        kind: dep.sites?.find((x) => x.id === id)?.kind ?? "live",
        name: s.name as string,
        manager: s.manager as string,
        lat: toNum(s.latE4) / 1e4,
        lon: toNum(s.lonE4) / 1e4,
        floodLevel: toNum(s.floodLevel),
        warnLevel: toNum(s.warnLevel),
        seasonStart: toNum(s.seasonStart),
        seasonEnd: toNum(s.seasonEnd),
        cover: (s.coverPerHousehold as bigint).toString(),
        earlyBps: toNum(s.earlyBps),
        consecutiveDays: toNum(s.consecutiveDays),
        earlyPaid: s.earlyPaid as boolean,
        fullPaid: s.fullPaid as boolean,
        paidPerHousehold: (s.paidPerHousehold as bigint).toString(),
        balance: (s.balance as bigint).toString(),
        lastPostedDay: toNum(s.lastPostedDay),
        streak: toNum(s.streak),
        households: hs as string[],
      };
    })
  );
  const n = toNum(readingCount);
  const ids = [...Array(Math.min(n, 30)).keys()].map((k) => n - 1 - k);
  const readings = await Promise.all(
    ids.map(async (id) => {
      const r = await fund.reading(id);
      return {
        id,
        siteId: toNum(r.siteId),
        date: new Date(toNum(r.day) * 86_400_000).toISOString().slice(0, 10),
        observed: toNum(r.observed),
        forecastMedianMax: toNum(r.forecastMedianMax),
        sourceHash: r.sourceHash as string,
        readyAt: toNum(r.readyAt),
        vetoed: r.vetoed as boolean,
        settled: r.settled as boolean,
      };
    })
  );
  // Payout events, scanned in chunks the public RPC accepts.
  const payouts: { siteId: number; kind: number; perHousehold: string; households: number; total: string; tx: string; block: number }[] = [];
  const funded: { siteId: number; donor: string; amount: string; tx: string; block: number }[] = [];
  const step = 9_000;
  for (let from = dep.deployBlock; from <= latest; from += step + 1) {
    const to = Math.min(latest, from + step);
    const [p, f] = await Promise.all([
      fund.queryFilter(fund.filters.Payout(), from, to),
      fund.queryFilter(fund.filters.Funded(), from, to),
    ]);
    for (const e of p) {
      if (!("args" in e)) continue;
      payouts.push({
        siteId: toNum(e.args.siteId),
        kind: toNum(e.args.kind),
        perHousehold: e.args.perHousehold.toString(),
        households: toNum(e.args.households),
        total: e.args.total.toString(),
        tx: e.transactionHash,
        block: e.blockNumber,
      });
    }
    for (const e of f) {
      if (!("args" in e)) continue;
      funded.push({ siteId: toNum(e.args.siteId), donor: e.args.donor, amount: e.args.amount.toString(), tx: e.transactionHash, block: e.blockNumber });
    }
  }
  return {
    key: net.key,
    name: net.name,
    chainId: net.chainId,
    rpc: net.rpc,
    explorer: net.explorer,
    usdc: net.usdc,
    address: dep.address,
    guardian: dep.guardian,
    reporter: dep.reporter,
    challengeWindow: dep.challengeWindow,
    deployTx: dep.deployTx,
    readingCount: n,
    nextToSettle: toNum(nextToSettle),
    totalPaid: (totalPaid as bigint).toString(),
    sites,
    readings,
    payouts,
    funded,
  };
}

export async function GET() {
  const dir = path.join(process.cwd(), "deployments");
  const deps: Deployment[] = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
    : [];
  deps.sort((a, b) => (a.network === "arc-mainnet" ? -1 : b.network === "arc-mainnet" ? 1 : 0));
  const networks = await Promise.all(
    deps.map((d) => readNetwork(d).catch((err) => ({ key: d.network, address: d.address, error: (err as Error).message })))
  );
  return NextResponse.json({ networks, abi }, { headers: { "cache-control": "public, s-maxage=20, stale-while-revalidate=60" } });
}
