// Tools: herdr_pane_list, herdr_pane_read, herdr_pane_send_text
// Read-only or write operations on individual panes. Every tool is async with
// a bounded timeout; nothing here blocks the agent.

import { HerdrClient, TIMEOUTS, safeTimeoutMs } from "../herdr-client.js";
import type { PaneReadResult, PaneSummary, ReadSource, ReadFormat, ToolResult } from "../types.js";

// --- herdr_pane_list -------------------------------------------------------

export const paneListToolDefinition = {
  name: "herdr_pane_list",
  label: "herdr_pane_list",
  description:
    "List all panes in the Herdr session, optionally filtered by workspace. " +
    "Returns pane id, workspace, tab, focused, agent name/status, and cwd.",
  parameters: {
    type: "object",
    properties: {
      workspace_id: {
        type: "string",
        description: "Optional workspace id (e.g. 'wG') to filter by.",
      },
      timeout_ms: { type: "number" },
    },
    additionalProperties: false,
  },
  async execute(
    args: { workspace_id?: string; timeout_ms?: number },
    _ctx: unknown,
  ): Promise<ToolResult<{ panes: PaneSummary[] }>> {
    const client = new HerdrClient({
      timeoutMs: safeTimeoutMs(args.timeout_ms, TIMEOUTS.default),
    });
    return client.request("pane.list", {
      workspace_id: args.workspace_id ?? null,
    });
  },
};

// --- herdr_pane_read --------------------------------------------------------

export const paneReadToolDefinition = {
  name: "herdr_pane_read",
  label: "herdr_pane_read",
  description:
    "Read recent output from a Herdr pane. Use 'recent-unwrapped' for logs " +
    "and transcripts (soft-wrapped lines joined). Returns text or ansi.",
  parameters: {
    type: "object",
    properties: {
      pane_id: {
        type: "string",
        description: "Pane id (e.g. 'wG:p1') or 'current' for the focused pane.",
      },
      source: {
        type: "string",
        enum: ["visible", "recent", "recent-unwrapped", "detection"],
        description: "What to read. Default: 'recent-unwrapped'.",
      },
      lines: {
        type: "number",
        description: "Max rows to return (default 120, max 5000).",
      },
      format: {
        type: "string",
        enum: ["text", "ansi"],
        description: "Output format. Default: 'text'.",
      },
      timeout_ms: { type: "number" },
    },
    required: ["pane_id"],
    additionalProperties: false,
  },
  async execute(
    args: {
      pane_id: string;
      source?: ReadSource;
      lines?: number;
      format?: ReadFormat;
      timeout_ms?: number;
    },
    _ctx: unknown,
  ): Promise<ToolResult<PaneReadResult>> {
    const client = new HerdrClient({
      timeoutMs: safeTimeoutMs(args.timeout_ms, TIMEOUTS.default),
    });
    const lines = Math.min(Math.max(args.lines ?? 120, 1), 5000);
    return client.request("pane.read", {
      pane_id: args.pane_id,
      source: args.source ?? "recent-unwrapped",
      lines,
      format: args.format ?? "text",
    });
  },
};

// --- herdr_pane_send_text ---------------------------------------------------

export const paneSendTextToolDefinition = {
  name: "herdr_pane_send_text",
  label: "herdr_pane_send_text",
  description:
    "Send raw text + Enter to a Herdr pane. Use this only for ordinary " +
    "processes. For coding agents, prefer herdr_agent_prompt which respects " +
    "bracketed-paste mode and the agent's lifecycle.",
  parameters: {
    type: "object",
    properties: {
      pane_id: { type: "string", description: "Pane id (e.g. 'wG:p1')." },
      text: { type: "string", description: "Text to send (Enter appended automatically)." },
      timeout_ms: { type: "number" },
    },
    required: ["pane_id", "text"],
    additionalProperties: false,
  },
  async execute(
    args: { pane_id: string; text: string; timeout_ms?: number },
    _ctx: unknown,
  ): Promise<ToolResult<{ submitted: boolean }>> {
    const client = new HerdrClient({
      timeoutMs: safeTimeoutMs(args.timeout_ms, TIMEOUTS.default),
    });
    return client.request("pane.send_text", {
      pane_id: args.pane_id,
      text: args.text,
    });
  },
};
