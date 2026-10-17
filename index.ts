// pi-herdr extension entry point.
//
// Verified pi extension contract (from @earendil-works/pi-coding-agent
// source — see `defineTool`, `ExtensionAPI`, `AgentToolResult`):
//   - default export: async function (pi: ExtensionAPI): Promise<void>
//   - use pi.registerTool(...) for each tool
//   - use pi.on("before_agent_start", ...) to inject the system prompt
//
// Hard rule (from soul core memory): never lock the main thread of
// conversation with the agent. Every tool is async, has a bounded
// timeout, returns errors as values, and never spin-polls. Tools use
// HerdrClient under the hood; see src/herdr-client.ts for the wire layer.
//
// Setup expectations:
//   1. herdr server must be running (HERDR_SOCKET_PATH or ~/.config/herdr/herdr.sock)
//   2. `herdr integration install pi` should be run so Herdr recognizes pi
//      sessions and records the session path (source="herdr:pi")
//
// On load we do a single liveness ping (2s) and log a warning if herdr
// isn't reachable. The warning is non-fatal — the tools themselves
// return a clean error result if herdr is down.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { HerdrClient } from "./src/herdr-client.ts";
import { registerAllTools } from "./src/tools/index.ts";
import { SYSTEM_PROMPT_PREAMBLE, TOOL_SNIPPET } from "./src/prompts.ts";

export default async function (pi: ExtensionAPI): Promise<void> {
  // 1. Probe: is herdr reachable? Non-fatal — the tools handle the
  //    "herdr down" case themselves with a clean error result.
  const probe = new HerdrClient();
  const alive = await probe.ping(2_000);
  if (!alive) {
    console.warn(
      "[pi-herdr] herdr server not reachable. " +
        "Tools will return clean error results until herdr is started. " +
        "Run `herdr` to start it, or `herdr integration install pi` to " +
        "register this Pi session for tracking.",
    );
  }

  // 2. Register all tools. Always-on; if herdr is down, each tool
  //    surfaces a clean error on invocation.
  registerAllTools(pi);

  // 3. Inject the herdr preamble into the system prompt. The full
  //    reference is in skills/herdr/SKILL.md; this is the brief,
  //    always-on reminder.
  pi.on("before_agent_start", async (event) => {
    const base = event.systemPrompt ?? "";
    const injected = `${SYSTEM_PROMPT_PREAMBLE}\n\nAvailable tools: ${TOOL_SNIPPET}`;
    return {
      systemPrompt: base ? `${base}\n\n${injected}` : injected,
    };
  });
}
