# Changelog

All notable changes to `pi-herdr` are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-17

### Added
- Initial release. Pi extension that integrates with Herdr (v0.9.5+).
- Async socket client speaking Herdr's newline-delimited JSON IPC protocol.
- 5 MVP tools: `herdr_snapshot`, `herdr_pane_list`, `herdr_pane_read`,
  `herdr_agent_prompt`, `herdr_subscribe`, `herdr_poll`.
- Event subscription pattern using `events.subscribe` + `events.wait`
  (long-poll, never blocks the agent's conversation thread).
- Bundled `herdr` skill for agents using the extension.
- Hard rule: no tool ever locks the main thread of conversation.
