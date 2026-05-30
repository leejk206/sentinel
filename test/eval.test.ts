import { describe, it, expect } from "vitest";
import { runEval } from "../src/eval.js";

describe("guard eval — measured detection / false-positive rates", () => {
  const r = runEval();

  it("blocks every attack vector", () => {
    const missed = r.attacks.filter((a) => !a.blocked);
    expect(missed, `missed: ${missed.map((m) => m.name).join(", ")}`).toHaveLength(0);
    expect(r.attacksBlocked).toBe(r.attacksTotal);
    expect(r.attacksTotal).toBeGreaterThanOrEqual(6);
  });

  it("has zero false positives on legitimate variations", () => {
    const fp = r.benign.filter((b) => !b.allowed);
    expect(fp, `false positives: ${fp.map((m) => m.name).join(", ")}`).toHaveLength(0);
    expect(r.falsePositives).toBe(0);
    expect(r.benignTotal).toBeGreaterThanOrEqual(4);
  });
});
