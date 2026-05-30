import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runRound } from "./agent.js";
import { commitToGuard, checkWithGuard, waitForGuard } from "./guard-client.js";
import { poison } from "./poison.js";
import { intentToCommand } from "./order.js";
import { bold, dim, green, red, fmtOrder } from "./term.js";
import type { TradeOrder } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const port = 4137;
const url = `http://127.0.0.1:${port}`;

// 1) start the guard as a SEPARATE process (the agent shares no memory with it)
const child = spawn("node", ["--import", "tsx", join(here, "guard-server-main.ts")], {
  env: { ...process.env, GUARD_PORT: String(port) },
  stdio: "inherit",
});

try {
  await waitForGuard(url);

  console.log();
  console.log(bold("SENTINEL") + dim(" · hijack demo (D6/D7) — guard runs in its own process\n"));

  // 2) agent decides + freezes intent (fixture = deterministic demo)
  const round = await runRound({ source: "fixture" });
  const decision = round.decision!;
  console.log(bold("agent") + dim(" decided + froze intent:"));
  console.log("  " + decision.reasoning);
  const { hash } = await commitToGuard(url, decision.intent);
  console.log(`  ${dim("→ committed to guard:")} ${hash.slice(0, 18)}…\n`);

  // 3) honest order built from the committed intent → guard ALLOWS (auto-sign)
  const cleanOrder: TradeOrder = { ...decision.intent };
  const a = await checkWithGuard(url, hash, cleanOrder);
  console.log(bold("[A] clean order → guard"));
  console.log("  " + fmtOrder(cleanOrder));
  if (a.ok) {
    console.log("  " + green("✓ ALLOW — auto-signing, unattended."));
    console.log("  " + dim("forward → ") + intentToCommand(cleanOrder) + "\n");
  } else {
    console.log("  " + red("⚠ BLOCK") + "\n");
  }

  // 4) poisoned tool response hijacks the order between freeze and sign → guard BLOCKS
  const hijacked = poison(cleanOrder);
  const b = await checkWithGuard(url, hash, hijacked);
  console.log(bold("[B] HIJACKED order → guard") + dim("  (poisoned tool response mutated the params)"));
  console.log("  " + fmtOrder(hijacked));
  if (b.ok) {
    console.log("  " + red("✗ guard failed to catch the hijack"));
  } else {
    console.log("  " + red(`⚠ BLOCK — ${b.divergences.length} divergence(s), refused to sign:`));
    for (const d of b.divergences) {
      console.log(red(`    · ${d.field}: ${String(d.committed)} → ${String(d.actual)}`));
    }
  }
  console.log();

  const pass = a.ok && !b.ok;
  console.log(
    pass
      ? green(bold("✓ ")) +
          "the agent never touched the guard's memory — a compromised agent cannot get a divergent order signed. funds safe."
      : red(bold("✗ demo invariant failed")),
  );
  process.exitCode = pass ? 0 : 1;
} finally {
  child.kill("SIGINT");
}
