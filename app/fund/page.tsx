"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BrowserProvider, Contract, formatUnits, parseUnits, type Eip1193Provider } from "ethers";
import { fmt } from "@/components/Charts";

interface Site {
  id: number;
  kind: string;
  name: string;
  lat: number;
  lon: number;
  floodLevel: number;
  warnLevel: number;
  seasonStart: number;
  seasonEnd: number;
  cover: string;
  earlyBps: number;
  consecutiveDays: number;
  earlyPaid: boolean;
  fullPaid: boolean;
  paidPerHousehold: string;
  balance: string;
  lastPostedDay: number;
  streak: number;
  households: string[];
}
interface Reading {
  id: number;
  siteId: number;
  date: string;
  observed: number;
  forecastMedianMax: number;
  sourceHash: string;
  readyAt: number;
  vetoed: boolean;
  settled: boolean;
}
interface Net {
  key: string;
  name: string;
  chainId: number;
  rpc: string;
  explorer: string;
  usdc: string;
  address: string;
  guardian: string;
  reporter: string;
  challengeWindow: number;
  deployTx: string;
  readingCount: number;
  nextToSettle: number;
  totalPaid: string;
  sites: Site[];
  readings: Reading[];
  payouts: { siteId: number; kind: number; perHousehold: string; households: number; total: string; tx: string }[];
  funded: { siteId: number; donor: string; amount: string; tx: string }[];
  error?: string;
}

const usd = (v: string | bigint) => Number(formatUnits(v, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 });
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const day = (s: number) => new Date(s * 1000).toUTCString().slice(5, 16);

type Wallet = Eip1193Provider & { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
const wallet = () => (typeof window === "undefined" ? undefined : (window as unknown as { ethereum?: Wallet }).ethereum);

export default function FundPage() {
  const [data, setData] = useState<{ networks: Net[]; abi: unknown[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/fund")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError("Couldn't read the fund from Arc. Reload in a minute."));
  }, []);
  useEffect(load, [load]);

  return (
    <main>
      <section className="hero">
        <p className="kicker">The fund, live on Arc</p>
        <h1>Every dollar in, every reading, every payout.</h1>
        <p className="lede">
          Read straight from the OmiFund contract. Money can leave it one way only: to the registered households of a site whose river met the
          rule. There is no withdraw function, for anyone.
        </p>
      </section>
      {error && <p className="problem">{error}</p>}
      {!data && !error && (
        <section className="section">
          <p className="muted">Reading the contract on Arc…</p>
        </section>
      )}
      {data && data.networks.length === 0 && (
        <section className="section">
          <p className="muted">The fund isn&apos;t deployed yet.</p>
        </section>
      )}
      {data?.networks.map((n) =>
        n.error ? (
          <section className="section" key={n.key}>
            <p className="problem">
              Couldn&apos;t read {n.key}: {n.error}
            </p>
          </section>
        ) : (
          <NetworkView key={n.key} n={n} abi={data.abi} reload={load} />
        )
      )}
    </main>
  );
}

function NetworkView({ n, abi, reload }: { n: Net; abi: unknown[]; reload: () => void }) {
  return (
    <section className="section" aria-label={n.name}>
      <div className="section-head">
        <h2>{n.name}</h2>
        <p>
          OmiFund at{" "}
          <a className="hex" href={`${n.explorer}/address/${n.address}`} target="_blank" rel="noreferrer">
            {n.address}
          </a>
          . Paid out so far: <span className="num">{usd(n.totalPaid)} USDC</span>. Each reading waits {n.challengeWindow / 60} minutes before it
          can move money; guardian <span className="hex">{short(n.guardian)}</span> can stop one in that time.
        </p>
      </div>
      {n.sites.map((s) => (
        <SiteView key={s.id} n={n} s={s} abi={abi} reload={reload} />
      ))}
    </section>
  );
}

function SiteView({ n, s, abi, reload }: { n: Net; s: Site; abi: unknown[]; reload: () => void }) {
  const readings = n.readings.filter((r) => r.siteId === s.id);
  const payouts = n.payouts.filter((p) => p.siteId === s.id);
  const now = Date.now() / 1000;
  const state = s.fullPaid
    ? "Paid in full this season"
    : s.earlyPaid
      ? "Early payout sent; the rest waits for the river"
      : now < s.seasonStart
        ? `Season opens ${day(s.seasonStart)}`
        : now > s.seasonEnd
          ? "Season over"
          : "In season, watching the river";
  return (
    <div style={{ display: "grid", gap: 14, paddingTop: 18 }}>
      <div className="gauge-top">
        <div className="place">
          <b>{s.name}</b>{" "}
          <span className="faint">
            · site {s.id} · river cell {s.lat}, {s.lon}
            {s.kind === "replay-2022" ? " · replaying the recorded 2022 flood through the contract" : ""}
          </span>
        </div>
        <div className="phase" data-phase={s.fullPaid || s.earlyPaid ? "flood" : "normal"}>
          {state}
        </div>
      </div>
      <div className="figures">
        <div className="figure">
          <span className="label">Held for this site</span>
          <span className="value">
            {usd(s.balance)}
            <small>USDC</small>
          </span>
        </div>
        <div className="figure">
          <span className="label">Households</span>
          <span className="value">{s.households.length}</span>
        </div>
        <div className="figure">
          <span className="label">Cover each, per season</span>
          <span className="value">
            {usd(s.cover)}
            <small>USDC</small>
          </span>
        </div>
        <div className="figure" data-tone="flood">
          <span className="label">Flood level</span>
          <span className="value">
            {fmt(s.floodLevel)}
            <small>m³/s</small>
          </span>
        </div>
      </div>
      <p className="small faint">
        Season {day(s.seasonStart)} to {day(s.seasonEnd)} UTC · {s.earlyBps / 100}% on the forecast, the rest after {s.consecutiveDays} days at or above the
        flood level · households:{" "}
        {s.households.map((h, i) => (
          <span key={h}>
            {i > 0 && ", "}
            <a className="hex" href={`${n.explorer}/address/${h}`} target="_blank" rel="noreferrer">
              {short(h)}
            </a>
          </span>
        ))}
      </p>
      {payouts.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Payout</th>
                <th className="num">Each household</th>
                <th className="num">Households</th>
                <th className="num">Total</th>
                <th>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.tx + p.kind} className="paid">
                  <td>{p.kind === 0 ? "Early (forecast)" : "Full (river)"}</td>
                  <td className="num">{usd(p.perHousehold)} USDC</td>
                  <td className="num">{p.households}</td>
                  <td className="num">{usd(p.total)} USDC</td>
                  <td>
                    <a className="hex" href={`${n.explorer}/tx/${p.tx}`} target="_blank" rel="noreferrer">
                      {short(p.tx)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {readings.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>River day</th>
                <th className="num">Flow, m³/s</th>
                <th className="num">Forecast high, 15 days</th>
                <th>State</th>
                <th>Source fingerprint</th>
              </tr>
            </thead>
            <tbody>
              {readings.map((r) => (
                <tr key={r.id}>
                  <td className="num">{r.date}</td>
                  <td className="num" style={{ color: r.observed >= s.floodLevel ? "var(--flood)" : undefined }}>
                    {fmt(r.observed)}
                  </td>
                  <td className="num">{r.forecastMedianMax ? fmt(r.forecastMedianMax) : "–"}</td>
                  <td>
                    {r.vetoed
                      ? "Vetoed"
                      : r.settled
                        ? "Settled"
                        : r.readyAt * 1000 > Date.now()
                          ? `Waiting until ${new Date(r.readyAt * 1000).toUTCString().slice(17, 22)} UTC`
                          : "Ready to settle"}
                  </td>
                  <td className="hex faint">{r.sourceHash.slice(0, 14)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="small faint">No readings posted yet this season.</p>
      )}
      <Donate n={n} s={s} abi={abi} reload={reload} />
      <p className="small">
        <Link href={`/river?lat=${s.lat}&lon=${s.lon}&name=${encodeURIComponent(s.name)}`}>This river&apos;s full report →</Link>
      </p>
    </div>
  );
}

function Donate({ n, s, abi, reload }: { n: Net; s: Site; abi: unknown[]; reload: () => void }) {
  const [amount, setAmount] = useState("1");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const give = async () => {
    setMsg(null);
    const eth = wallet();
    if (!eth) {
      setMsg("No wallet found in this browser. Install MetaMask or Rabby, or open this page in a wallet's browser.");
      return;
    }
    let value: bigint;
    try {
      value = parseUnits(amount.trim(), 6);
      if (value <= 0n) throw new Error();
    } catch {
      setMsg("Type an amount in USDC, like 5.");
      return;
    }
    setBusy(true);
    try {
      const hex = "0x" + n.chainId.toString(16);
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
      } catch {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [{ chainId: hex, chainName: n.name, rpcUrls: [n.rpc], blockExplorerUrls: [n.explorer], nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 } }],
        });
      }
      const signer = await new BrowserProvider(eth).getSigner();
      const token = new Contract(n.usdc, ["function approve(address,uint256) returns (bool)"], signer);
      setMsg("Approve the USDC in your wallet…");
      await (await token.approve(n.address, value)).wait();
      setMsg("Now confirm the gift…");
      const fund = new Contract(n.address, abi as never, signer);
      const tx = await fund.fund(s.id, value);
      await tx.wait();
      setMsg(`Thank you. ${amount} USDC is now held for ${s.name}. Transaction ${short(tx.hash)}.`);
      reload();
    } catch (err) {
      setMsg((err as { shortMessage?: string }).shortMessage ?? (err as Error).message ?? "The wallet didn't complete the transaction.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="calc">
      <label className="field">
        Fund this site, USDC
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <button className="btn primary" type="button" onClick={give} disabled={busy}>
        {busy ? "Waiting for wallet…" : `Give on ${n.name}`}
      </button>
      {msg && (
        <p className="small muted" style={{ flexBasis: "100%" }}>
          {msg}
        </p>
      )}
    </div>
  );
}
