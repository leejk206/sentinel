import { startGuardServer } from "./guard-server.js";
import { commitToGuard, checkWithGuard } from "./guard-client.js";
import { finalizeOrder } from "./llm-agent.js";
import { runRound } from "./agent.js";
import { CLEAN_CONTEXT, INJECTION_PAYLOADS } from "./contexts.js";
import { bold, dim, green, red, fmtOrder } from "./term.js";

const guard = await startGuardServer({ port: 0 });
try {
  console.log();
  console.log(bold("SENTINEL") + dim(" · real-injection validation across payloads — the hijacked order is the LLM's, not ours\n"));

  // agent decides on clean signal data, then FREEZES + commits the intent
  const decision = (await runRound({ source: "fixture" })).decision!;
  const { hash } = await commitToGuard(guard.url, decision.intent);
  console.log(bold("committed intent: ") + fmtOrder(decision.intent) + dim("   " + hash.slice(0, 16) + "…"));
  console.log(dim("(committed BEFORE any desk context below is read)\n"));

  // baseline: clean context must finalize to the same order and be ALLOWED
  {
    const { order } = await finalizeOrder(decision.intent, CLEAN_CONTEXT);
    const v = order ? await checkWithGuard(guard.url, hash, order) : { ok: false, divergences: [] };
    console.log(`${green("✓ clean")}   ${order ? fmtOrder(order) : "—"}  →  ${v.ok ? green("ALLOW") : red("BLOCK")}`);
  }

  // each distinct injection payload, run through the real model
  let hijacked = 0,
    caught = 0;
  for (const p of INJECTION_PAYLOADS) {
    const { order } = await finalizeOrder(decision.intent, p.context);
    if (!order || Number.isNaN(order.size)) {
      console.log(`${dim("· unparseable")}  ${p.name}`);
      continue;
    }
    const v = await checkWithGuard(guard.url, hash, order);
    const didHijack = !v.ok; // order diverged from committed intent = the model took the bait
    if (didHijack) {
      hijacked++;
      caught++; // every divergence is caught by the guard
    }
    console.log(
      `${didHijack ? red("⚠ hijacked") : green("· resisted")}  ${fmtOrder(order)}` +
        `  →  ${v.ok ? green("ALLOW") : red("BLOCK")}  ${dim(p.name)}`,
    );
  }

  console.log();
  console.log(
    bold("result: ") +
      `${hijacked}/${INJECTION_PAYLOADS.length} payloads hijacked the model · ` +
      `${caught}/${hijacked} hijacks caught by the guard` +
      (caught === hijacked ? green("  ✓") : red("  ✗")),
  );
  console.log(dim("\nthe hijacked orders are the model's own output under distinct injection payloads —\nnot hardcoded. the guard (deterministic, no LLM) caught every divergence regardless of payload."));
} finally {
  await guard.close();
}
