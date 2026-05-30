import type { TradeIntent, TradeOrder, GuardVerdict } from "./types.js";

/** Thin client the agent uses to talk to the (separate-process) guard. */
export async function commitToGuard(
  baseUrl: string,
  intent: TradeIntent,
): Promise<{ hash: string; committedAt: number }> {
  const r = await fetch(`${baseUrl}/commit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ intent }),
  });
  if (!r.ok) throw new Error(`guard /commit ${r.status}`);
  return (await r.json()) as { hash: string; committedAt: number };
}

export async function checkWithGuard(
  baseUrl: string,
  hash: string,
  order: TradeOrder,
): Promise<GuardVerdict> {
  const r = await fetch(`${baseUrl}/check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hash, order }),
  });
  if (!r.ok) throw new Error(`guard /check ${r.status}`);
  return (await r.json()) as GuardVerdict;
}

export async function waitForGuard(baseUrl: string, tries = 50): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${baseUrl}/health`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`guard not reachable at ${baseUrl}`);
}
