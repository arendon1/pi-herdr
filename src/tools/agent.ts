// Tools: herdr_agent_list, herdr_agent_prompt
// The two most-used agent operations. herdr_agent_prompt with --wait is the
// correct way to block on a long-running agent turn: a single async socket
// call, bounded by timeout_ms. NEVER spin-poll in the extension.

import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { HerdrClient, TIMEOUTS, safeTimeoutMs } from "../herdr-client.ts";
import { herdrResultToAgent, READONLY_ANNOTATIONS, MUTATING_ANNOTATIONS } from "./_helpers.ts";

// --- herdr_agent_list -------------------------------------------------------

export const agentListTool = defineTool({
  name: "herdr_agent_list",
  label: "Herdr: list agents",
  description:
    "List all coding agents Herdr recognizes in the current session, with " +
    "their pane id, status (working/blocked/done/idle/unknown), and session path.",
  parameters: Type.Object({
    timeout_ms: Type.Optional(Type.Number({ minimum: 1 })),
  }),
  outputSchema: Type.Object({ agents: Type.Array(Type.Any()) }),
  annotations: READONLY_ANNOTATIONS,
  async execute(_id, params, _signal) {
    const client = new HerdrClient({
      timeoutMs: safeTimeoutMs(params.timeout_ms, TIMEOUTS.default),
    });
    return herdrResultToAgent(await client.request("agent.list", {}));
  },
});

// --- herdr_agent_prompt -----------------------------------------------------

const AgentStatus = StringEnum(
  ["working", "blocked", "done", "idle", "unknown", "submitted"] as const,
  { description: "Settled-state set for --wait." },
);

export const agentPromptTool = defineTool({
  name: "herdr_agent_prompt",
  label: "Herdr: prompt agent",
  description:
    "Send a prompt to a recognized Herdr agent (pi, claude, codex, etc.). " +
    "If wait=true (default), blocks on a single async socket call until the " +
    "agent reaches a settled state (idle/done/blocked) or the timeout fires. " +
    "Returns the final agent_status. Bounded by timeout_ms (default 30s, " +
    "max 10min). Use 'target' = the agent's unique name or its pane id.",
  parameters: Type.Object({
    target: Type.String({
      description: "Agent name (e.g. 'reviewer') or pane id (e.g. 'wG:p1').",
    }),
    text: Type.String({ description: "The prompt to send." }),
    wait: Type.Optional(
      Type.Boolean({ description: "Block until settled state or timeout. Default true." }),
    ),
    until: Type.Optional(
      Type.Array(AgentStatus, {
        description:
          "Specific states to wait for. Overrides the default settled set " +
          "(idle/done/blocked). Use e.g. ['blocked'] to wait for an approval dialog.",
      }),
    ),
    timeout_ms: Type.Optional(Type.Number({ minimum: 1, maximum: 600_000 })),
  }),
  outputSchema: Type.Any(),
  annotations: MUTATING_ANNOTATIONS,
  promptGuidelines: [
    "If the agent is already waiting at an approval/question dialog, this returns " +
    "agent_blocked without sending. Inspect with herdr_pane_read or herdr_agent_list first.",
    "With wait=true, this is a single async call — never spin-poll in your own reasoning.",
    "Use until=['blocked'] when you expect a permission dialog.",
  ],
  async execute(_id, params, _signal) {
    const client = new HerdrClient({
      timeoutMs: safeTimeoutMs(params.timeout_ms, TIMEOUTS.long),
    });
    return herdrResultToAgent(
      await client.request("agent.prompt", {
        target: params.target,
        text: params.text,
        wait: params.wait ?? true,
        until: params.until ?? null,
      }),
    );
  },
});
