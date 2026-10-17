---
name: herdr
description: "Inspect and control Herdr-managed panes, agents, and workspaces from inside Pi using the pi-herdr extension. Use when the user asks about other panes, wants to split a pane, send a prompt to a sibling agent, or read another agent's output. Do NOT use for direct terminal I/O the user is currently focused on — that's their own pane."
---

# Herdr (via pi-herdr)

This is the **pi-side** skill. It teaches an agent running **inside a Herdr pane** how to use the `herdr_*` tools the `pi-herdr` extension exposes. It is **not** a substitute for the canonical Herdr skill (`herdr --skill`); that one teaches the `herdr` CLI directly. The two compose: pi's `herdr_*` tools call the same Herdr server the CLI does.

## What you can do

- `herdr_snapshot` — full session state in one call (workspaces, tabs, panes, agents, focused IDs)
- `herdr_agent_list` — list recognized coding agents and their status
- `herdr_agent_prompt` — send a prompt to a named agent or pane-id-hosted agent; `--wait` blocks on a single async socket call
- `herdr_pane_list` — list panes (optionally filtered by workspace)
- `herdr_pane_read` — read recent output from a pane (`recent-unwrapped` is the safe default for logs)
- `herdr_pane_send_text` — send raw text + Enter to a pane (use only for ordinary processes, not coding agents)
- `herdr_subscribe` / `herdr_poll` / `herdr_unsubscribe` — push-style event subscription

## Hard rules

1. **Never lock the conversation thread.** Every `herdr_*` tool is async with a bounded timeout. Don't combine them into a busy-wait loop in your own reasoning. To wait for state change, use `herdr_agent_prompt` with `wait: true` (single async call) or the `subscribe` + `poll` pair (each poll is bounded).
2. **Don't poll `herdr_agent_list` in a loop** to detect when an agent finishes. Use `subscribe` + `poll` for state-change events, or use `agent.prompt --wait` to block on a single turn.
3. **Don't send raw text to a coding agent's pane.** Use `agent.prompt` — it respects bracketed-paste mode and the agent's lifecycle (`blocked` rejections, etc.).
4. **Default to the calling pane and cwd** for splits and shells. Don't move the user's focus without being asked (`--no-focus`).
5. **If a tool returns `{ok: false, error: ...}`**, surface the error to the user — don't silently retry. Common causes: herdr not running, agent not idle, subscription expired, network timeout.

## Common patterns

### Inspect what's running

```
herdr_snapshot                          # full state
herdr_agent_list                        # just agents + statuses
herdr_pane_list --workspace_id "wG"     # panes in a specific workspace
```

### Read another agent's recent output

```
herdr_pane_read pane_id="wG:p1" source="recent-unwrapped" lines=200
```

### Send a prompt and wait for it to settle

```
herdr_agent_prompt target="reviewer" text="Review the diff and report only actionable findings." wait=true timeout_ms=120000
```

The default `wait=true` blocks until the agent reaches a settled state (idle/done/blocked) or the timeout fires. Single async call, never spin-poll.

### Wait for an approval dialog

```
herdr_agent_prompt target="reviewer" text="Continue" wait=true until=["blocked"] timeout_ms=60000
```

The `until` parameter narrows the wait to a specific state. Use `["blocked"]` when you expect a permission dialog.

### Subscribe to events and drain them

```
# Open the subscription
herdr_subscribe topics=["agent_state", "pane_focus"]
# → returns {"subscription_id": "sub-..."}

# Poll for events, bounded by timeout_ms
herdr_poll subscription_id="sub-..." timeout_ms=5000
# → returns {"events": [...], "timed_out": false}

# Repeat the poll as needed. When done:
herdr_unsubscribe subscription_id="sub-..."
```

Each `herdr_poll` is a single async call. The agent controls the loop; the extension never spin-polls.

## When NOT to use these tools

- For the user's **own focused pane**, do not call `herdr_pane_read` — that's what the user sees. If you need your own context, look at your own conversation, not the pane.
- For ordinary shell work in a **new** shell, prefer `pane_split` + `pane_send_text` to get a sibling pane, not `agent.prompt`.
- For deep cross-machine work (SSH profiles, remote Herdr servers), you need `herdr --machine` semantics which this extension does not yet expose — fall back to spawning `herdr --machine <id> ...` via the bash tool.

## Errors and recovery

| `error` | Cause | Recovery |
|---|---|---|
| `herdr socket not found` | Herdr not running | Tell the user to run `herdr` |
| `timed out after Nms` | Operation exceeded its budget | Inspect state with `herdr_snapshot`; raise timeout if appropriate |
| `agent_not_ready` | Agent not in a settled state | Wait or inspect with `herdr_agent_list` |
| `agent_blocked` | Agent is waiting for approval | Read the pane, ask the user how to respond |
| `unknown subscription` | Subscription expired or was on a different server | Re-subscribe with `herdr_subscribe` |
