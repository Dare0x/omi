"use client";

// Opens a new OMI fund for the river in the report, from the visitor's own
// wallet: site with the computed levels -> households -> first money in.
// Whoever opens the site manages it; nobody else (us included) can change it.

import { useEffect, useState } from "react";
import { BrowserProvider, Contract, Interface, isAddress, parseUnits, type Eip1193Provider } from "ethers";
import { fmt } from "@/components/Charts";
import type { RiverReport } from "@/lib/river";

interface NetInfo {
  key: string;
  name: string;
  chainId: number;
  rpc: string;
  explorer: string;
  usdc: string;
  address: string;
  error?: string;
}
type Wallet = Eip1193Provider & { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
const getWallet = () => (typeof window === "undefined" ? undefined : (window as unknown as { ethereum?: Wallet }).ethereum);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export default function OpenFund({ r, label }: { r: RiverReport; label: string }) {
  const [nets, setNets] = useState<NetInfo[]>([]);
  const [abi, setAbi] = useState<unknown[]>([]);
  const [netKey, setNetKey] = useState("");
  const [name, setName] = useState(label.slice(0, 60));
  const [cover, setCover] = useState("50");
  const [start, setStart] = useState(isoDay(new Date(Date.now() + 2 * 86_400_000)));
  const [end, setEnd] = useState(`${new Date().getUTCFullYear()}-12-31`);
  const [homes, setHomes] = useState("");
  const [amount, setAmount] = useState("10");
  const [siteId, setSiteId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/fund")
      .then((res) => res.json())
      .then((b: { networks: NetInfo[]; abi: unknown[] }) => {
        const ok = b.networks.filter((n) => !n.error);
        setNets(ok);
        setAbi(b.abi);
        if (ok.length) setNetKey(ok.find((n) => n.key === "arc-testnet")?.key ?? ok[0].key);
      })
      .catch(() => {});
  }, []);

  const net = nets.find((n) => n.key === netKey);
  if (!nets.length) return <p className="small faint">The fund contract isn&apos;t deployed yet, so new funds can&apos;t be opened from here.</p>;

  const signer = async () => {
    const eth = getWallet();
    if (!eth) throw new Error("No wallet found in this browser. Install MetaMask or Rabby, or open this page in a wallet's browser.");
    if (!net) throw new Error("Choose a network.");
    const hex = "0x" + net.chainId.toString(16);
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    } catch {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId: hex, chainName: net.name, rpcUrls: [net.rpc], blockExplorerUrls: [net.explorer], nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 } }],
      });
    }
    return new BrowserProvider(eth).getSigner();
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (err) {
      setMsg((err as { shortMessage?: string }).shortMessage ?? (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const open = () =>
    run(async () => {
      const s = Math.floor(Date.parse(start + "T00:00:00Z") / 1000);
      const e = Math.floor(Date.parse(end + "T23:59:59Z") / 1000);
      if (!(s > Date.now() / 1000)) throw new Error("The season has to start in the future, so households can be registered first.");
      if (!(e > s)) throw new Error("The season has to end after it starts.");
      const c = parseUnits(cover.trim() || "0", 6);
      if (c <= 0n) throw new Error("Cover per household has to be more than 0 USDC.");
      const w = await signer();
      const fund = new Contract(net!.address, abi as never, w);
      setMsg("Confirm in your wallet…");
      const tx = await fund.addSite(
        name.trim() || label,
        Math.round(r.cell.lat * 1e4),
        Math.round(r.cell.lon * 1e4),
        r.floodLevel,
        r.warnLevel,
        s,
        e,
        c,
        r.rules.earlyShareBps,
        r.rules.consecutiveDays
      );
      const receipt = await tx.wait();
      const iface = new Interface(abi as never);
      const ev = receipt.logs.map((l: { topics: string[]; data: string }) => { try { return iface.parseLog(l); } catch { return null; } }).find((x: { name?: string } | null) => x?.name === "SiteAdded");
      const id = ev ? Number(ev.args.siteId) : null;
      setSiteId(id);
      setMsg(`Fund opened as site ${id}. You manage it. Now register the households before ${start}.`);
    });

  const addHomes = () =>
    run(async () => {
      const list = homes.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
      const bad = list.filter((a) => !isAddress(a));
      if (!list.length) throw new Error("Paste at least one wallet address.");
      if (bad.length) throw new Error(`These aren't wallet addresses: ${bad.slice(0, 3).join(", ")}`);
      const fund = new Contract(net!.address, abi as never, await signer());
      setMsg("Confirm in your wallet…");
      await (await fund.addHouseholds(siteId, list)).wait();
      setMsg(`${list.length} households registered. They're fixed once the season starts.`);
      setHomes("");
    });

  const give = () =>
    run(async () => {
      const v = parseUnits(amount.trim() || "0", 6);
      if (v <= 0n) throw new Error("Type an amount in USDC.");
      const w = await signer();
      setMsg("Approve the USDC in your wallet…");
      await (await new Contract(net!.usdc, ["function approve(address,uint256) returns (bool)"], w).approve(net!.address, v)).wait();
      setMsg("Now confirm the transfer…");
      await (await new Contract(net!.address, abi as never, w).fund(siteId, v)).wait();
      setMsg(`${amount} USDC is now held for site ${siteId}. It can only ever go to its households, by the river's rule.`);
    });

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <p className="muted">
        Open a fund for this river from your own wallet. It uses the levels above: flood level {fmt(r.floodLevel)} m³/s, warning{" "}
        {fmt(r.warnLevel)} m³/s, {r.rules.earlyShareBps / 100}% on the forecast and the rest after {r.rules.consecutiveDays} days over the flood
        level. You become its manager; nobody else can change it.
      </p>
      {siteId === null ? (
        <div className="calc">
          {nets.length > 1 && (
            <label className="field">
              Network
              <select value={netKey} onChange={(e) => setNetKey(e.target.value)} className="btn" style={{ textAlign: "left" }}>
                {nets.map((n) => (
                  <option key={n.key} value={n.key}>
                    {n.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            Fund name
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} style={{ width: 240 }} />
          </label>
          <label className="field">
            Cover per household, USDC
            <input inputMode="decimal" value={cover} onChange={(e) => setCover(e.target.value)} />
          </label>
          <label className="field">
            Season starts (UTC)
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="field">
            Season ends (UTC)
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <button className="btn primary" type="button" disabled={busy} onClick={open}>
            {busy ? "Waiting for wallet…" : `Open fund on ${net?.name ?? "Arc"}`}
          </button>
        </div>
      ) : (
        <>
          <div className="calc">
            <label className="field" style={{ flexBasis: "100%" }}>
              Household wallets, one per line (up to 500)
              <textarea
                value={homes}
                onChange={(e) => setHomes(e.target.value)}
                rows={4}
                style={{ width: "100%", maxWidth: 640, background: "var(--surface)", border: "1px solid var(--line-2)", color: "var(--text)", font: "13px var(--mono)", padding: 10 }}
              />
            </label>
            <button className="btn" type="button" disabled={busy} onClick={addHomes}>
              Register households
            </button>
          </div>
          <div className="calc">
            <label className="field">
              Put money in, USDC
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <button className="btn primary" type="button" disabled={busy} onClick={give}>
              Fund site {siteId}
            </button>
          </div>
          {net && (
            <p className="small faint">
              Contract{" "}
              <a className="hex" href={`${net.explorer}/address/${net.address}`} target="_blank" rel="noreferrer">
                {short(net.address)}
              </a>{" "}
              on {net.name}. The daily reporter picks up every open fund automatically.
            </p>
          )}
        </>
      )}
      {msg && <p className="small muted">{msg}</p>}
    </div>
  );
}
