// Shared helpers for tool implementations. Mirrors the pattern from
// zellij-agent-bridge's src/tools/_helpers.ts.
//
// Every tool in this extension follows the same conversion: take a
// HerdrClient.ToolResult and turn it into an AgentToolResult that the
// pi runtime can hand back to the model. Tools never throw out to the
// agent — they always return an error-shaped result.

import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { ToolResult as HerdrToolResult } from "../herdr-client.ts";

/** Coerce any thrown/non-thrown error into a structured failure result. */
export function errorResult(err: unknown): AgentToolResult<{ error: { code: string; message: string } }> {
  if (err && typeof err === "object" && "code" in err && "message" in err) {
    const e = err as { code: unknown; message: unknown };
    return {
      content: [{ type: "text", text: `error: ${String(e.message)}` }],
      details: { error: { code: String(e.code), message: String(e.message) } },
      isError: true,
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text", text: `error: ${msg}` }],
    details: { error: { code: "client_error", message: msg } },
    isError: true,
  };
}

/**
 * Build a successful AgentToolResult. The model gets the one-liner
 * (usually pretty-printed JSON); structured data is in `details` and
 * `structuredContent` for programmatic callers.
 */
export function okResult<T>(text: string, value: T): AgentToolResult<T> {
  const result = {
    content: [{ type: "text", text }],
    details: value,
    structuredContent: value,
  } as AgentToolResult<T>;
  return result;
}

/**
 * Convert a HerdrClient request result into an AgentToolResult. On
 * success, returns the pretty-printed JSON text and the data. On
 * failure, returns a structured error.
 */
export function herdrResultToAgent<T>(r: HerdrToolResult<T>): AgentToolResult<T> {
  if (r.ok) {
    return okResult<T>(JSON.stringify(r.data, null, 2), r.data);
  }
  return errorResult({ code: r.code ?? "herdr_error", message: r.error });
}

/** Standard read-only annotation. */
export const READONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** Standard "mutates herdr state" annotation. */
export const MUTATING_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;
