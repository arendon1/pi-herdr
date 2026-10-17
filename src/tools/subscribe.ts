// Tools: herdr_subscribe, herdr_poll, herdr_unsubscribe
//
// The event-subscription pattern. NEVER spin-poll in the extension: each
// herdr_poll call is a single async socket call with an explicit timeout,
// so the agent's main thread is never locked. The agent implements "wait
// for X" by calling herdr_poll in a loop with short timeouts (1–5s), which
// is bounded by the agent's own context budget.
//
// The extension itself is stateless about subscriptions: the agent owns
// the subscription_id from subscribe() and passes it back to poll().

import { HerdrClient, TIMEOUTS, safeTimeoutMs } from "../herdr-client.js";
import type {
  PollResult,
  SubscribeResult,
  SubscriptionTopic,
  ToolResult,
} from "../types.js";

// --- herdr_subscribe --------------------------------------------------------

const KNOWN_TOPICS: ReadonlyArray<SubscriptionTopic> = [
  "agent_state",
  "agent_session",
  "pane_focus",
  "pane_state",
  "tab_focus",
  "workspace_focus",
  "session_saved",
  "release_notes",
  "product_announcement",
];

export const subscribeToolDefinition = {
  name: "herdr_subscribe",
  label: "herdr_subscribe",
  description:
    "Start an event subscription on the Herdr server. Returns a " +
    "subscription_id. Pass it to herdr_poll to receive events. Each " +
    "herdr_poll is a single bounded async call; never blocks the agent.",
  parameters: {
    type: "object",
    properties: {
      topics: {
        type: "array",
        items: {
          type: "string",
          enum: [...KNOWN_TOPICS],
        },
        description: "Event topics to subscribe to. Must be non-empty.",
      },
      timeout_ms: { type: "number" },
    },
    required: ["topics"],
    additionalProperties: false,
  },
  async execute(
    args: { topics: SubscriptionTopic[]; timeout_ms?: number },
    _ctx: unknown,
  ): Promise<ToolResult<SubscribeResult>> {
    if (!Array.isArray(args.topics) || args.topics.length === 0) {
      return { ok: false, error: "topics must be a non-empty array", code: "bad_input" };
    }
    const client = new HerdrClient({
      timeoutMs: safeTimeoutMs(args.timeout_ms, TIMEOUTS.default),
    });
    return client.request("events.subscribe", {
      subscriptions: args.topics.map((topic) => ({ topic })),
    });
  },
};

// --- herdr_poll -------------------------------------------------------------

export const pollToolDefinition = {
  name: "herdr_poll",
  label: "herdr_poll",
  description:
    "Wait for new events on an existing Herdr subscription. Single async " +
    "call bounded by timeout_ms (default 5000, max 600000). Returns when " +
    "any event arrives OR the timeout fires (with timed_out=true).",
  parameters: {
    type: "object",
    properties: {
      subscription_id: { type: "string", description: "From herdr_subscribe." },
      timeout_ms: {
        type: "number",
        description: "Max wait for events. Default 5000. The agent should " +
          "use short values to avoid holding context.",
      },
    },
    required: ["subscription_id"],
    additionalProperties: false,
  },
  async execute(
    args: { subscription_id: string; timeout_ms?: number },
    _ctx: unknown,
  ): Promise<ToolResult<PollResult>> {
    if (!args.subscription_id || typeof args.subscription_id !== "string") {
      return { ok: false, error: "subscription_id required", code: "bad_input" };
    }
    const client = new HerdrClient({
      timeoutMs: safeTimeoutMs(args.timeout_ms, TIMEOUTS.default),
    });
    return client.request("events.wait", {
      subscription_id: args.subscription_id,
    });
  },
};

// --- herdr_unsubscribe ------------------------------------------------------

export const unsubscribeToolDefinition = {
  name: "herdr_unsubscribe",
  label: "herdr_unsubscribe",
  description: "Close a Herdr event subscription. Idempotent.",
  parameters: {
    type: "object",
    properties: {
      subscription_id: { type: "string" },
      timeout_ms: { type: "number" },
    },
    required: ["subscription_id"],
    additionalProperties: false,
  },
  async execute(
    args: { subscription_id: string; timeout_ms?: number },
    _ctx: unknown,
  ): Promise<ToolResult<{ closed: boolean }>> {
    if (!args.subscription_id) {
      return { ok: false, error: "subscription_id required", code: "bad_input" };
    }
    const client = new HerdrClient({
      timeoutMs: safeTimeoutMs(args.timeout_ms, TIMEOUTS.default),
    });
    return client.request("events.unsubscribe", {
      subscription_id: args.subscription_id,
    });
  },
};
