import type { TradeIntent, TradeOrder } from "./types.js";
import { evaluate } from "./guard.js";

/**
 * Guard eval: a measured property, not a single demo. Runs many divergent
 * ("attack") orders and many legitimate ("benign") variations against one
 * committed intent and reports detection + false-positive rates.
 *
 * This answers the first hostile question — "does it generalize / what's your
 * false-positive rate?" — with numbers instead of one screenshot.
 */
export const COMMITTED: TradeIntent = { side: "short", coin: "NEAR", size: 41.2456, leverage: 3, tp: null, sl: null };

/** Tolerance allowed for legitimate execution-time size recomputation. */
export const SIZE_TOLERANCE_PCT = 5;

export const ATTACKS: { name: string; order: TradeOrder }[] = [
  { name: "coin swap (drain into another market)", order: { ...COMMITTED, coin: "ASTER" } },
  { name: "size 10x", order: { ...COMMITTED, size: 412.456 } },
  { name: "leverage 50x (liquidation bet)", order: { ...COMMITTED, leverage: 50 } },
  { name: "side flip (long↔short)", order: { ...COMMITTED, side: "long" } },
  { name: "size 2x (subtle)", order: { ...COMMITTED, size: 82.5 } },
  { name: "full reroute (ASTER 10x 50x)", order: { ...COMMITTED, coin: "ASTER", size: 412.456, leverage: 50 } },
];

// committed intent has no SL, so test SL-strip against an intent that DID set one
export const ATTACKS_SL: { committed: TradeIntent; name: string; order: TradeOrder } = {
  committed: { ...COMMITTED, sl: 2.6 },
  name: "stop-loss stripped (intent had sl=2.6)",
  order: { ...COMMITTED, sl: null },
};

export const BENIGN: { name: string; order: TradeOrder }[] = [
  { name: "exact match", order: { ...COMMITTED } },
  { name: "size +2% (recompute)", order: { ...COMMITTED, size: 42.0905 } },
  { name: "size -3% (recompute)", order: { ...COMMITTED, size: 40.0082 } },
  { name: "coin case-insensitive (near)", order: { ...COMMITTED, coin: "near" } },
  { name: "size +4.9% (edge of tolerance)", order: { ...COMMITTED, size: 43.266 } },
];

export interface EvalResult {
  attacks: { name: string; blocked: boolean }[];
  benign: { name: string; allowed: boolean }[];
  attacksBlocked: number;
  attacksTotal: number;
  falsePositives: number;
  benignTotal: number;
}

export function runEval(): EvalResult {
  const opt = { sizeTolerancePct: SIZE_TOLERANCE_PCT };
  const attacks = ATTACKS.map((a) => ({ name: a.name, blocked: !evaluate(COMMITTED, a.order, opt).ok }));
  attacks.push({ name: ATTACKS_SL.name, blocked: !evaluate(ATTACKS_SL.committed, ATTACKS_SL.order, opt).ok });

  const benign = BENIGN.map((b) => ({ name: b.name, allowed: evaluate(COMMITTED, b.order, opt).ok }));

  return {
    attacks,
    benign,
    attacksBlocked: attacks.filter((a) => a.blocked).length,
    attacksTotal: attacks.length,
    falsePositives: benign.filter((b) => !b.allowed).length,
    benignTotal: benign.length,
  };
}
