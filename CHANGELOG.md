# Changelog

All notable changes to `pi-herdr` are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-17

### Added
- Initial release. Pi extension that integrates with Herdr (v0.9.5+).
- Async socket client speaking Herdr's newline-delimited JSON IPC protocol.
- 7 MVP tools, using pi's actual `defineTool` + TypeBox shape:
  - `herdr_snapshot` — full session state
  - `herdr_pane_list` / `herdr_pane_read` / `herdr_pane_send_text`
  - `herdr_agent_list` / `herdr_agent_prompt` (with `wait` + `until`)
  - `herdr_wait_event` — one-shot server-side long-poll with a predicate
- System-prompt injection via `pi.on("before_agent_start", ...)` with a brief
  preamble that points the agent to the bundled `herdr` skill.
- Bundled `skills/herdr/SKILL.md` for agents using the extension.
- Hard rule baked in: no tool ever locks the main thread of conversation.
  Every I/O is async, bounded, and never spin-polls. For state-change waits,
  use `herdr_wait_event` (single async server-side long-poll) or chain calls
  under the agent's own control.

### Verified
- Live-tested against the running herdr v0.9.5 server. 16/16 tests pass
  offline; 16/16 pass with `HERDR_TEST_LIVE=1`.
- Wire protocol verified by reading `~/herdr/src/api/{client,server,wait,subscriptions}.rs`:
  - `events.subscribe` is a long-lived push connection.
  - `events.wait` is a server-side long-poll (the server holds the connection,
    the extension never spin-polls).
- Pi extension contract verified against `@earendil-works/pi-coding-agent`:
  default export is `(pi: ExtensionAPI) => Promise<void>`, tools use
  `defineTool` with `Type.Object` parameters, errors return as `AgentToolResult`.
