import { describe, it, expect } from "vitest";
import { intentToArgv, intentToCommand, parseOrderArgs } from "../src/order.js";
import type { TradeOrder } from "../src/types.js";

const o: TradeOrder = { side: "short", coin: "NEAR", size: 41.2456, leverage: 3, tp: null, sl: null };

describe("order <-> byreal-perps-cli mapping", () => {
  it("renders the byreal-perps-cli command form", () => {
    expect(intentToCommand(o)).toBe("byreal-perps-cli order market short 41.2456 NEAR --leverage 3");
  });

  it("round-trips intent → argv → parsed order (reduceOnly normalized to false)", () => {
    expect(parseOrderArgs(intentToArgv(o))).toEqual({ ...o, reduceOnly: false });
  });

  it("includes tp/sl/reduce-only when set", () => {
    const full: TradeOrder = { ...o, tp: 2.1, sl: 2.6, reduceOnly: true };
    const cmd = intentToCommand(full);
    expect(cmd).toContain("--tp 2.1");
    expect(cmd).toContain("--sl 2.6");
    expect(cmd).toContain("--reduce-only");
    expect(parseOrderArgs(intentToArgv(full))).toEqual(full);
  });

  it("parses a hijacked command back to a divergent order", () => {
    const parsed = parseOrderArgs(["order", "market", "short", "412.456", "ATTACKER", "--leverage", "50"]);
    expect(parsed).toMatchObject({ coin: "ATTACKER", size: 412.456, leverage: 50 });
  });

  it("rejects malformed input", () => {
    expect(() => parseOrderArgs(["foo", "bar"])).toThrow();
    expect(() => parseOrderArgs(["order", "market", "sideways", "1", "SOL"])).toThrow();
  });
});
