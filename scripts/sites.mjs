// npm run sites -- arc-testnet [cover-usdc] [fund-usdc]
// Opens the Lokoja site with the levels computed from the river's history
// (data/featured.json), registers the demo households, and funds it.
//
// On testnet it also opens a second site, "Lokoja 2022 replay", used to replay
// the 2022 flood through the live contract (scripts/replay.mjs).
import fs from "node:fs";
import path from "node:path";
import { Contract, JsonRpcProvider, Wallet, parseUnits } from "ethers";
import { compile } from "./compile.mjs";
import { loadEnv, network, readDeployment, root, writeDeployment } from "./env.mjs";

loadEnv();
const net = network();
const args = process.argv.slice(2).filter((a) => !a.startsWith("arc-"));
const cover = parseUnits(args[0] ?? "1", 6);
const fundEach = parseUnits(args[1] ?? "3", 6);
const dep = readDeployment(net);
const provider = new JsonRpcProvider(net.rpc, net.chainId);
const wallet = new Wallet(process.env.DEPLOYER_KEY, provider);
const { OmiFund } = compile();
const fund = new Contract(dep.address, OmiFund.abi, wallet);
const usdc = new Contract(net.usdc, ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"], wallet);

const featured = JSON.parse(fs.readFileSync(path.join(root, "data/featured.json"), "utf8"));
const lok = featured.lokoja;
const households = Object.keys(process.env)
  .filter((k) => k.startsWith("DEMO_HOUSEHOLD_"))
  .sort()
  .map((k) => new Wallet(process.env[k]).address);

const now = Math.floor(Date.now() / 1000);
const start = now + 15 * 60; // households are frozen when this passes
const end = Math.floor(Date.parse("2026-12-31T23:59:59Z") / 1000);

async function open(name, homes) {
  const id = Number(await fund.siteCount());
  const tx = await fund.addSite(
    name,
    Math.round(lok.cell.lat * 1e4),
    Math.round(lok.cell.lon * 1e4),
    lok.floodLevel,
    lok.warnLevel,
    start,
    end,
    cover,
    lok.rules.earlyShareBps,
    lok.rules.consecutiveDays
  );
  await tx.wait();
  await (await fund.addHouseholds(id, homes)).wait();
  await (await usdc.approve(dep.address, fundEach)).wait();
  await (await fund.fund(id, fundEach)).wait();
  console.log(`site ${id} "${name}": flood level ${lok.floodLevel} m3/s, ${homes.length} households, funded ${args[1] ?? "3"} USDC`);
  return id;
}

const sites = [];
sites.push({ id: await open("Lokoja, Kogi State, Nigeria", households.slice(0, 3)), slug: "lokoja", kind: "live" });
if (net.key === "arc-testnet") {
  sites.push({ id: await open("Lokoja 2022 replay", households.slice(3, 5)), slug: "lokoja", kind: "replay-2022" });
}
writeDeployment(net, { ...dep, sites, seasonStart: start, seasonEnd: end });
console.log(`Season opens ${new Date(start * 1000).toISOString()}; households are frozen from then.`);
