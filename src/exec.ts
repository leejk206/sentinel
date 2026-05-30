import { spawn } from "node:child_process";
import { parseOrderArgs, intentToArgv, intentToCommand } from "./order.js";
import { checkWithGuard } from "./guard-client.js";
import { bold, dim, green, red } from "./term.js";

/**
 * sentinel exec — the guard, as a drop-in wrapper around byreal-perps-cli.
 *
 * Attach to ANY Byreal agent: instead of calling
 *     byreal-perps-cli order market short 41.2 NEAR --leverage 3
 * the agent calls
 *     sentinel exec --commit <hash> order market short 41.2 NEAR --leverage 3
 * and Sentinel checks the order against the committed intent (held by the external
 * guard process) BEFORE forwarding. Diverge → blocked. Match → forwarded (or dry-run).
 *
 *   flags (before `order`): --commit <hash>  --guard <url>  --execute
 */
const argv = process.argv.slice(2);
const flag = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined;
};

const commit = flag("commit");
const guardUrl = flag("guard") ?? process.env.GUARD_URL ?? "http://127.0.0.1:4100";
const execute = argv.includes("--execute");

const oi = argv.indexOf("order");
if (!commit || oi < 0) {
  console.error("usage: sentinel exec --commit <hash> [--guard <url>] [--execute] order market <side> <size> <coin> [--leverage N] [--tp X] [--sl Y]");
  process.exit(2);
}

const order = parseOrderArgs(argv.slice(oi));
const verdict = await checkWithGuard(guardUrl, commit, order);

if (!verdict.ok) {
  console.log(red(bold("⚠ BLOCK")) + dim(" — order diverges from committed intent; not signing:"));
  for (const d of verdict.divergences) {
    console.log(red(`  · ${d.field}: ${String(d.committed)} → ${String(d.actual)}`));
  }
  process.exit(1);
}

console.log(green(bold("✓ ALLOW")) + dim(" — matches committed intent."));
if (execute) {
  console.log(dim("forwarding → ") + intentToCommand(order));
  const child = spawn("byreal-perps-cli", intentToArgv(order), { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  console.log(dim("dry-run → would sign: ") + intentToCommand(order));
  process.exit(0);
}
