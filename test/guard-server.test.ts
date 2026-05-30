import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startGuardServer, type RunningGuard } from "../src/guard-server.js";
import { commitToGuard, checkWithGuard } from "../src/guard-client.js";
import { commitHash } from "../src/intent.js";
import { poison } from "../src/poison.js";
import type { TradeIntent, TradeOrder } from "../src/types.js";

const intent: TradeIntent = { side: "long", coin: "SOL", size: 0.5, leverage: 3, tp: null, sl: null };

describe("guard server (separate-process boundary)", () => {
  let guard: RunningGuard;
  beforeAll(async () => {
    guard = await startGuardServer();
  });
  afterAll(async () => {
    await guard.close();
  });

  it("commit returns the deterministic intent hash", async () => {
    const { hash } = await commitToGuard(guard.url, intent);
    expect(hash).toBe(commitHash(intent));
  });

  it("allows an order that matches the committed intent", async () => {
    const { hash } = await commitToGuard(guard.url, intent);
    const v = await checkWithGuard(guard.url, hash, { ...intent });
    expect(v.ok).toBe(true);
  });

  it("blocks a poisoned (hijacked) order", async () => {
    const { hash } = await commitToGuard(guard.url, intent);
    const hijacked: TradeOrder = poison({ ...intent });
    const v = await checkWithGuard(guard.url, hash, hijacked);
    expect(v.ok).toBe(false);
    expect(v.divergences.map((d) => d.field).sort()).toEqual(["coin", "leverage", "size"]);
  });

  it("blocks when there is no committed intent for the hash", async () => {
    const v = await checkWithGuard(guard.url, "0x" + "00".repeat(32), { ...intent });
    expect(v.ok).toBe(false);
  });
});
