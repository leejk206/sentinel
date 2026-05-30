import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { TradeIntent, TradeOrder, GuardVerdict } from "./types.js";
import { commitHash } from "./intent.js";
import { evaluate } from "./guard.js";
import { green, red, dim, bold, fmtOrder } from "./term.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "..", "fixtures");
const load = <T>(name: string): T => JSON.parse(readFileSync(join(fixtures, name), "utf8")) as T;

function report(label: string, intent: TradeIntent, order: TradeOrder, v: GuardVerdict) {
  console.log(bold(label));
  console.log(`    order:  ${fmtOrder(order)}`);
  if (v.ok) {
    console.log(`    ${green("✓ ALLOW")} — matches committed intent. auto-signing, no human in the loop.`);
  } else {
    console.log(`    ${red("⚠ BLOCK")} — ${v.divergences.length} divergence(s), refusing to sign:`);
    for (const d of v.divergences) {
      console.log(red(`      · ${d.field}: ${String(d.committed)} → ${String(d.actual)}`) + dim(`  (${d.reason})`));
    }
  }
  console.log();
}

// ── D1 demo: deterministic intent-integrity guard ────────────────────────────
const intent = load<TradeIntent>("intent.json");
const clean = load<TradeOrder>("order.clean.json");
const hijacked = load<TradeOrder>("order.hijacked.json");

console.log();
console.log(bold("SENTINEL") + dim(" · intent-integrity guard (D1)"));
console.log(dim("  the agent freezes its intent BEFORE untrusted input; the guard blocks any order that diverges.\n"));

console.log(bold("[1] Agent committed intent") + dim("  (in prod: hashed + timestamped on Mantle, before execution)"));
console.log(`    intent: ${fmtOrder(intent)}`);
console.log(dim(`    commit: ${commitHash(intent)}\n`));

report("[2] CLEAN order arrives → guard check", intent, clean, evaluate(intent, clean));
report("[3] HIJACKED order arrives → guard check" + dim("  (poisoned tool response / dependency injection)"), intent, hijacked, evaluate(intent, hijacked));

const blockedHijack = !evaluate(intent, hijacked).ok;
const allowedClean = evaluate(intent, clean).ok;
if (allowedClean && blockedHijack) {
  console.log(green(bold("✓ thesis proven")) + dim(" — deterministic guard allows the real trade and blocks the hijack. funds safe.\n"));
  process.exit(0);
} else {
  console.log(red(bold("✗ guard misbehaved")) + " — check the matcher.\n");
  process.exit(1);
}
