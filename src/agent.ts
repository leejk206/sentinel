import { fetchSignals, type SignalSource, type Signal } from "./signals.js";
import { decide, type Decision, type StrategyConfig } from "./strategy.js";
import { commitHash } from "./intent.js";

export interface Round {
  source: "live" | "fixture";
  signals: Signal[];
  decision: Decision | null;
  /** sha256 of the committed intent — frozen here, BEFORE any order is built/executed. */
  commit: string | null;
}

/**
 * One autonomous round: scan → decide → FREEZE intent (commit).
 *
 * The commit is the security boundary: it happens before the order is constructed
 * or any untrusted execution-time input is read. A hijack downstream can mutate the
 * order, but not this committed intent — which is what the guard checks against.
 * (Order build → guard → sign is wired in D6/D7.)
 */
export async function runRound(
  opts: { source?: SignalSource; strategy?: Partial<StrategyConfig> } = {},
): Promise<Round> {
  const { signals, source } = await fetchSignals(opts.source ?? "auto");
  const decision = decide(signals, opts.strategy);
  const commit = decision ? commitHash(decision.intent) : null;
  return { source, signals, decision, commit };
}
