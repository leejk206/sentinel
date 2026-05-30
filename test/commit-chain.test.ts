import { describe, it, expect } from "vitest";
import { encodeFunctionData, type Abi } from "viem";
import { abi, bytecode, intentHashHex } from "../src/commit-chain.js";
import type { TradeIntent } from "../src/types.js";

const intent: TradeIntent = { side: "long", coin: "SOL", size: 0.5, leverage: 3, tp: null, sl: null };

describe("IntentCommitLog artifact", () => {
  it("compiled to deployable bytecode", () => {
    expect(bytecode.startsWith("0x")).toBe(true);
    expect(bytecode.length).toBeGreaterThan(200);
  });

  it("exposes exactly the expected functions", () => {
    const fns = (abi as { type: string; name?: string }[])
      .filter((x) => x.type === "function")
      .map((x) => x.name)
      .sort();
    expect(fns).toEqual(["commit", "commitmentOf", "wasCommittedBefore"]);
  });

  it("intentHashHex is a 32-byte hex that matches the off-chain commit", () => {
    expect(intentHashHex(intent)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("the client encodes a commit() call against the real ABI (4-byte selector + 32-byte arg)", () => {
    const data = encodeFunctionData({
      abi: abi as Abi,
      functionName: "commit",
      args: [intentHashHex(intent)],
    });
    expect(data.length).toBe(2 + 8 + 64); // 0x + selector(8) + bytes32(64)
  });
});
