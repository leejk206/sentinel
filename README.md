# Sentinel

**An autonomous Byreal trading agent you can leave running unattended — because it commits its intent before it acts, and an external deterministic guard blocks any order that doesn't match (catching prompt-injection hijacks before signing).**

Built for the Mantle **Turing Test Hackathon 2026 · Track 6 (Agentic Economy)**. Full spec: `../web3-grants-quest/docs/sentinel-spec.md`.

> Headline = the autonomous agent. The guard is the trust beat that makes unattended autonomy believable.

## Why

This week, AI agents were hijacked through poisoned dependencies (jqwik, TanStack-npm supply-chain injections). An autonomous agent that holds keys and trades is the highest-value target: a poisoned tool result can rewrite its order to dump into a scam market at 50x or redirect funds. Sentinel freezes the agent's **intent** before any untrusted input touches the execution path, then an **external** process deterministically checks the actual order against that committed intent — and refuses to sign on divergence.

The trust boundary is **plain code, no LLM** — so a poisoned model can't talk its way past it, and the verdict is reproducible (not "an LLM checking an LLM").

## D1 — deterministic intent-integrity guard ✅

The core thesis, provable in a terminal with no wallet, no funds, no UI:

```bash
npm install
npm run demo     # shows: clean order ALLOWED, hijacked order BLOCKED
npm test         # 14 unit tests on the matcher + commitment
```

`npm run demo` loads a committed intent (`long 0.5 SOL @ 3x`), passes a clean order (✓ allow → auto-sign) and a hijacked order (`long 5 SCAM @ 50x` → ⚠ block with per-field divergences). The hijack values are a **neutral, deterministic mutation** — not an LLM attack we authored — so the guard's catch isn't a rigged demo.

## D2 — autonomous agent loop ✅

The agent runs unattended: scans live Byreal market signals, decides a trade, and **freezes its intent** (commits the hash) before any order is built.

```bash
npm run agent -- --source live --profile moderate    # real byreal-perps-cli signal scan (~30s, no funds)
npm run agent -- --source fixture                     # offline, captured signals
```

It pulls `byreal-perps-cli signal scan` (free, no-auth, no-funds), picks the highest-scoring signal in the risk profile, sizes to a fixed notional, and emits a structured `TradeIntent` + commit hash. The selection is deterministic/testable; an LLM could author the rationale instead, but it stays **outside the trust path** — its output only becomes the *committed intent*, and the D1 guard still checks the eventual order against it.

## D4 — Mantle commit log ✅ (deploy = one user action)

`contracts/IntentCommitLog.sol` — a tamper-evident, timestamped log. The agent commits `hash(intent)` here **before** building an order; `wasCommittedBefore(hash, t)` lets the guard prove the intent predates execution, so a post-commit hijack can't forge a matching, earlier-timestamped intent. First-write-wins = immutable.

**Deployed live on Mantle Sepolia:** [`0xaad178553026ca9dbde163b6990346cd3a8ee8e0`](https://sepolia.mantlescan.xyz/address/0xaad178553026ca9dbde163b6990346cd3a8ee8e0). The agent commits its frozen intent on-chain each round (verified end-to-end: decide → freeze → `commit()` tx → `commitmentOf` read-back, `exists:true`).

```bash
npm run compile                       # solc → artifacts/IntentCommitLog.json
cp .env.example .env                  # fill DEPLOYER_PRIVATE_KEY (testnet) + MANTLE_RPC_URL
npm run deploy                        # deploys to Mantle Sepolia, prints address
npm run agent:live -- --source live   # autonomous loop that also commits each intent on Mantle
```

> Testnet key is funded from https://faucet.sepolia.mantle.xyz. `.env` is gitignored.

## D6 / D7 — external guard process + hijack demo ✅ (the core moment)

The guard runs as its **own process** (`npm run guard`). The agent reaches it only over HTTP (`/commit`, `/check`) — it never shares memory, so a fully prompt-injected agent **cannot** tamper with the committed intent or get a divergent order signed.

```bash
npm run demo:hijack    # spawns the guard process, then: clean order ALLOWED, hijacked order BLOCKED
```

The demo: the agent freezes its intent and commits it to the guard; an honest order is auto-signed (✓ALLOW); then a **poisoned tool response** (`src/poison.ts` — a neutral, deterministic param mutation, *not* a hand-authored attack) hijacks the order to `short 412 ATTACKER @ 50x`, and the guard blocks it (⚠BLOCK, per-field divergences). The guard's verdict is plain deterministic code with no LLM in the path.

### Layout
- `src/types.ts` — `TradeIntent` / `TradeOrder` (mirror the byreal-perps-cli param surface; no SVM decoding)
- `src/intent.ts` — canonicalize + `commitHash`
- `src/guard.ts` — `evaluate(intent, order)` deterministic field-diff + `verifyCommitment`
- `src/signals.ts` — `fetchSignals` (live `signal scan` / fixture) + normalize
- `src/strategy.ts` — `decide(signals)` deterministic strategy → `TradeIntent` + rationale
- `src/agent.ts` — `runRound`: scan → decide → freeze intent
- `src/commit-chain.ts` — viem client for IntentCommitLog (Mantle Sepolia)
- `contracts/IntentCommitLog.sol` + `scripts/compile.ts` + `scripts/deploy.ts`
- `src/guard-server.ts` / `src/guard-client.ts` / `src/guard-server-main.ts` — external guard process + client
- `src/poison.ts` — deterministic "poisoned tool" mutation (stands in for an injection)
- `src/demo.ts` / `src/demo-hijack.ts` / `src/run-agent.ts` — D1 guard demo / D6-7 hijack demo / D2 agent loop
- `fixtures/` — committed intent, clean/hijacked orders, sample signals
- `test/` — 31 tests (matcher, commitment, normalization, strategy, contract ABI/encoding, guard server)

## Roadmap (spec §3)
D1 guard ✅ → D2 autonomous agent loop ✅ → D4 Mantle commit log ✅ (deployed live) → D6 external guard process ✅ → D7 injection demo ✅ → UI → one recorded real Byreal trade.
