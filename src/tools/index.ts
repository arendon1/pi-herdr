// Barrel + registration helper. Imports every tool and calls
// `pi.registerTool(...)` for each. Follows the zellij-agent-bridge pattern.
//
// All tools are always registered. If herdr is unreachable, the tools
// surface a clean error result on invocation — they don't crash the agent.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { snapshotTool } from "./snapshot.ts";
import { paneListTool, paneReadTool, paneSendTextTool } from "./pane.ts";
import { agentListTool, agentPromptTool } from "./agent.ts";
import { waitEventTool } from "./events.ts";

export function registerAllTools(pi: ExtensionAPI): void {
  pi.registerTool(snapshotTool);
  pi.registerTool(paneListTool);
  pi.registerTool(paneReadTool);
  pi.registerTool(paneSendTextTool);
  pi.registerTool(agentListTool);
  pi.registerTool(agentPromptTool);
  pi.registerTool(waitEventTool);
}

// Re-export for tests / external scripts that want a curated subset.
export {
  snapshotTool,
  paneListTool,
  paneReadTool,
  paneSendTextTool,
  agentListTool,
  agentPromptTool,
  waitEventTool,
};
