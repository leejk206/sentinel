import { runRound } from "./agent.js";
import type { SignalSource } from "./signals.js";
import type { RiskProfile } from "./signals.js";
import { commitHash } from "./intent.js";
import { bold, dim, green, yellow, fmtOrder } from "./term.js";

// ── arg parsing (tiny) ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const arg = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
};
const source = (arg("source", "auto") as SignalSource);
const rounds = Number(arg("rounds", "1"));
const profile = arg("profile") as RiskProfile | undefined;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

console.log();
console.log(bold("SENTINEL agent") + dim(" · autonomous Byreal loop (D2)"));
console.log(dim("  scan → decide → FREEZE intent. running unattended; no human in the loop.\n"));

for (let i = 1; i <= rounds; i++) {
  const r = await runRound({ source, strategy: profile ? { profile } : {} });
  const tag = r.source === "live" ? green("live") : yellow("fixture");
  console.log(bold(`round ${i}`) + dim(`  [signals: ${tag}${dim("")}, scanned ${r.signals.length}]`));

  if (!r.decision) {
    console.log(dim("  no qualifying signal this round — standing down.\n"));
  } else {
    console.log(`  ${dim("reasoning:")} ${r.decision.reasoning}`);
    console.log(`  ${dim("↓ intent frozen (committed before execution)")}`);
    console.log(`  ${bold("intent:")} ${fmtOrder(r.decision.intent)}`);
    console.log(`  ${dim("commit:")} ${r.commit}`);
    // sanity: the commit really is the hash of this intent
    if (r.commit !== commitHash(r.decision.intent)) throw new Error("commit mismatch");

    // optional: anchor the commitment on Mantle (only when configured + deployed)
    if (process.env.INTENT_LOG_ADDRESS && process.env.DEPLOYER_PRIVATE_KEY) {
      const { commitIntentHash, intentHashHex } = await import("./commit-chain.js");
      const receipt = await commitIntentHash(
        process.env.INTENT_LOG_ADDRESS as `0x${string}`,
        intentHashHex(r.decision.intent),
      );
      console.log(`  ${green("⛓ committed on Mantle:")} ${receipt.transactionHash}`);
    }
    console.log(dim("  (next: build order → guard → sign — D6/D7)\n"));
  }
  if (i < rounds) await sleep(source === "fixture" ? 400 : 1500);
}
