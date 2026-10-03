// npm run deploy -- arc-testnet | arc-mainnet
// Deploys OmiFund. The deploy wallet is manager and reporter; the guardian is
// GUARDIAN_ADDRESS (the founder's own wallet), so the reporter can't also veto.
import { ContractFactory, JsonRpcProvider, Wallet, formatUnits } from "ethers";
import { compile } from "./compile.mjs";
import { loadEnv, network, writeDeployment } from "./env.mjs";

loadEnv();
const net = network();
const CHALLENGE_WINDOW = 3600;

const provider = new JsonRpcProvider(net.rpc, net.chainId);
const wallet = new Wallet(process.env.DEPLOYER_KEY, provider);
const guardian = process.env.GUARDIAN_ADDRESS;
const bal = await provider.getBalance(wallet.address);
console.log(`${net.name}: deployer ${wallet.address} holds ${formatUnits(bal, 18)} USDC (native, 18 decimals)`);
if (bal === 0n) throw new Error("The deploy wallet has no USDC for gas. Fund it first.");

const { OmiFund } = compile();
const factory = new ContractFactory(OmiFund.abi, OmiFund.bytecode, wallet);
const contract = await factory.deploy(net.usdc, wallet.address, wallet.address, guardian, CHALLENGE_WINDOW);
const tx = contract.deploymentTransaction();
console.log(`deploy tx ${tx.hash}`);
const receipt = await tx.wait();
const address = await contract.getAddress();
writeDeployment(net, {
  network: net.key,
  chainId: net.chainId,
  address,
  usdc: net.usdc,
  manager: wallet.address,
  reporter: wallet.address,
  guardian,
  challengeWindow: CHALLENGE_WINDOW,
  deployTx: tx.hash,
  deployBlock: receipt.blockNumber,
  compiler: OmiFund.compiler,
  deployedAt: new Date().toISOString(),
});
console.log(`OmiFund at ${address} (block ${receipt.blockNumber})\n${net.explorer}/address/${address}`);
