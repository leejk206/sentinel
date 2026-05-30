import { createHash } from "node:crypto";
import type { TradeIntent } from "./types.js";

/**
 * Deterministic canonical form of an intent: fixed key order, normalized coin
 * casing, explicit nulls. Two intents that mean the same thing produce the same
 * string (and therefore the same commit hash) regardless of input formatting.
 */
export function canonicalize(intent: TradeIntent): string {
  const norm = {
    coin: intent.coin.toUpperCase(),
    leverage: intent.leverage,
    reduceOnly: intent.reduceOnly ?? false,
    side: intent.side,
    size: intent.size,
    sl: intent.sl ?? null,
    tp: intent.tp ?? null,
  };
  return JSON.stringify(norm);
}

/**
 * sha256 of the canonical intent. In production this hash is committed on-chain
 * (Mantle) with a timestamp BEFORE execution — making the intent tamper-evident.
 * In D1 it lives in-process; the Mantle commit log is component #2.
 */
export function commitHash(intent: TradeIntent): string {
  return createHash("sha256").update(canonicalize(intent)).digest("hex");
}
