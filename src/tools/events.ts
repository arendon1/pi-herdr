// Tool: herdr_wait_event
//
// One-shot server-side long-poll for a specific Herdr event matching a
// predicate. Single async call bounded by timeout_ms; the agent drives
// the loop if it wants to wait for several events. NEVER spin-poll in
// the extension.
//
// Wire contract (verified in ~/herdr/src/api/wait.rs):
//   {"method": "events.wait",
//    "params": {"match_event": {event: "...", ...fields...}, "timeout_ms": N}}
//
// The server holds the connection open, polls the event hub, and writes
// one response when the predicate matches or the timeout fires. If you
// need a continuous event stream (for the topology model), use a
// long-lived events.subscribe connection — that's an internal concern,
// not exposed as a tool.

import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { HerdrClient, TIMEOUTS, safeTimeoutMs } from "../herdr-client.ts";
import { herdrResultToAgent, READONLY_ANNOTATIONS } from "./_helpers.ts";

export const waitEventTool = defineTool({
  name: "herdr_wait_event",
  label: "Herdr: wait for event",
  description:
    "Block until a Herdr event matching a predicate arrives, or the timeout " +
    "fires. Single async call bounded by timeout_ms (default 5000, max " +
    "600000). Each call is independent — the agent drives the loop.",
  parameters: Type.Object({
    match_event: Type.Object(
      {
        event: Type.String({
          description:
            "Event name (e.g. 'pane.agent_status_changed', 'pane.focused', " +
            "'workspace.focused', 'pane.created', 'pane.closed').",
        }),
        pane_id: Type.Optional(
          Type.String({ description: "Pane id filter (for pane-scoped events)." }),
        ),
        workspace_id: Type.Optional(
          Type.String({ description: "Workspace id filter (for workspace-scoped events)." }),
        ),
        // Additional event-specific fields. We accept any string/number/bool
        // keys for flexibility — Herdr's predicate format varies by event.
        agent_status: Type.Optional(
          Type.String({
            description: "For agent_status_changed: working/blocked/done/idle/unknown.",
          }),
        ),
      },
      {
        description:
          "Predicate object passed to Herdr's events.wait. The 'event' field " +
          "is required; the others are event-specific filters.",
      },
    ),
    timeout_ms: Type.Optional(
      Type.Number({
        description: "Max wait in ms. Default 5000. Hard cap 600000.",
        minimum: 1,
        maximum: 600_000,
      }),
    ),
  }),
  outputSchema: Type.Any(),
  annotations: { ...READONLY_ANNOTATIONS, idempotentHint: false },
  promptGuidelines: [
    "Each herdr_wait_event call is one async call — chain them to wait for " +
    "several events in sequence rather than relying on this tool to return " +
    "multiple events.",
    "The agent's main thread is never locked: the server holds the connection, " +
    "not the extension.",
    "Common predicates: {event:'pane.agent_status_changed', pane_id:'wG:p1', " +
    "agent_status:'idle'} blocks until that pane's agent goes idle.",
  ],
  async execute(_id, params, _signal) {
    const client = new HerdrClient({
      timeoutMs: safeTimeoutMs(params.timeout_ms, TIMEOUTS.default),
    });
    return herdrResultToAgent(
      await client.request("events.wait", {
        match_event: params.match_event,
      }),
    );
  },
});
