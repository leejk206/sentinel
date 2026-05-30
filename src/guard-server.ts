import { createServer, type IncomingMessage } from "node:http";
import { evaluate } from "./guard.js";
import { commitHash } from "./intent.js";
import type { TradeIntent, TradeOrder, GuardVerdict } from "./types.js";

/**
 * The guard runs as its OWN process. The agent talks to it only over HTTP
 * (commit / check) — it can never reach into the guard's memory to alter a
 * committed intent. So even a fully prompt-injected agent cannot get a divergent
 * order signed: the guard holds the pristine intent and says no.
 *
 * `store` is keyed by the intent's own hash, so a commitment is immutable —
 * re-committing a *different* intent just produces a different key.
 */
interface Stored {
  intent: TradeIntent;
  committedAt: number;
}

export interface RunningGuard {
  port: number;
  url: string;
  close(): Promise<void>;
}

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

export function startGuardServer(
  opts: { port?: number; sizeTolerancePct?: number } = {},
): Promise<RunningGuard> {
  const store = new Map<string, Stored>();

  const server = createServer(async (req, res) => {
    const json = (code: number, body: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method === "GET" && req.url === "/health") return json(200, { ok: true });

      if (req.method === "POST" && req.url === "/commit") {
        const { intent } = (await readJson(req)) as { intent: TradeIntent };
        if (!intent) return json(400, { error: "intent required" });
        const hash = commitHash(intent);
        if (!store.has(hash)) store.set(hash, { intent, committedAt: Date.now() });
        return json(200, { hash, committedAt: store.get(hash)!.committedAt });
      }

      if (req.method === "POST" && req.url === "/check") {
        const { hash, order } = (await readJson(req)) as { hash: string; order: TradeOrder };
        const stored = store.get(hash);
        if (!stored) {
          const verdict: GuardVerdict = {
            ok: false,
            divergences: [
              { field: "*", committed: hash, actual: null, reason: "no committed intent for this hash" },
            ],
          };
          return json(200, verdict);
        }
        const verdict = evaluate(stored.intent, order, { sizeTolerancePct: opts.sizeTolerancePct });
        return json(200, { ...verdict, committedAt: stored.committedAt });
      }

      json(404, { error: "not found" });
    } catch (e) {
      json(500, { error: (e as Error).message });
    }
  });

  return new Promise((resolve) => {
    server.listen(opts.port ?? 0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : (opts.port ?? 0);
      resolve({
        port,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}
