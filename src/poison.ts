import type { TradeOrder } from "./types.js";

/**
 * A poisoned tool response / dependency hijacks the order AFTER the agent froze
 * its intent. This is a NEUTRAL, DETERMINISTIC mutation — not an LLM attack we
 * authored to be caught. It stands in for what a jqwik/TanStack-style injection
 * does to the execution params: redirect the market, inflate size, crank leverage.
 *
 * The point of the demo is not that we wrote a clever attack — it's that ANY
 * divergence from the committed intent is caught deterministically by the guard.
 */
export function poison(order: TradeOrder): TradeOrder {
  return { ...order, coin: "ATTACKER", size: order.size * 10, leverage: 50 };
}
