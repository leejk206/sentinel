import { describe, it, expect } from "vitest";
import { loadFixtureSignals } from "../src/signals.js";
import { decide } from "../src/strategy.js";

const signals = loadFixtureSignals();

describe("signal normalization", () => {
  it("loads the fixture and coerces strings to finite numbers", () => {
    expect(signals.length).toBeGreaterThan(0);
    for (const s of signals) {
      expect(Number.isFinite(s.price)).toBe(true);
      expect(Number.isFinite(s.score)).toBe(true);
      expect(["Long", "Short"]).toContain(s.direction);
      expect(["conservative", "moderate", "aggressive"]).toContain(s.category);
    }
  });
});

describe("strategy.decide", () => {
  it("picks the highest-scoring signal in the chosen profile", () => {
    const profile = "moderate" as const;
    const pool = signals.filter((s) => s.category === profile);
    const expected = [...pool].sort((a, b) => b.score - a.score || a.coin.localeCompare(b.coin))[0]!;
    const d = decide(signals, { profile, minScore: 0 });
    expect(d).not.toBeNull();
    expect(d!.chosen.coin).toBe(expected.coin);
  });

  it("maps signal direction to order side", () => {
    const d = decide(signals, { minScore: 0 })!;
    expect(d.intent.side).toBe(d.chosen.direction === "Short" ? "short" : "long");
  });

  it("applies leverage by profile", () => {
    const d = decide(signals, { profile: "conservative", minScore: 0, leverageByProfile: { conservative: 2, moderate: 3, aggressive: 5 } });
    if (d) expect(d.intent.leverage).toBe(2);
  });

  it("sizes the position from notional / price", () => {
    const d = decide(signals, { minScore: 0, notionalUsd: 100 })!;
    expect(d.intent.size).toBeCloseTo(100 / d.chosen.price, 3);
    expect(d.intent.coin).toBe(d.chosen.coin);
  });

  it("produces a well-formed TradeIntent", () => {
    const d = decide(signals, { minScore: 0 })!;
    expect(d.intent).toMatchObject({
      side: expect.stringMatching(/^(long|short)$/),
      coin: expect.any(String),
      size: expect.any(Number),
      leverage: expect.any(Number),
    });
  });

  it("is deterministic", () => {
    const a = decide(signals, { minScore: 0 });
    const b = decide(signals, { minScore: 0 });
    expect(a).toEqual(b);
  });

  it("returns null when nothing clears minScore", () => {
    expect(decide(signals, { minScore: 999 })).toBeNull();
  });

  it("excludePrefixes never yields an excluded market", () => {
    const d = decide(signals, { minScore: 0, excludePrefixes: ["xyz:"] });
    if (d) expect(d.chosen.coin.startsWith("xyz:")).toBe(false);
  });
});
