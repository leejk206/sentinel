import { startGuardServer } from "./guard-server.js";
import { dim, bold, green } from "./term.js";

// Standalone guard process. The agent must NOT share memory with this — it only
// reaches it over HTTP, so a compromised agent can't tamper with committed intents.
const port = Number(process.env.GUARD_PORT ?? 4100);
const guard = await startGuardServer({ port });
console.log(`${bold("guard")} ${green("up")} ${dim("· separate process, holds pristine intents · " + guard.url)}`);

const shutdown = () => guard.close().then(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
