// System prompt preamble + tool snippet. Injected into the model's context
// on `before_agent_start` so the agent knows:
//   1. It's inside a Herdr pane (when HERDR_ENV=1)
//   2. The herdr_* tool namespace is available
//   3. The hard rules: don't spin-poll, don't throw, etc.
//
// The bundled skills/herdr/SKILL.md provides deeper reference; this
// preamble is the always-on, brief reminder.

export const SYSTEM_PROMPT_PREAMBLE = `## Herdr environment

You are operating inside a Herdr terminal workspace manager. Herdr organizes
terminals into workspaces → tabs → panes → agents, and recognizes coding
agents (pi, claude, codex, ...) running inside panes. The herdr_* tool
namespace gives you programmatic control over that surface.

Tools available:
- \`herdr_snapshot\` — full session state
- \`herdr_pane_list\` / \`herdr_pane_read\` / \`herdr_pane_send_text\` — pane ops
- \`herdr_agent_list\` / \`herdr_agent_prompt\` — agent ops
- \`herdr_wait_event\` — block on a specific event matching a predicate

Read \`skills/herdr/SKILL.md\` for the full reference, including common
patterns and the no-main-thread-lock rule.`;

export const TOOL_SNIPPET = `herdr_* (9 tools: snapshot, pane_list, pane_read, pane_send_text, agent_list, agent_prompt, wait_event). Read skills/herdr/SKILL.md for usage.`;

export const COMMON_GUIDELINES = [
  "Use herdr_snapshot first when you need an overview of the environment.",
  "Never spin-poll herdr_agent_list to detect state changes — use herdr_wait_event with a predicate instead.",
  "For ordinary shells, use herdr_pane_send_text. For coding agents, use herdr_agent_prompt.",
];

export const STREAMING_GUIDELINES = [
  "herdr_wait_event is a single async call bounded by timeout_ms. The server holds the connection; the extension never spin-polls.",
];
