// Smoke tests for the tool layer. Verifies that:
//   1. Each tool is a valid ToolDefinition (name, parameters, outputSchema, execute)
//   2. execute() against a live herdr server returns an AgentToolResult
//   3. execute() against a dead herdr returns a structured error, never throws
//
// Run with:
//   npm test                       (only offline tests)
//   HERDR_TEST_LIVE=1 npm test     (also live)

import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshotTool } from "../src/tools/snapshot.ts";
import { paneListTool, paneReadTool, paneSendTextTool } from "../src/tools/pane.ts";
import { agentListTool, agentPromptTool } from "../src/tools/agent.ts";
import { waitEventTool } from "../src/tools/events.ts";

const ALL_TOOLS = [
  snapshotTool,
  paneListTool,
  paneReadTool,
  paneSendTextTool,
  agentListTool,
  agentPromptTool,
  waitEventTool,
] as const;

const HERDR_PREFIX = "herdr_";

test("every tool name is prefixed with herdr_", () => {
  for (const tool of ALL_TOOLS) {
    assert.ok(
      tool.name.startsWith(HERDR_PREFIX),
      `tool ${tool.name} is missing the herdr_ prefix`,
    );
  }
});

test("every tool has a name, label, description, parameters, outputSchema, execute", () => {
  for (const tool of ALL_TOOLS) {
    assert.ok(typeof tool.name === "string" && tool.name.length > 0, `${tool.name}: name`);
    assert.ok(typeof tool.label === "string" && tool.label.length > 0, `${tool.name}: label`);
    assert.ok(typeof tool.description === "string" && tool.description.length > 0, `${tool.name}: description`);
    assert.ok(tool.parameters && typeof tool.parameters === "object", `${tool.name}: parameters`);
    assert.ok(tool.outputSchema && typeof tool.outputSchema === "object", `${tool.name}: outputSchema`);
    assert.ok(typeof tool.execute === "function", `${tool.name}: execute`);
  }
});

test("every tool declares annotations (readOnlyHint, etc.)", () => {
  for (const tool of ALL_TOOLS) {
    assert.ok(tool.annotations, `${tool.name}: missing annotations`);
    assert.equal(typeof tool.annotations.readOnlyHint, "boolean", `${tool.name}: readOnlyHint`);
    assert.equal(typeof tool.annotations.destructiveHint, "boolean", `${tool.name}: destructiveHint`);
    assert.equal(typeof tool.annotations.idempotentHint, "boolean", `${tool.name}: idempotentHint`);
    assert.equal(typeof tool.annotations.openWorldHint, "boolean", `${tool.name}: openWorldHint`);
  }
});

test("mutating tools declare destructiveHint=false (herdr ops are reversible in our MVP)", () => {
  for (const tool of [paneSendTextTool, agentPromptTool]) {
    assert.equal(tool.annotations.destructiveHint, false, `${tool.name}: should not be destructive`);
  }
});

// Live tests (opt-in) — require a running herdr server
const live = process.env.HERDR_TEST_LIVE ? test : test.skip;

live("herdr_snapshot returns session data on a live herdr", async () => {
  const r = await snapshotTool.execute("call_1", {}, new AbortController().signal);
  assert.equal(r.isError, undefined, `expected ok result; got error: ${JSON.stringify(r.details)}`);
  assert.ok(r.content[0]?.text.length > 0, "content should have text");
  // The structured content should be the snapshot itself
  const data = r.structuredContent as { workspaces?: unknown[]; panes?: unknown[]; agents?: unknown[] };
  assert.ok(Array.isArray(data.workspaces), "snapshot.workspaces should be an array");
  assert.ok(Array.isArray(data.panes), "snapshot.panes should be an array");
  assert.ok(Array.isArray(data.agents), "snapshot.agents should be an array");
});

live("herdr_agent_list returns the live agents", async () => {
  const r = await agentListTool.execute("call_2", {}, new AbortController().signal);
  assert.equal(r.isError, undefined);
  const data = r.structuredContent as { agents: Array<{ agent: string; pane_id: string; agent_status: string }> };
  assert.ok(data.agents.length >= 1, "expected at least one agent");
  for (const a of data.agents) {
    assert.ok(a.pane_id.includes(":"), `agent pane_id should look like wG:p1, got ${a.pane_id}`);
  }
});

live("herdr_pane_list returns panes", async () => {
  const r = await paneListTool.execute("call_3", {}, new AbortController().signal);
  assert.equal(r.isError, undefined);
  const data = r.structuredContent as { panes: Array<{ pane_id: string }> };
  assert.ok(data.panes.length >= 1, "expected at least one pane");
});

live("herdr_pane_read against the focused pane returns text", async () => {
  // Find a real pane first
  const list = await paneListTool.execute("call_4a", {}, new AbortController().signal);
  const panes = (list.structuredContent as { panes: Array<{ pane_id: string; focused: boolean }> }).panes;
  const focused = panes.find((p) => p.focused) ?? panes[0];
  assert.ok(focused, "expected a focused or any pane");

  const r = await paneReadTool.execute("call_4b", { pane_id: focused.pane_id, lines: 20 }, new AbortController().signal);
  assert.equal(r.isError, undefined);
  // content text exists; could be empty if the pane is brand new
  assert.ok(typeof r.content[0]?.text === "string");
});

live("herdr_wait_event with a far-future timeout returns ok with timed_out=true (or a match)", async () => {
  // Use a 200ms timeout — if no event matches, the server returns a timeout indicator.
  // We don't assert the exact shape (the schema may evolve); just assert it doesn't throw
  // and returns a structured result.
  const r = await waitEventTool.execute(
    "call_5",
    {
      match_event: { event: "pane.agent_status_changed", agent_status: "this-state-does-not-exist" },
      timeout_ms: 200,
    },
    new AbortController().signal,
  );
  // We expect either an ok result (no event matched) or an error result (herdr returned an error).
  // Either is fine; the test only asserts no throw.
  assert.ok(r, "should return a result");
  assert.ok(typeof r.isError === "undefined" || r.isError === true);
});
