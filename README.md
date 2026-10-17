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

Nine `herdr_*` tools, all async with bounded timeouts:

| Tool | Purpose |
|---|---|
| `herdr_snapshot` | Full session state (workspaces, tabs, panes, agents) in one call |
| `herdr_agent_list` | List recognized coding agents and their status |
| `herdr_agent_prompt` | Send a prompt to a named agent; optional `--wait` blocks on a single async call |
| `herdr_pane_list` | List panes, optionally filtered by workspace |
| `herdr_pane_read` | Read recent output from a pane |
| `herdr_pane_send_text` | Send raw text + Enter to a non-agent pane |
| `herdr_subscribe` | Start an event subscription (returns `subscription_id`) |
| `herdr_poll` | Bounded poll for events on a subscription |
| `herdr_unsubscribe` | Close a subscription |

A bundled `skills/herdr/SKILL.md` is auto-loaded by Pi, so the agent knows
when to use these tools and how to combine them.

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
# Type-check
npm run typecheck

# Run the test suite (smoke tests for the socket client)
npm test
```

The extension is plain TypeScript with no transpile step — Pi's runtime
strips types on the fly (Node ≥ 22.19). Keep imports using `.js` extensions
for ESM compatibility (TypeScript will resolve them via `moduleResolution:
Bundler`).

## Layout

```
pi-herdr/
├── index.ts                 # Extension entry; registers tools with Pi
├── package.json             # pi-package metadata
├── tsconfig.json            # Strict TS config (noUncheckedIndexedAccess)
├── src/
│   ├── herdr-client.ts      # Async socket client (newline JSON)
│   ├── types.ts             # TypeScript types mirroring the Herdr schema
│   └── tools/
│       ├── snapshot.ts      # herdr_snapshot
│       ├── pane.ts          # herdr_pane_{list,read,send_text}
│       ├── agent.ts         # herdr_agent_{list,prompt}
│       └── subscribe.ts     # herdr_{subscribe,poll,unsubscribe}
├── skills/
│   └── herdr/
│       └── SKILL.md         # Bundled agent reference
├── test/                    # Smoke tests for the socket client
├── README.md
├── LICENSE                  # MIT
└── CHANGELOG.md
```

## License

MIT — see [LICENSE](./LICENSE).
