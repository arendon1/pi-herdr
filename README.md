# pi-herdr

Pi extension that integrates with [Herdr](https://herdr.dev), a terminal workspace
manager for AI coding agents. Gives Pi tools to inspect, control, and coordinate
panes, agents, and workspaces — without leaving the conversation.

## Install

```bash
# 1. Push this repo to GitHub under your account
# 2. From inside Pi:
pi install git:github.com/<your-username>/pi-herdr
# 3. Reload Pi (Ctrl+X, Ctrl+R or /reload)
# 4. Verify herdr is running and the `pi` integration is installed:
herdr integration install pi
```

## What you get

Seven `herdr_*` tools, all async with bounded timeouts. Every tool uses
pi's actual `defineTool` + TypeBox shape, with proper `outputSchema`,
`annotations`, and `promptGuidelines` so the model sees structured output
and accurate capability hints.

| Tool | Purpose |
|---|---|
| `herdr_snapshot` | Full session state (workspaces, tabs, panes, agents) in one call |
| `herdr_agent_list` | List recognized coding agents and their status |
| `herdr_agent_prompt` | Send a prompt to a named agent; `wait=true` blocks on a single async call until the agent settles (idle/done/blocked) or the timeout fires. `until` narrows the wait to specific states. |
| `herdr_pane_list` | List panes, optionally filtered by workspace |
| `herdr_pane_read` | Read recent output from a pane (`recent_unwrapped` is the safe default for logs) |
| `herdr_pane_send_text` | Send raw text + Enter to a non-agent pane |
| `herdr_wait_event` | One-shot server-side long-poll for an event matching a predicate. Single async call; the server holds the connection, the extension never spin-polls. |

A bundled `skills/herdr/SKILL.md` is auto-loaded by Pi, so the agent knows
when to use these tools and how to combine them. The extension also injects
a brief preamble into the system prompt on `before_agent_start` so the
model is aware of the `herdr_*` namespace and the no-main-thread-lock rule.

## Hard rules (baked into the design)

1. **Never lock the conversation thread.** Every tool is async with a bounded
   `timeout_ms`. No spin-wait loops anywhere. Long waits are a single
   `agent.prompt --wait` call or a `subscribe` + bounded `poll` pair — the
   agent drives the loop, the extension never does.
2. **Never throw to the agent.** Tools return `{ok: false, error, code}` on
   failure. The agent decides what to do.
3. **Bounded timeouts everywhere.** Default 5s for reads, 30s for prompts,
   120s for long waits. Every tool accepts an optional `timeout_ms`. Hard
   cap at 10 minutes (`safeTimeoutMs`).

## Architecture

```
┌─────────────┐       async tool call      ┌──────────────┐
│  Pi agent   │ ────────────────────────▶  │  pi-herdr    │
│  (LLM)      │ ◀──── JSON result ─────    │  extension   │
└─────────────┘                            └──────┬───────┘
                                                   │ newline-delimited JSON
                                                   │ over Unix domain socket
                                                   ▼
                                            ┌──────────────┐
                                            │   herdr      │
                                            │   server     │
                                            └──────────────┘
```

- **Wire protocol** — newline-delimited JSON over a Unix domain socket
  (`~/.config/herdr/herdr.sock` by default). One request, one response,
  connection-per-request. Sourced from Herdr's own `src/api/client.rs`.
- **Schema** — `herdr api schema --output schema.json` (v0.9.5, protocol 22,
  generation 1, 102 methods). The extension uses a curated subset.
- **No state in the extension** — every call is stateless from the
  extension's perspective. The agent owns subscription IDs and session
  state. Reloading Pi doesn't lose anything the server doesn't already
  have.

## Develop

```bash
# Install (no symlinks needed — the sd-card fs doesn't support them)
npm install --no-bin-links

# Run the test suite (offline + herdr-down edge cases)
npm test

# Run the test suite WITH a live herdr server
HERDR_TEST_LIVE=1 npm test
```

The extension is plain TypeScript with no transpile step — Pi's runtime
strips types on the fly (Node ≥ 22.19). Source imports use `.ts`
extensions (so `node --experimental-strip-types` can resolve them
without a build step); the test runner uses `node --experimental-strip-types`.

## Layout

```
pi-herdr/
├── index.ts                 # Extension entry; (pi: ExtensionAPI) => Promise<void>
├── package.json             # pi-package metadata + peer/regular deps
├── tsconfig.json            # Strict TS config (noUncheckedIndexedAccess)
├── PLAN.md                  # Long-term design (6 phases; this is phase 1 + 4 partial)
├── src/
│   ├── herdr-client.ts      # Async socket client (newline JSON)
│   ├── types.ts             # TypeScript types mirroring the Herdr schema
│   ├── prompts.ts           # System-prompt preamble + tool snippet
│   └── tools/
│       ├── _helpers.ts      # okResult, errorResult, herdrResultToAgent
│       ├── snapshot.ts      # herdr_snapshot
│       ├── pane.ts          # herdr_pane_{list,read,send_text}
│       ├── agent.ts         # herdr_agent_{list,prompt}
│       ├── events.ts        # herdr_wait_event
│       └── index.ts         # registerAllTools(pi)
├── skills/
│   └── herdr/
│       └── SKILL.md         # Bundled agent reference
├── test/
│   ├── herdr-client.test.ts # Wire layer (6 offline + 1 opt-in live)
│   └── tools.test.ts        # Tool layer shape + execute() contracts
├── README.md
├── LICENSE                  # MIT
└── CHANGELOG.md
```

## Long-term plan

See `PLAN.md` for the full design (prepared by a Plan subagent, verified
against the herdr source tree). The MVP at this commit is **Phase 1 +
parts of Phase 4**. Remaining phases:

- **Phase 2** — positioning + layout tools (`herdr_focus_*`, `herdr_pane_split`,
  `herdr_workspace_create`, etc.)
- **Phase 3** — long-lived event stream + live topology model
  (`HerdrStream` class, `events.subscribe` push, topology patching)
- **Phase 5** — bifurcation: fire-and-forget child Pi spawning for
  unrelated user steering messages
- **Phase 6** — docs, `doctor.ts`, hardened integration tests

The hard rule holds across all phases: **no tool ever locks the main
thread of conversation with the agent**.

## License

MIT — see [LICENSE](./LICENSE).
