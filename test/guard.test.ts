import { describe, it, expect } from "vitest";
import type { TradeIntent } from "../src/types.js";
import { evaluate, verifyCommitment } from "../src/guard.js";
import { commitHash, canonicalize } from "../src/intent.js";

const intent: TradeIntent = { side: "long", coin: "SOL", size: 0.5, leverage: 3, tp: null, sl: null };

describe("guard.evaluate", () => {
  it("allows an order that exactly matches the committed intent", () => {
    const v = evaluate(intent, { ...intent });
    expect(v.ok).toBe(true);
    expect(v.divergences).toHaveLength(0);
  });

  it("blocks the canonical hijack (coin + size + leverage all flipped)", () => {
    const v = evaluate(intent, { ...intent, coin: "SCAM", size: 5, leverage: 50 });
    expect(v.ok).toBe(false);
    expect(v.divergences.map((d) => d.field).sort()).toEqual(["coin", "leverage", "size"]);
  });

  it("catches a single flipped coin", () => {
    const v = evaluate(intent, { ...intent, coin: "PEPE" });
    expect(v.ok).toBe(false);
    expect(v.divergences).toHaveLength(1);
    expect(v.divergences[0]!.field).toBe("coin");
  });

  it("catches a flipped side", () => {
    const v = evaluate(intent, { ...intent, side: "short" });
    expect(v.divergences.map((d) => d.field)).toEqual(["side"]);
  });

  it("catches inflated size", () => {
    const v = evaluate(intent, { ...intent, size: 5 });
    expect(v.divergences.map((d) => d.field)).toEqual(["size"]);
  });

  it("coin match is case-insensitive (no false positive)", () => {
    expect(evaluate(intent, { ...intent, coin: "sol" }).ok).toBe(true);
  });

  it("respects size tolerance band", () => {
    const order = { ...intent, size: 0.51 }; // +2%
    expect(evaluate(intent, order).ok).toBe(false); // exact by default
    expect(evaluate(intent, order, { sizeTolerancePct: 5 }).ok).toBe(true);
  });

  it("catches a stripped stop-loss", () => {
    const withSl: TradeIntent = { ...intent, sl: 90 };
    const v = evaluate(withSl, { ...withSl, sl: null });
    expect(v.divergences.map((d) => d.field)).toEqual(["sl"]);
  });

  it("ignores tp/sl when intent did not commit them", () => {
    expect(evaluate(intent, { ...intent, tp: 999 }).ok).toBe(true);
  });

  it("catches a flipped reduceOnly", () => {
    const closing: TradeIntent = { ...intent, reduceOnly: true };
    const v = evaluate(closing, { ...closing, reduceOnly: false });
    expect(v.divergences.map((d) => d.field)).toEqual(["reduceOnly"]);
  });
});

describe("intent commitment", () => {
  it("is deterministic regardless of key order / coin casing", () => {
    const a = commitHash({ side: "long", coin: "SOL", size: 0.5, leverage: 3 });
    const b = commitHash({ leverage: 3, size: 0.5, coin: "sol", side: "long", tp: null, sl: null });
    expect(a).toBe(b);
  });

  it("changes when any field changes", () => {
    expect(commitHash(intent)).not.toBe(commitHash({ ...intent, size: 0.6 }));
  });

  it("verifyCommitment detects a swapped intent object", () => {
    const h = commitHash(intent);
    expect(verifyCommitment(h, intent)).toBe(true);
    expect(verifyCommitment(h, { ...intent, coin: "SCAM" })).toBe(false);
  });

  it("canonical form is stable", () => {
    expect(canonicalize(intent)).toBe(canonicalize({ ...intent }));
  });
});
