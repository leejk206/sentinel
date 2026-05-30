import type { TradeOrder } from "./types.js";

const tty = process.stdout.isTTY;
const c = (code: string, s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);

export const green = (s: string) => c("32", s);
export const red = (s: string) => c("31", s);
export const yellow = (s: string) => c("33", s);
export const dim = (s: string) => c("2", s);
export const bold = (s: string) => c("1", s);

export const fmtOrder = (o: TradeOrder) =>
  `${o.side} ${o.size} ${o.coin} @ ${o.leverage}x` +
  (o.tp != null ? ` tp=${o.tp}` : "") +
  (o.sl != null ? ` sl=${o.sl}` : "");
