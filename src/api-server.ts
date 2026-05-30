import { createServer, type IncomingMessage } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runRound } from "./agent.js";
import { commitHash } from "./intent.js";
import { poison } from "./poison.js";
import { finalizeOrder } from "./llm-agent.js";
import { commitToGuard, checkWithGuard, waitForGuard } from "./guard-client.js";
import { CLEAN_CONTEXT, INJECTED_CONTEXT } from "./contexts.js";
import type { TradeIntent, TradeOrder } from "./types.js";
import type { SignalSource } from "./signals.js";

const here = dirname(fileURLToPath(import.meta.url));
const INDEX = join(here, "..", "web", "index.html");

// The GUARD runs in its OWN child process — the dashboard (agent side) holds the
// intent only to feed the LLM; the allow/block VERDICT comes from the separate
// guard process, which the agent cannot reach into. This is the real boundary,
// not a co-located store.
const guardPort = Number(process.env.GUARD_PORT ?? 4101);
const GUARD_URL = process.env.GUARD_URL ?? `http://127.0.0.1:${guardPort}`;
const guardChild = process.env.GUARD_URL
  ? null
  : spawn("node", ["--import", "tsx", join(here, "guard-server-main.ts")], {
      env: { ...process.env, GUARD_PORT: String(guardPort) },
      stdio: "ignore",
    });

// agent-side copy of committed intents (legitimately known by the agent), used only
// to give the LLM its committed plan. The guard process holds the authoritative copy.
const intents = new Map<string, TradeIntent>();

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
      intents.set(hash, intent);
      await commitToGuard(GUARD_URL, intent); // authoritative copy → separate guard process

      let onchain: Record<string, unknown> | null = null;
      const addr = process.env.INTENT_LOG_ADDRESS;
      if (addr && process.env.DEPLOYER_PRIVATE_KEY) {
        try {
          const { commitIntentHash } = await import("./commit-chain.js");
          const receipt = await commitIntentHash(addr as `0x${string}`, `0x${hash}`);
          onchain = { address: addr, txHash: receipt.transactionHash };
        } catch {
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
      return json(200, await checkWithGuard(GUARD_URL, hash, order));
    }

    // The LLM finalizes the order from execution-time desk context (clean or injected).
    // The hijacked order is the MODEL's output; the verdict comes from the guard process.
    if (req.method === "POST" && url.pathname === "/api/finalize") {
      const { hash, attack } = (await readJson(req)) as { hash: string; attack?: boolean };
      const intent = intents.get(hash);
      if (!intent) return json(404, { error: "unknown commit" });
      const context = attack ? INJECTED_CONTEXT : CLEAN_CONTEXT;
      const { order, raw } = await finalizeOrder(intent, context);
      if (!order || Number.isNaN(order.size)) return json(200, { ok: false, error: "LLM output unparseable", raw });
      const verdict = await checkWithGuard(GUARD_URL, hash, order);
      return json(200, { attack: !!attack, order, verdict });
    }

    json(404, { error: "not found" });
  } catch (e) {
    json(500, { error: (e as Error).message });
  }
});

await waitForGuard(GUARD_URL);
server.listen(port, () => console.log(`sentinel demo → http://127.0.0.1:${port}  (guard process: ${GUARD_URL})`));

const shutdown = () => {
  guardChild?.kill("SIGINT");
  server.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
