// Tools: herdr_agent_list, herdr_agent_prompt
// The two most-used agent operations. herdr_agent_prompt with --wait is the
// correct way to block on a long-running agent turn: a single async socket
// call, bounded by timeout_ms. NEVER spin-poll in the extension.

import { HerdrClient, TIMEOUTS, safeTimeoutMs } from "../herdr-client.js";
import type {
  AgentPromptResult,
  AgentPromptWaitUntil,
  AgentSummary,
  ToolResult,
} from "../types.js";

// --- herdr_agent_list -------------------------------------------------------

export const agentListToolDefinition = {
  name: "herdr_agent_list",
  label: "herdr_agent_list",
  description:
    "List all coding agents Herdr recognizes in the current session, with " +
    "their pane id, status (working/blocked/done/idle/unknown), and session path.",
  parameters: {
    type: "object",
    properties: {
      timeout_ms: { type: "number" },
    },
    additionalProperties: false,
  },
  async execute(
    args: { timeout_ms?: number },
    _ctx: unknown,
  ): Promise<ToolResult<{ agents: AgentSummary[] }>> {
    const client = new HerdrClient({
      timeoutMs: safeTimeoutMs(args.timeout_ms, TIMEOUTS.default),
    });
    return client.request("agent.list", {});
  },
};

// --- herdr_agent_prompt -----------------------------------------------------

export const agentPromptToolDefinition = {
  name: "herdr_agent_prompt",
  label: "herdr_agent_prompt",
  description:
    "Send a prompt to a recognized Herdr agent (pi, claude, codex, etc.). " +
    "If wait=true (default), blocks on a single async socket call until the " +
    "agent reaches a settled state (idle/done/blocked) or the timeout fires. " +
    "Returns the final agent_status. Bounded by timeout_ms (default 30s, " +
    "max 10min). Use 'target' = the agent's unique name or its pane id.",
  parameters: {
    type: "object",
    properties: {
      target: {
        type: "string",
        description: "Agent name (e.g. 'reviewer') or pane id (e.g. 'wG:p1').",
      },
      text: {
        type: "string",
        description: "The prompt to send.",
      },
      wait: {
        type: "boolean",
        description: "Block until settled state or timeout. Default true.",
      },
      until: {
        type: "array",
        items: {
          type: "string",
          enum: ["working", "blocked", "done", "idle", "unknown", "submitted"],
        },
        description:
          "Specific states to wait for. Overrides the default settled set " +
          "(idle/done/blocked). Use e.g. ['blocked'] to wait for an approval dialog.",
      },
      timeout_ms: {
        type: "number",
        description: "Max wait in ms (default 30000, max 600000).",
      },
    },
    required: ["target", "text"],
    additionalProperties: false,
  },
  async execute(
    args: {
      target: string;
      text: string;
      wait?: boolean;
      until?: AgentPromptWaitUntil[];
      timeout_ms?: number;
    },
    _ctx: unknown,
  ): Promise<ToolResult<AgentPromptResult>> {
    const client = new HerdrClient({
      timeoutMs: safeTimeoutMs(args.timeout_ms, TIMEOUTS.long),
    });
    const params = {
      target: args.target,
      text: args.text,
      wait: args.wait ?? true,
      until: args.until ?? null,
    };
    return client.request<AgentPromptResult, typeof params>("agent.prompt", params);
  },
};
