// Arc networks. USDC is Arc's gas token; it also has a fixed ERC-20 interface
// (6 decimals) at the same address on both networks.

export type NetKey = "arc-testnet" | "arc-mainnet";

export interface Network {
  key: NetKey;
  name: string;
  chainId: number;
  rpc: string;
  explorer: string;
  usdc: string;
}

export const NETWORKS: Record<NetKey, Network> = {
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
