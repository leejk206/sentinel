import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { TradeIntent } from "./types.js";
import { commitHash } from "./intent.js";

const here = dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(
  readFileSync(join(here, "..", "artifacts", "IntentCommitLog.json"), "utf8"),
) as { abi: unknown[]; bytecode: Hex };

export const abi = artifact.abi;
export const bytecode = artifact.bytecode;

/** Mantle Sepolia testnet (defined inline to avoid viem-version export drift). */
export const mantleSepolia = defineChain({
  id: 5003,
  name: "Mantle Sepolia Testnet",
  nativeCurrency: { name: "Mantle", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.sepolia.mantle.xyz"] } },
  blockExplorers: { default: { name: "Mantlescan", url: "https://sepolia.mantlescan.xyz" } },
  testnet: true,
});

/** 0x-prefixed bytes32 of the canonical intent — what gets committed on-chain. */
export function intentHashHex(intent: TradeIntent): Hex {
  return `0x${commitHash(intent)}`;
}

function rpc(url = process.env.MANTLE_RPC_URL): string {
  return url ?? mantleSepolia.rpcUrls.default.http[0];
}

export function publicClient(url?: string) {
  return createPublicClient({ chain: mantleSepolia, transport: http(rpc(url)) });
}

export function walletClient(key = process.env.DEPLOYER_PRIVATE_KEY, url?: string) {
  if (!key) throw new Error("DEPLOYER_PRIVATE_KEY not set (testnet key; fund via Mantle Sepolia faucet)");
  return createWalletClient({
    account: privateKeyToAccount(key as Hex),
    chain: mantleSepolia,
    transport: http(rpc(url)),
  });
}

export async function deploy(): Promise<Address> {
  const wc = walletClient();
  const pc = publicClient();
  const hash = await wc.deployContract({ abi, bytecode, args: [] });
  const receipt = await pc.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error("deploy: no contract address in receipt");
  return receipt.contractAddress;
}

export async function commitIntentHash(address: Address, intentHash: Hex) {
  const wc = walletClient();
  const pc = publicClient();
  const hash = await wc.writeContract({ address, abi, functionName: "commit", args: [intentHash] });
  return pc.waitForTransactionReceipt({ hash });
}

export async function commitmentOf(address: Address, intentHash: Hex) {
  const [committer, timestamp, exists] = (await publicClient().readContract({
    address,
    abi,
    functionName: "commitmentOf",
    args: [intentHash],
  })) as [Address, bigint, boolean];
  return { committer, timestamp, exists };
}
