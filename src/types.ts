export type Side = "long" | "short";

/**
 * The exact perp trade the agent DECIDED on — frozen and committed BEFORE any
 * untrusted input (tool results, web content, dependency output) can touch the
 * execution path. This temporal boundary is the whole guarantee: a hijack that
 * mutates the order after this point cannot also mutate the committed intent.
 *
 * Fields mirror the byreal-perps-cli typed param surface
 * (`order market <side> <size> <coin> --leverage --tp --sl`), so the guard works
 * at the CLI/param boundary — no SVM bytecode decoding required.
 */
export interface TradeIntent {
  side: Side;
  coin: string; // market symbol, e.g. "SOL"
  size: number; // base size in coin units
  leverage: number; // integer leverage, e.g. 3
  tp?: number | null; // take-profit price (optional)
  sl?: number | null; // stop-loss price (optional)
  reduceOnly?: boolean;
}

/** The actual order about to be sent to byreal-perps-cli — may have been hijacked. */
export type TradeOrder = TradeIntent;

export interface Divergence {
  field: string;
  committed: unknown;
  actual: unknown;
  reason: string;
}

export interface GuardVerdict {
  ok: boolean;
  divergences: Divergence[];
}

export interface GuardOptions {
  /**
   * Allowed relative drift on `size` as a percent (0 = exact match required).
   * Lets a legit agent recompute size slightly at execution time without
   * tripping the guard, while still catching gross hijacks. Default 0.
   */
  sizeTolerancePct?: number;
}
