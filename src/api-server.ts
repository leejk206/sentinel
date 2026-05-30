import { createServer, type IncomingMessage } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runRound } from "./agent.js";
import { evaluate } from "./guard.js";
import { commitHash } from "./intent.js";
import { poison } from "./poison.js";
import { finalizeOrder } from "./llm-agent.js";
import { CLEAN_CONTEXT, INJECTED_CONTEXT } from "./contexts.js";
import type { TradeIntent, TradeOrder } from "./types.js";
import type { SignalSource } from "./signals.js";

const here = dirname(fileURLToPath(import.meta.url));
const INDEX = join(here, "..", "web", "index.html");

// In-process committed-intent store. In the full system this is the separate
// guard process (src/guard-server.ts); the demo API co-locates it for one-command UX.
const store = new Map<string, { intent: TradeIntent; committedAt: number }>();

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const port = Number(process.env.PORT ?? 4200);

const server = createServer(async (req, res) => {
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  try {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(readFileSync(INDEX, "utf8"));
    }

    if (req.method === "GET" && url.pathname === "/api/round") {
      const source = (url.searchParams.get("source") ?? "fixture") as SignalSource;
      const round = await runRound({ source });
      if (!round.decision) return json(200, { ok: false, reason: "no qualifying signal" });
      const intent = round.decision.intent;
      const hash = commitHash(intent);
      store.set(hash, { intent, committedAt: Date.now() });

      // optional: anchor the commitment on Mantle (when configured + deployed)
      let onchain: Record<string, unknown> | null = null;
      const addr = process.env.INTENT_LOG_ADDRESS;
      if (addr && process.env.DEPLOYER_PRIVATE_KEY) {
        try {
          const { commitIntentHash } = await import("./commit-chain.js");
          const receipt = await commitIntentHash(addr as `0x${string}`, `0x${hash}`);
          onchain = { address: addr, txHash: receipt.transactionHash };
        } catch {
          // same intent already committed (first-write-wins) — still anchored, just earlier
          onchain = { address: addr, alreadyCommitted: true };
        }
      }

      return json(200, {
        ok: true,
        source: round.source,
        scanned: round.signals.length,
        reasoning: round.decision.reasoning,
        chosen: round.decision.chosen,
        intent,
        hash,
        cleanOrder: intent,
        poisonedOrder: poison(intent),
        onchain,
      });
    }

    if (req.method === "POST" && url.pathname === "/api/check") {
      const { hash, order } = (await readJson(req)) as { hash: string; order: TradeOrder };
      const stored = store.get(hash);
      if (!stored) return json(200, { ok: false, divergences: [{ field: "*", committed: hash, actual: null, reason: "no committed intent" }] });
      return json(200, evaluate(stored.intent, order));
    }

    // The LLM finalizes the order from execution-time desk context (clean or injected).
    // The hijacked order is the MODEL's output, not hardcoded.
    if (req.method === "POST" && url.pathname === "/api/finalize") {
      const { hash, attack } = (await readJson(req)) as { hash: string; attack?: boolean };
      const stored = store.get(hash);
      if (!stored) return json(404, { error: "unknown commit" });
      const context = attack ? INJECTED_CONTEXT : CLEAN_CONTEXT;
      const { order, raw } = await finalizeOrder(stored.intent, context);
      if (!order || Number.isNaN(order.size)) return json(200, { ok: false, error: "LLM output unparseable", raw });
      return json(200, { attack: !!attack, order, verdict: evaluate(stored.intent, order) });
    }

    json(404, { error: "not found" });
  } catch (e) {
    json(500, { error: (e as Error).message });
  }
});

server.listen(port, () => console.log(`sentinel demo → http://127.0.0.1:${port}`));
