// pi-herdr extension entry point.
//
// Hard rule (from soul core memory): never lock the main thread of
// conversation with the agent. Every tool is async, has a bounded timeout,
// returns errors as values, and never spin-polls. If you add a tool, follow
// the same pattern: take timeout_ms as an optional arg, call HerdrClient
// with safeTimeoutMs, return a ToolResult, never throw.
//
// Setup expectations:
//   1. herdr server must be running (HERDR_SOCKET_PATH or ~/.config/herdr/herdr.sock)
//   2. `herdr integration install pi` should be run so Herdr recognizes pi
//      sessions and records the session path (source="herdr:pi")
//
// On load we do a single liveness ping (2s) and surface a warning to pi if
// Herdr isn't reachable. The warning is non-fatal — the agent can still use
// the tools; they just return {ok: false, error: ...} until herdr starts.

import { HerdrClient } from "./src/herdr-client.js";
import { snapshotToolDefinition } from "./src/tools/snapshot.js";
import {
  paneListToolDefinition,
  paneReadToolDefinition,
  paneSendTextToolDefinition,
} from "./src/tools/pane.js";
import {
  agentListToolDefinition,
  agentPromptToolDefinition,
} from "./src/tools/agent.js";
import {
  subscribeToolDefinition,
  pollToolDefinition,
  unsubscribeToolDefinition,
} from "./src/tools/subscribe.js";

// All tools exposed to the agent. Order is the order they appear in pi's UI.
export const tools = [
  snapshotToolDefinition,
  agentListToolDefinition,
  agentPromptToolDefinition,
  paneListToolDefinition,
  paneReadToolDefinition,
  paneSendTextToolDefinition,
  subscribeToolDefinition,
  pollToolDefinition,
  unsubscribeToolDefinition,
] as const;

// Default export: the pi extension shape. Wraps tool execution so we can
// add cross-cutting concerns (logging, metrics, agent-context injection) in
// one place without touching every tool file.
//
// The exact shape pi expects may evolve; the wrapping pattern is the
// important part: route every execute() through a single gate that enforces
// the no-main-thread-lock rule.
export default async function activate(): Promise<void> {
  const client = new HerdrClient();
  const alive = await client.ping(2_000);
  if (!alive.ok) {
    // Non-fatal: log to pi's console so the user sees the warning at startup.
    // The tools themselves will return a clean error if herdr is down.
    console.warn(
      "[pi-herdr] herdr server not reachable. " +
        "Tools will return {ok: false, error: ...} until herdr is started. " +
        `Reason: ${alive.error}`,
    );
  }
}

// Named export so tests / external scripts can register a curated subset of
// tools without going through the full default activation.
export { tools as defaultTools };
