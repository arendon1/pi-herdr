// Tools: herdr_pane_list, herdr_pane_read, herdr_pane_send_text
// Read-only or write operations on individual panes. Every tool is async with
// a bounded timeout; nothing here blocks the agent.

import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { HerdrClient, TIMEOUTS, safeTimeoutMs } from "../herdr-client.ts";
import { herdrResultToAgent, READONLY_ANNOTATIONS, MUTATING_ANNOTATIONS } from "./_helpers.ts";

// --- herdr_pane_list -------------------------------------------------------

export const paneListTool = defineTool({
  name: "herdr_pane_list",
  label: "Herdr: list panes",
  description:
    "List all panes in the Herdr session, optionally filtered by workspace. " +
    "Returns pane id, workspace, tab, focused, agent name/status, and cwd.",
  parameters: Type.Object({
    workspace_id: Type.Optional(
      Type.String({ description: "Optional workspace id (e.g. 'wG') to filter by." }),
    ),
    timeout_ms: Type.Optional(Type.Number({ minimum: 1 })),
  }),
  outputSchema: Type.Object({ panes: Type.Array(Type.Any()) }),
  annotations: READONLY_ANNOTATIONS,
  promptGuidelines: ["Use workspace_id to scope to a single Herdr workspace when relevant."],
  async execute(_id, params, _signal) {
    const client = new HerdrClient({
      timeoutMs: safeTimeoutMs(params.timeout_ms, TIMEOUTS.default),
    });
    return herdrResultToAgent(
      await client.request("pane.list", { workspace_id: params.workspace_id ?? null }),
    );
  },
});

// --- herdr_pane_read --------------------------------------------------------

const ReadSource = StringEnum(["visible", "recent", "recent_unwrapped", "detection"] as const);
const ReadFormat = StringEnum(["text", "ansi"] as const);

export const paneReadTool = defineTool({
  name: "herdr_pane_read",
  label: "Herdr: read pane",
  description:
    "Read recent output from a Herdr pane. Use 'recent_unwrapped' for logs " +
    "and transcripts (soft-wrapped lines joined). Returns text or ansi.",
  parameters: Type.Object({
    pane_id: Type.String({
      description: "Pane id (e.g. 'wG:p1') or 'current' for the focused pane.",
    }),
    source: Type.Optional(ReadSource),
    lines: Type.Optional(
      Type.Number({ description: "Max rows to return (default 120, max 5000).", minimum: 1, maximum: 5000 }),
    ),
    format: Type.Optional(ReadFormat),
    timeout_ms: Type.Optional(Type.Number({ minimum: 1 })),
  }),
  outputSchema: Type.Any(),
  annotations: READONLY_ANNOTATIONS,
  promptGuidelines: [
    "Prefer source='recent_unwrapped' for logs and transcripts.",
    "Use source='detection' for the plain-text bottom-buffer that Herdr uses for agent detection.",
  ],
  async execute(_id, params, _signal) {
    const client = new HerdrClient({
      timeoutMs: safeTimeoutMs(params.timeout_ms, TIMEOUTS.default),
    });
    const lines = params.lines ?? 120;
    return herdrResultToAgent(
      await client.request("pane.read", {
        pane_id: params.pane_id,
        source: params.source ?? "recent_unwrapped",
        lines,
        format: params.format ?? "text",
      }),
    );
  },
});

// --- herdr_pane_send_text ---------------------------------------------------

export const paneSendTextTool = defineTool({
  name: "herdr_pane_send_text",
  label: "Herdr: send text to pane",
  description:
    "Send raw text + Enter to a Herdr pane. Use this only for ordinary " +
    "processes. For coding agents, prefer herdr_agent_prompt which respects " +
    "bracketed-paste mode and the agent's lifecycle.",
  parameters: Type.Object({
    pane_id: Type.String({ description: "Pane id (e.g. 'wG:p1')." }),
    text: Type.String({ description: "Text to send (Enter appended automatically)." }),
    timeout_ms: Type.Optional(Type.Number({ minimum: 1 })),
  }),
  outputSchema: Type.Object({ submitted: Type.Boolean() }),
  annotations: MUTATING_ANNOTATIONS,
  promptGuidelines: [
    "Do NOT use this for coding agents. Use herdr_agent_prompt instead.",
    "Wait for an interactive prompt in the target pane before sending.",
  ],
  async execute(_id, params, _signal) {
    const client = new HerdrClient({
      timeoutMs: safeTimeoutMs(params.timeout_ms, TIMEOUTS.default),
    });
    return herdrResultToAgent(
      await client.request("pane.send_text", {
        pane_id: params.pane_id,
        text: params.text,
      }),
    );
  },
});
