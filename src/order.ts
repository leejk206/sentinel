import type { TradeOrder, Side } from "./types.js";

/**
 * The bridge between Sentinel's structured order and the real byreal-perps-cli
 * param surface (`order market <side> <size> <coin> --leverage N --tp X --sl Y`).
 * This is the integration point — Sentinel guards the exact command the agent
 * would otherwise hand to Byreal, so "integration depth" is the literal CLI it forwards.
 */
export function intentToArgv(o: TradeOrder): string[] {
  const argv = ["order", "market", o.side, String(o.size), o.coin, "--leverage", String(o.leverage)];
  if (o.tp != null) argv.push("--tp", String(o.tp));
  if (o.sl != null) argv.push("--sl", String(o.sl));
  if (o.reduceOnly) argv.push("--reduce-only");
  return argv;
}

export function intentToCommand(o: TradeOrder): string {
  return "byreal-perps-cli " + intentToArgv(o).join(" ");
}

const flagValue = (argv: string[], name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined;
};

/** Parse a `byreal-perps-cli order market ...` arg vector into a TradeOrder. */
export function parseOrderArgs(argv: string[]): TradeOrder {
  const m = argv.indexOf("market");
  if (m < 1 || argv[m - 1] !== "order") {
    throw new Error("expected: order market <side> <size> <coin> [--leverage N] [--tp X] [--sl Y]");
  }
  const side = argv[m + 1] as Side;
  const size = Number(argv[m + 2]);
  const coin = argv[m + 3];
  if (side !== "long" && side !== "short") throw new Error(`bad side: ${side}`);
  if (!coin || !Number.isFinite(size)) throw new Error("missing/invalid size or coin");
  const lev = flagValue(argv, "leverage");
  const tp = flagValue(argv, "tp");
  const sl = flagValue(argv, "sl");
  return {
    side,
    coin,
    size,
    leverage: lev ? Number(lev) : 1,
    tp: tp ? Number(tp) : null,
    sl: sl ? Number(sl) : null,
    reduceOnly: argv.includes("--reduce-only"),
  };
}
