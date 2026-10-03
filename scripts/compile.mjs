// Compiles the contracts with solc and writes artifacts/<Name>.json plus the
// ABI the web app imports. Run: npm run compile
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = { OmiFund: "contracts/OmiFund.sol", MockUSDC: "contracts/mocks/MockUSDC.sol" };
export const SETTINGS = { optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: "shanghai" };
const OUTPUT = { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"] } };

export function standardInput() {
  return {
    language: "Solidity",
    sources: Object.fromEntries(Object.values(SOURCES).map((f) => [f, { content: fs.readFileSync(path.join(root, f), "utf8") }])),
    settings: { ...SETTINGS, outputSelection: OUTPUT },
  };
}

let cached;
export function compile() {
  if (cached) return cached;
  const output = JSON.parse(solc.compile(JSON.stringify(standardInput())));
  const errors = (output.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join("\n"));
  fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
  const out = {};
  for (const [name, source] of Object.entries(SOURCES)) {
    const c = output.contracts[source][name];
    out[name] = {
      contractName: name,
      sourceName: source,
      compiler: solc.version(),
      abi: c.abi,
      bytecode: "0x" + c.evm.bytecode.object,
      deployedBytecode: "0x" + c.evm.deployedBytecode.object,
      metadata: c.metadata,
    };
    fs.writeFileSync(path.join(root, `artifacts/${name}.json`), JSON.stringify(out[name], null, 2));
  }
  fs.mkdirSync(path.join(root, "lib/generated"), { recursive: true });
  fs.writeFileSync(path.join(root, "lib/generated/omiFundAbi.json"), JSON.stringify(out.OmiFund.abi, null, 2));
  return (cached = out);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = compile();
  console.log(`Compiled ${Object.keys(a).join(", ")} with solc ${a.OmiFund.compiler}`);
}
