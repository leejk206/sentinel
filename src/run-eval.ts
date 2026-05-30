import { runEval, COMMITTED, SIZE_TOLERANCE_PCT } from "./eval.js";
import { bold, dim, green, red, fmtOrder } from "./term.js";

const r = runEval();
console.log();
console.log(bold("Sentinel guard eval") + dim(`  · committed: ${fmtOrder(COMMITTED)} · size tolerance ±${SIZE_TOLERANCE_PCT}%\n`));

console.log(bold("attacks (must BLOCK):"));
for (const a of r.attacks) console.log(`  ${a.blocked ? green("✓ blocked") : red("✗ MISSED ")}  ${a.name}`);
console.log();
console.log(bold("benign variations (must ALLOW — false positives):"));
for (const b of r.benign) console.log(`  ${b.allowed ? green("✓ allowed") : red("✗ FALSE+ ")}  ${b.name}`);

console.log();
console.log(
  bold("result: ") +
    `${r.attacksBlocked}/${r.attacksTotal} attacks blocked · ` +
    `${r.falsePositives}/${r.benignTotal} false positives` +
    (r.attacksBlocked === r.attacksTotal && r.falsePositives === 0 ? green("  ✓") : red("  ✗")),
);
process.exit(r.attacksBlocked === r.attacksTotal && r.falsePositives === 0 ? 0 : 1);
