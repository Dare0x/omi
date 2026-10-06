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

// Arc's free public RPC rate-limits bursts, so reads go one at a time and
// back off when it says "rate limit".
async function retry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const msg = String((err as Error).message ?? err);
      if (!/rate limit|-32005|429|timeout|ECONNRESET/i.test(msg)) throw err;
      await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    }
  }
  throw last;
}

// Multicall3 (same address on most EVM chains, Arc included): many reads in one eth_call.
const MULTICALL = "0xcA11bde05977b3631167028862bE2a173976CA11";
const MULTICALL_ABI = [
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
];
type Call = { fn: string; args: unknown[] };

async function readAll(fund: Contract, provider: JsonRpcProvider, address: string, calls: Call[]) {
  const iface = fund.interface;
  try {
    const mc = new Contract(MULTICALL, MULTICALL_ABI, provider);
    const res = await retry(() =>
      mc.aggregate3.staticCall(calls.map((c) => ({ target: address, allowFailure: false, callData: iface.encodeFunctionData(c.fn, c.args) })))
    );
    return (res as { returnData: string }[]).map((r, i) => iface.decodeFunctionResult(calls[i].fn, r.returnData)[0]);
  } catch {
    // No Multicall3 on this chain: one read at a time.
    const out = [];
    for (const c of calls) out.push(await retry(() => fund.getFunction(c.fn).staticCall(...c.args)));
    return out;
  }
}

type RawLog = { topics: string[]; data: string; transactionHash: string; blockNumber: number };

// Every event of the contract in one request, from the explorer's Etherscan-style API.
// Falls back to scanning the RPC in chunks, newest first, within a time budget.
async function readLogs(dep: Deployment, provider: JsonRpcProvider, latest: number): Promise<{ logs: RawLog[]; complete: boolean }> {
  const net = NETWORKS[dep.network];
  try {
    const url = `${net.explorer}/api?module=logs&action=getLogs&address=${dep.address}&fromBlock=${dep.deployBlock}&toBlock=latest`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
    const j = (await res.json()) as { message?: string; result?: { topics: (string | null)[]; data: string; transactionHash: string; blockNumber: string }[] };
    if (!Array.isArray(j.result)) throw new Error(j.message ?? "no result");
    return {
      logs: j.result.map((l) => ({ topics: l.topics.filter((t): t is string => !!t), data: l.data, transactionHash: l.transactionHash, blockNumber: parseInt(l.blockNumber, 16) })),
      complete: true,
    };
  } catch {
    const logs: RawLog[] = [];
    const deadline = Date.now() + 12_000;
    const step = 9_000;
    let complete = true;
    for (let to = latest; to >= dep.deployBlock; to -= step + 1) {
      if (Date.now() > deadline) { complete = false; break; }
      const from = Math.max(dep.deployBlock, to - step);
      const got = await retry(() => provider.getLogs({ address: dep.address, fromBlock: from, toBlock: to }));
      for (const l of got) logs.push({ topics: [...l.topics], data: l.data, transactionHash: l.transactionHash, blockNumber: l.blockNumber });
    }
    return { logs, complete };
  }
}

async function readNetwork(dep: Deployment) {
  const net = NETWORKS[dep.network];
  const provider = new JsonRpcProvider(net.rpc, net.chainId, { staticNetwork: true, batchMaxCount: 1 });
  const fund = new Contract(dep.address, abi, provider);
  const [siteCount, readingCount, nextToSettle, totalPaid] = await readAll(fund, provider, dep.address, [
    { fn: "siteCount", args: [] },
    { fn: "readingCount", args: [] },
    { fn: "nextToSettle", args: [] },
    { fn: "totalPaid", args: [] },
  ]);
  const latest = await retry(() => provider.getBlockNumber());
  const nSites = toNum(siteCount);
  const n = toNum(readingCount);
  const ids = [...Array(Math.min(n, 20)).keys()].map((k) => n - 1 - k);
  const got = await readAll(fund, provider, dep.address, [
    ...[...Array(nSites).keys()].flatMap((id) => [{ fn: "site", args: [id] }, { fn: "households", args: [id] }]),
    ...ids.map((id) => ({ fn: "reading", args: [id] })),
  ]);
  const sites = [];
  for (let id = 0; id < nSites; id++) {
    const s = got[2 * id];
    const hs = got[2 * id + 1];
    sites.push({
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
        households: [...(hs as string[])],
    });
  }
  const readings = ids.map((id, k) => {
    const r = got[2 * nSites + k];
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
  });
  const payouts: { siteId: number; kind: number; perHousehold: string; households: number; total: string; tx: string; block: number }[] = [];
  const funded: { siteId: number; donor: string; amount: string; tx: string; block: number }[] = [];
  const { logs, complete: eventsComplete } = await readLogs(dep, provider, latest);
  for (const l of logs) {
    let e;
    try {
      e = fund.interface.parseLog({ topics: l.topics, data: l.data });
    } catch {
      continue;
    }
    if (e?.name === "Payout")
      payouts.push({
        siteId: toNum(e.args.siteId),
        kind: toNum(e.args.kind),
        perHousehold: e.args.perHousehold.toString(),
        households: toNum(e.args.households),
        total: e.args.total.toString(),
        tx: l.transactionHash,
        block: l.blockNumber,
      });
    else if (e?.name === "Funded")
      funded.push({ siteId: toNum(e.args.siteId), donor: e.args.donor, amount: e.args.amount.toString(), tx: l.transactionHash, block: l.blockNumber });
  }
  payouts.sort((a, b) => a.block - b.block);
  funded.sort((a, b) => a.block - b.block);
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
    eventsComplete,
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
  return NextResponse.json({ networks, abi }, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=3600" } });
}
