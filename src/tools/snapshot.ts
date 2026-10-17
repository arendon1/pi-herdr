// Tool: herdr_snapshot
// Returns the full session state (workspaces, tabs, panes, agents) in one call.
// Bounded by `timeout_ms` (default 5s, max 10min).

import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { HerdrClient, TIMEOUTS, safeTimeoutMs } from "../herdr-client.ts";
import { herdrResultToAgent, okResult, READONLY_ANNOTATIONS } from "./_helpers.ts";
import type { SessionSnapshot } from "../types.ts";

export const snapshotTool = defineTool({
  name: "herdr_snapshot",
  label: "Herdr: snapshot",
  description:
    "Return the full Herdr session state: workspaces, tabs, panes, agents, " +
    "and the focused IDs. Single round-trip. Async; bounded by timeout_ms.",
  parameters: Type.Object({
    timeout_ms: Type.Optional(
      Type.Number({ description: "Max wait in ms (default 5000, max 600000).", minimum: 1 }),
    ),
  }),
  outputSchema: Type.Any({ description: "SessionSnapshot object as defined by Herdr schema v22." }),
  annotations: READONLY_ANNOTATIONS,
  promptGuidelines: [
    "Use this to see the full topology before splitting, focusing, or sending prompts.",
    "The result is a large JSON object; if you only need a slice, prefer the more specific tools (herdr_pane_list, herdr_agent_list).",
  ],
  async execute(_id, params, _signal) {
    const client = new HerdrClient({
      timeoutMs: safeTimeoutMs(params.timeout_ms, TIMEOUTS.default),
    });
    // Herdr's session.snapshot returns {type, snapshot}; unwrap to give the
    // model the snapshot itself.
    const r = await client.request<
      { type: string; snapshot: SessionSnapshot },
      Record<string, never>
    >("session.snapshot", {});
    if (!r.ok) return herdrResultToAgent(r);
    return okResult(JSON.stringify(r.data.snapshot, null, 2), r.data.snapshot);
  },
});
