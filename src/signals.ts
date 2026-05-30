import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const execFileP = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "..", "fixtures", "signals.sample.json");
const BIN = join(here, "..", "node_modules", ".bin", "byreal-perps-cli");

export type RiskProfile = "conservative" | "moderate" | "aggressive";

/** Normalized market signal from `byreal-perps-cli signal scan` (free, no auth). */
export interface Signal {
  coin: string;
  direction: "Long" | "Short";
  price: number;
  rsi: number;
  funding: number;
  fundingAnnualized: string;
  score: number;
  category: RiskProfile;
}

interface RawSignal {
  coin: string;
  direction: string;
  price: string;
  rsi: number;
  funding: string;
  fundingAnnualized: string;
  score: number;
}

const PROFILES: RiskProfile[] = ["conservative", "moderate", "aggressive"];

/** Flatten the grouped `signal scan` JSON into a typed, numeric Signal[]. */
export function normalizeSignals(raw: unknown): Signal[] {
  const groups = (raw as { data?: { signals?: Record<string, RawSignal[]> } })?.data?.signals ?? {};
  const out: Signal[] = [];
  for (const category of PROFILES) {
    for (const s of groups[category] ?? []) {
      out.push({
        coin: s.coin,
        direction: s.direction === "Short" ? "Short" : "Long",
        price: Number(s.price),
        rsi: Number(s.rsi),
        funding: Number(s.funding),
        fundingAnnualized: s.fundingAnnualized,
        score: Number(s.score),
        category,
      });
    }
  }
  return out;
}

export type SignalSource = "live" | "fixture" | "auto";

/**
 * Fetch market signals. "live" shells out to byreal-perps-cli (the free, no-auth
 * `signal scan`); "fixture" reads a captured sample; "auto" tries live then falls
 * back to the fixture (offline/CI). This is read-only market intel — no wallet,
 * no funds — exactly the free Byreal surface the spike verified.
 */
export async function fetchSignals(
  source: SignalSource = "auto",
): Promise<{ signals: Signal[]; source: "live" | "fixture" }> {
  if (source !== "fixture") {
    try {
      const { stdout } = await execFileP(BIN, ["signal", "scan", "-o", "json"], {
        timeout: 40_000,
        maxBuffer: 16 * 1024 * 1024,
      });
      const signals = normalizeSignals(JSON.parse(stdout));
      if (signals.length) return { signals, source: "live" };
    } catch (err) {
      if (source === "live") throw err;
    }
  }
  return { signals: loadFixtureSignals(), source: "fixture" };
}

export function loadFixtureSignals(): Signal[] {
  return normalizeSignals(JSON.parse(readFileSync(FIXTURE, "utf8")));
}
