import { deploy, mantleSepolia } from "../src/commit-chain.js";

// Deploy IntentCommitLog to Mantle Sepolia testnet.
// Requires: DEPLOYER_PRIVATE_KEY (testnet key, funded via the Mantle Sepolia faucet)
//           MANTLE_RPC_URL (optional; defaults to the public Sepolia RPC)
const address = await deploy();
console.log(`\nIntentCommitLog deployed → ${address}`);
console.log(`explorer: ${mantleSepolia.blockExplorers.default.url}/address/${address}`);
console.log(`\nadd to .env:\n  INTENT_LOG_ADDRESS=${address}\n`);
