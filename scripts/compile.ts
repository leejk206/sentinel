import solc from "solc";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const src = readFileSync(join(root, "contracts", "IntentCommitLog.sol"), "utf8");

const input = {
  language: "Solidity",
  sources: { "IntentCommitLog.sol": { content: src } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

interface SolcError {
  severity: string;
  formattedMessage: string;
}
const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errors: SolcError[] = (out.errors ?? []).filter((e: SolcError) => e.severity === "error");
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}
for (const w of (out.errors ?? []) as SolcError[]) console.warn(w.formattedMessage);

const c = out.contracts["IntentCommitLog.sol"]["IntentCommitLog"];
mkdirSync(join(root, "artifacts"), { recursive: true });
writeFileSync(
  join(root, "artifacts", "IntentCommitLog.json"),
  JSON.stringify({ abi: c.abi, bytecode: "0x" + c.evm.bytecode.object }, null, 2),
);
console.log(`compiled → artifacts/IntentCommitLog.json (solc ${solc.version()})`);
