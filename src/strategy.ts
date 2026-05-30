import type { Signal, RiskProfile } from "./signals.js";
import type { TradeIntent, Side } from "./types.js";

export interface StrategyConfig {
  profile: RiskProfile;
  minScore: number;
  notionalUsd: number;
  leverageByProfile: Record<RiskProfile, number>;
  /** Skip markets whose symbol starts with any of these (e.g. ["xyz:"] for crypto-only). */
  excludePrefixes: string[];
}

export const DEFAULT_STRATEGY: StrategyConfig = {
  profile: "moderate",
  minScore: 55,
  notionalUsd: 100,
  leverageByProfile: { conservative: 2, moderate: 3, aggressive: 5 },
  excludePrefixes: [],
};

export interface Decision {
  intent: TradeIntent;
  reasoning: string;
  chosen: Signal;
  notionalUsd: number;
}

const round = (n: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/**
 * Deterministic strategy: pick the highest-scoring signal in the configured risk
 * profile, size it to a fixed notional, and produce a structured TradeIntent plus
 * a natural-language rationale.
 *
 * This is rule-based and fully testable. An LLM could replace `decide` to author
 * the rationale/selection — but it would sit OUTSIDE the trust path: whatever it
 * proposes becomes the *committed intent*, and the deterministic guard (src/guard.ts)
 * still checks the eventual order against that commitment. The LLM never gets a
 * vote on whether an order is allowed.
 */
export function decide(signals: Signal[], cfg: Partial<StrategyConfig> = {}): Decision | null {
  const c: StrategyConfig = {
    ...DEFAULT_STRATEGY,
    ...cfg,
    leverageByProfile: { ...DEFAULT_STRATEGY.leverageByProfile, ...(cfg.leverageByProfile ?? {}) },
  };

  const pool = signals
    .filter((s) => s.category === c.profile)
    .filter((s) => s.score >= c.minScore)
    .filter((s) => Number.isFinite(s.price) && s.price > 0)
    .filter((s) => !c.excludePrefixes.some((p) => s.coin.startsWith(p)))
    .sort((a, b) => b.score - a.score || a.coin.localeCompare(b.coin));

  const chosen = pool[0];
  if (!chosen) return null;

  const side: Side = chosen.direction === "Short" ? "short" : "long";
  const leverage = c.leverageByProfile[c.profile];
  const size = round(c.notionalUsd / chosen.price, 4);

  const intent: TradeIntent = { side, coin: chosen.coin, size, leverage, tp: null, sl: null };
  const reasoning =
    `signal scan favors ${chosen.coin} ${side.toUpperCase()} ` +
    `(score ${chosen.score}, RSI ${chosen.rsi}, funding ${chosen.fundingAnnualized}). ` +
    `${c.profile} profile -> ${leverage}x, ~$${c.notionalUsd} notional = ${size} ${chosen.coin}.`;

  return { intent, reasoning, chosen, notionalUsd: c.notionalUsd };
}
