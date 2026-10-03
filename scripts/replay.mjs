// npm run replay -- arc-testnet [post|settle]
// Replays the 2022 Lokoja flood through the live contract on testnet: posts the
// river's recorded daily flow for 12 to 24 September 2022 to the replay site,
// then (an hour later, after the challenge window) settles them so the payout
// rule fires on-chain exactly where it would have.
//
// The replay posts a forecast of 0, so only the full payout (which depends on
// the recorded flow) can fire. Archived GloFAS forecasts aren't public, and we
// won't pretend to know what the forecast said.
import fs from "node:fs";
import path from "node:path";
import { Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from "ethers";
import { compile } from "./compile.mjs";
import { loadEnv, network, readDeployment, root } from "./env.mjs";

loadEnv();
const net = network();
const step = process.argv.find((a) => a === "post" || a === "settle") ?? "post";
const dep = readDeployment(net);
const site = (dep.sites ?? []).find((s) => s.kind === "replay-2022");
if (!site) throw new Error("No replay site on this network.");
const provider = new JsonRpcProvider(net.rpc, net.chainId);
const wallet = new Wallet(process.env.DEPLOYER_KEY, provider);
const { OmiFund } = compile();
const fund = new Contract(dep.address, OmiFund.abi, wallet);

if (step === "post") {
  const featured = JSON.parse(fs.readFileSync(path.join(root, "data/featured.json"), "utf8"));
  const r = featured.lokoja;
  const days = r.replays.find((p) => p.year === 2022).days.filter(([d]) => d >= "2022-09-12" && d <= "2022-09-24");
  const source = `https://flood-api.open-meteo.com/v1/flood?latitude=${r.cell.lat}&longitude=${r.cell.lon}&daily=river_discharge&start_date=1984-01-01&end_date=2025-12-31&cell_selection=nearest`;
  const s = await fund.site(site.id);
  let nonce = await provider.getTransactionCount(wallet.address);
  for (const [date, q] of days) {
    const day = Math.floor(Date.parse(date + "T00:00:00Z") / 86_400_000);
    if (day <= Number(s.lastPostedDay)) continue;
    const sourceHash = keccak256(toUtf8Bytes(`${source}#${date}=${q}`));
    const tx = await fund.postReading(site.id, day, q, 0, sourceHash, { nonce: nonce++ });
    await tx.wait();
    console.log(`posted ${date}: ${q} m3/s ${q >= r.floodLevel ? "(at/above flood level)" : ""} tx ${tx.hash}`);
  }
  console.log("Wait one hour (the challenge window), then run: npm run replay -- arc-testnet settle");
} else {
  const tx = await fund.settleReady(50);
  const receipt = await tx.wait();
  const payouts = receipt.logs.map((l) => { try { return fund.interface.parseLog(l); } catch { return null; } }).filter((e) => e?.name === "Payout");
  console.log(`settled (tx ${tx.hash}); payouts: ${payouts.map((p) => `${p.args.perHousehold} to each of ${p.args.households}`).join(", ") || "none yet"}`);
}
