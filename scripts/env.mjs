// Loads .env (no dependency) and the network config for the deploy scripts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function loadEnv() {
  const file = path.join(root, ".env");
  // In CI the key arrives as an environment variable (a GitHub Actions secret).
  if (!fs.existsSync(file) && process.env.DEPLOYER_KEY) return;
  if (!fs.existsSync(file)) throw new Error("No .env file. It holds the deploy key and is never committed.");
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

export const NETWORKS = {
  "arc-testnet": {
    key: "arc-testnet",
    name: "Arc testnet",
    chainId: 5042002,
    rpc: "https://rpc.testnet.arc.io",
    explorer: "https://explorer.testnet.arc.io",
    usdc: "0x3600000000000000000000000000000000000000",
  },
  "arc-mainnet": {
    key: "arc-mainnet",
    name: "Arc mainnet",
    chainId: 5042,
    rpc: "https://rpc.mainnet.arc.io",
    explorer: "https://explorer.arc.io",
    usdc: "0x3600000000000000000000000000000000000000",
  },
};

export function network(argv = process.argv.slice(2)) {
  const key = argv.find((a) => a.startsWith("arc-")) ?? "arc-testnet";
  const net = NETWORKS[key];
  if (!net) throw new Error(`Unknown network ${key}. Use arc-testnet or arc-mainnet.`);
  return net;
}

export function deploymentFile(net) {
  return path.join(root, "deployments", `${net.key}.json`);
}

export function readDeployment(net) {
  const f = deploymentFile(net);
  if (!fs.existsSync(f)) throw new Error(`Not deployed on ${net.name} yet. Run npm run deploy -- ${net.key}`);
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

export function writeDeployment(net, data) {
  fs.mkdirSync(path.dirname(deploymentFile(net)), { recursive: true });
  fs.writeFileSync(deploymentFile(net), JSON.stringify(data, null, 2) + "\n");
}
