# pi-herdr design plan

**Version 1.0** · prepared 2026-10-17, updated after Plan subagent review.

This document is the long-term design. The shipped MVP at this commit is
Phase 1 + parts of Phase 4. The remaining phases are pending review.

## Verified facts (from the herdr source tree)

- **Wire protocol**: newline-delimited JSON over `~/.config/herdr/herdr.sock`.
  Connection-per-request for short calls; long-lived for streaming.
  Source: `~/herdr/src/api/{client,server,subscriptions,wait}.rs`.
- **`events.subscribe`**: long-lived connection. Server responds with
  `{"result":{"type":"SubscriptionStarted"}}` and then writes event lines
  on the same connection until the client disconnects. Source:
  `src/api/server.rs:914` (`stream_subscriptions`).
- **`events.wait`**: server-side long-poll. Client sends one request with
  `{match_event: {event: "...", ...}, timeout_ms}`; server holds the
  connection open, polls the event hub, and writes one response when the
  predicate matches or the timeout fires. Source: `src/api/wait.rs`
  (`wait_for_output` etc.).
- **Herdr versions**: binary v0.9.5, schema version 22, endpoint generation 1,
  102 methods across 19 groups.

## Pi extension contract (verified from `~/projects/zellij-agent-bridge`)

- **Default export**: `async function (pi: ExtensionAPI): Promise<void>`
  where `ExtensionAPI` is imported from `@earendil-works/pi-coding-agent`.
- **Tools**: `defineTool({ name, label, description, parameters, outputSchema,
  annotations, promptGuidelines, executionMode, async execute(_id, params, signal,
  onUpdate, ctx) })`. (Note: the Plan subagent's design proposed Zod; the
  actual convention is TypeBox. Corrected here.)
- **Schemas**: `Type.Object({...})` from `typebox`. Enums use
  `StringEnum([...])` from `@earendil-works/pi-ai`.
- **Result type**: `AgentToolResult<T> = { content: [{type: "text", text}],
  details: T, isError?: boolean, structuredContent?: T }`. Use the
  `okResult(text, value)` / `errorResult(err)` helpers.
- **Prompt injection**: `pi.on("before_agent_start", async (event) => ({
  systemPrompt: base + injected }))`. (The MVP originally used
  `agent_start`; corrected to `before_agent_start`.)
- **Annotations**: `{ readOnlyHint, destructiveHint, idempotentHint,
  openWorldHint }` per tool.
- **Execution mode**: `"sequential"` for tools that can't run in parallel.

## Hard rules (baked into every implementation)

1. **Never lock the main thread of conversation with the agent.** Every
   tool is `async` with a bounded `timeout_ms` (capped at 10 min via
   `safeTimeoutMs`). No spin-wait loops. For state-change waits, use
   `events.wait` (server-side long-poll, single async call) or chain
   `events.wait` calls under agent control.
2. **Never throw to the agent.** All errors return `errorResult(err)`;
   no uncaught exceptions escape `execute`.
3. **Connection-per-request** for short calls; **long-lived** for
   event streams (managed by an internal `HerdrStream` class, not
   exposed as a tool).
4. **Bounded timeouts everywhere.** Default 5s for reads, 30s for
   prompts, 120s for long waits. Hard cap 10 min.
5. **Errors are values, not throws.** The model decides what to do.

## Phased delivery

The MVP at this commit delivers **Phase 1 + parts of Phase 4**. Phases
2, 3, 5, 6 are pending.

### Phase 1 — Socket client + core awareness ✅ (this commit)
- `src/herdr-client.ts` — async socket client (newline JSON)
- `src/types.ts` — TS types mirroring Herdr's schema
- 9 MVP tools: `herdr_snapshot`, `herdr_pane_list`, `herdr_pane_read`,
  `herdr_pane_send_text`, `herdr_agent_list`, `herdr_agent_prompt`,
  `herdr_subscribe`, `herdr_poll`, `herdr_unsubscribe`
- `skills/herdr/SKILL.md` — bundled agent reference
- 6 unit tests + 1 opt-in live test (verified against the running
  herdr v0.9.5 server in 103ms)
- `index.ts` — extension entry, wires tools to pi's `ExtensionAPI`
- This `PLAN.md` — long-term design

### Phase 2 — Positioning + layout (pending)
- `herdr_focus_pane/workspace/tab/agent`
- `herdr_pane_split/close/zoom/move/resize`
- `herdr_workspace_create/close/rename`
- `herdr_tab_create/close/rename`
- Topology model: in-memory tree of `Workspace → Tab → Pane → Agent`
  built from `session.snapshot`, patched by events (see Phase 3).

### Phase 3 — Event stream + live topology (pending)
- `src/transport/stream.ts` — `HerdrStream` class: long-lived connection
  for `events.subscribe`. Auto-reconnect with exponential backoff.
  Re-fetches `session.snapshot` on reconnect to resync.
- `herdr_subscribe(topics)` — internal: opens a stream, pushes events
  into the topology model. Returns a handle for `herdr_wait_event`.
- `herdr_wait_event(handle, predicate, timeout_ms)` — agent blocks on
  a specific event matching the predicate. Single async call. Uses
  the underlying stream's queued events.
- `herdr_emit_notification(title, body)` — `notification.show` for
  the agent to surface progress to the human.
- Topology model patches from events: agent_status, focus, created,
  closed. No re-polling needed.

### Phase 4 — Agent-level interaction ✅ (partial, this commit)
- `herdr_agent_prompt` — done (Phase 1)
- `herdr_agent_wait` — pending (could use `events.wait` with
  `match_event: {event: "pane.agent_status_changed", pane_id, agent_status}`)
- `herdr_agent_read` — pending (pane.read with source=detection)
- `herdr_agent_send_keys` — pending (agent.send_keys)
- `herdr_agent_rename` — pending (agent.rename)
- `herdr_agent_focus` — pending (agent.focus)
- `herdr_agent_start` — pending (agent.start with kind=pi)
- `herdr_agent_release` — pending (pane.release_agent)

### Phase 5 — Bifurcation (pending)
The "fire-and-forget child Pi" feature. Heuristic to detect when a user
steering message is unrelated to current work, then:
1. `workspace.create` with `env` injection of child identity
2. `pane.split` for the initial terminal
3. `agent.start` with `kind: "pi"` in the new pane
4. Write a handoff JSON file the child reads on startup
5. `notification.show` to the human
6. Parent does NOT block on child — fire-and-forget

Open design questions (deferred until the user wants this phase):
- Focus behavior on spawn (move human to child ws vs. notify)
- Child closes its own workspace on completion, or leave it
- Git worktree mode or shared cwd
- Auto-bifurcation policy: explicit-keywords only, or also structural
  signals from the heuristic

### Phase 6 — Polish + docs (pending)
- Full `docs/` directory
- `scripts/doctor.ts` standalone verification
- Integration tests using `herdr --session test` (never the live session)
- README screenshots and examples

## Open questions

1. **Bifurcation focus behavior** (Phase 5): see above
2. **Config location**: TOML in our repo (proposed) vs. Pi's
   `settings.json#packages` block. The MVP doesn't use external config
   yet, so defer.
3. **Test session**: integration tests should use
   `herdr --session test` (isolated server). Already documented in
   the test file; need an opt-in `npm run test:live`.

## Files delivered in this commit

```
.gitignore
CHANGELOG.md
LICENSE
PLAN.md                        ← this file
README.md
index.ts                       ← extension entry, registers tools
package.json                   ← pi-package metadata
tsconfig.json
skills/herdr/SKILL.md
src/
├── herdr-client.ts            ← async socket client
├── types.ts                   ← Herdr schema types
└── tools/
    ├── snapshot.ts            ← herdr_snapshot
    ├── pane.ts                ← herdr_pane_{list,read,send_text}
    ├── agent.ts               ← herdr_agent_{list,prompt}
    └── subscribe.ts           ← herdr_{subscribe,poll,unsubscribe}
test/
└── herdr-client.test.ts       ← 6 unit + 1 opt-in live
```
