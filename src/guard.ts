import type {
  TradeIntent,
  TradeOrder,
  GuardVerdict,
  Divergence,
  GuardOptions,
} from "./types.js";
import { commitHash } from "./intent.js";

/**
 * The guard. Deterministic, field-by-field comparison of the actual order against
 * the committed intent. NO LLM in this path — the trust boundary is plain code,
 * so its verdict is reproducible and can't be talked around by a hijacked model.
 *
 * Runs in a process the agent cannot write to (external boundary): if the agent's
 * context is poisoned, the guard's copy of the committed intent is not.
 */
export function evaluate(
  committedIntent: TradeIntent,
  order: TradeOrder,
  opts: GuardOptions = {},
): GuardVerdict {
  const divergences: Divergence[] = [];
  const tol = opts.sizeTolerancePct ?? 0;

  // coin — exact (case-insensitive). A flipped market = dumping into a different/illiquid asset.
  if (committedIntent.coin.toUpperCase() !== order.coin.toUpperCase()) {
    divergences.push({
      field: "coin",
      committed: committedIntent.coin,
      actual: order.coin,
      reason: "market symbol differs — order targets a different asset than committed",
    });
  }

  // side — exact. Flipping long↔short is a directional hijack.
  if (committedIntent.side !== order.side) {
    divergences.push({
      field: "side",
      committed: committedIntent.side,
      actual: order.side,
      reason: "trade direction flipped",
    });
  }

  // leverage — exact. Cranking leverage turns a measured trade into a liquidation bet.
  if (committedIntent.leverage !== order.leverage) {
    divergences.push({
      field: "leverage",
      committed: committedIntent.leverage,
      actual: order.leverage,
      reason: "leverage differs from committed",
    });
  }

  // size — within ±tolerance band of committed.
  const maxSize = committedIntent.size * (1 + tol / 100);
  const minSize = committedIntent.size * (1 - tol / 100);
  if (order.size < minSize || order.size > maxSize) {
    divergences.push({
      field: "size",
      committed: committedIntent.size,
      actual: order.size,
      reason: tol > 0 ? `size outside +/-${tol}% of committed` : "size differs from committed",
    });
  }

  // tp / sl — only enforced when the intent committed a value. A hijack that
  // strips a stop-loss (null) or moves it is caught.
  for (const field of ["tp", "sl"] as const) {
    const committed = committedIntent[field] ?? null;
    const actual = order[field] ?? null;
    if (committed !== null && actual !== committed) {
      divergences.push({
        field,
        committed,
        actual,
        reason: `${field} removed or changed from committed value`,
      });
    }
  }

  // reduceOnly — a hijack flipping this off lets an order open exposure instead of closing it.
  const committedReduceOnly = committedIntent.reduceOnly ?? false;
  const actualReduceOnly = order.reduceOnly ?? false;
  if (committedReduceOnly !== actualReduceOnly) {
    divergences.push({
      field: "reduceOnly",
      committed: committedReduceOnly,
      actual: actualReduceOnly,
      reason: "reduceOnly flag changed",
    });
  }

  return { ok: divergences.length === 0, divergences };
}

/**
 * Verify the intent the guard is checking against is the exact one that was
 * committed (hash match). Catches a hijack that swaps the committed-intent object
 * itself, not just the order.
 */
export function verifyCommitment(committedHash: string, intent: TradeIntent): boolean {
  return commitHash(intent) === committedHash;
}
