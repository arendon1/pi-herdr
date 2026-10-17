// Tool: herdr_snapshot
// Returns the full session state (workspaces, tabs, panes, agents) in one call.
// Bounded by `timeout_ms` (default 5s, max 10min).

import { HerdrClient, TIMEOUTS, safeTimeoutMs } from "../herdr-client.js";
import type { SessionSnapshot, ToolResult } from "../types.js";

export const snapshotToolDefinition = {
  name: "herdr_snapshot",
  label: "herdr_snapshot",
  description:
    "Return the full Herdr session state: workspaces, tabs, panes, agents, " +
    "and the focused IDs. Single round-trip. Async; bounded by timeout_ms.",
  parameters: {
    type: "object",
    properties: {
      timeout_ms: {
        type: "number",
        description: "Max wait in ms (default 5000, max 600000).",
      },
    },
    additionalProperties: false,
  },
  async execute(
    args: { timeout_ms?: number },
    _ctx: unknown,
  ): Promise<ToolResult<SessionSnapshot>> {
    const client = new HerdrClient({
      timeoutMs: safeTimeoutMs(args.timeout_ms, TIMEOUTS.default),
    });
    // Herdr's session.snapshot returns {type: "session_snapshot", snapshot: <SessionSnapshot>}.
    // Unwrap so the tool's data field is the SessionSnapshot directly.
    const result = await client.request<
      { type: string; snapshot: SessionSnapshot },
      Record<string, never>
    >("session.snapshot", {});
    if (!result.ok) return result;
    return { ok: true, data: result.data.snapshot };
  },
};
