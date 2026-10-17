// Async socket client for Herdr's newline-delimited JSON IPC.
//
// Hard rule: never block the agent's main thread. Every operation is:
//   1. async (uses node:net's async connect/write/end)
//   2. bounded by an explicit timeout (default 5s, override per-call)
//   3. connection-per-request (matches Herdr's own protocol; no shared state)
//   4. returns {ok, data} or {ok, error} — never throws to the caller
//
// Wire protocol (from herdr v0.9.5, src/api/{client,server}.rs):
//   - one JSON line out:  {"method": "x.y", "params": {...}, "id": "..."}
//   - one JSON line in:   {"id": "...", "result": {...}}  OR  {"id": "...", "error": {...}}
//   - server closes connection after responding
//
// Default socket: $HERDR_SOCKET_PATH or ~/.config/herdr/herdr.sock

import { connect, type Socket } from "node:net";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { IpcRequest, IpcResponse, ToolResult } from "./types.js";

const DEFAULT_TIMEOUT_MS = 5_000;
const LONG_TIMEOUT_MS = 30_000;
const VERY_LONG_TIMEOUT_MS = 120_000;

const HERDR_CONFIG_PATH =
  process.env.HERDR_CONFIG_PATH ??
  join(homedir(), ".config", "herdr", "config.toml");

// Per-request-id counter so the server can match responses. The wire protocol
// accepts any string id; the server just echoes it back.
let nextId = 0;
function newId(): string {
  nextId = (nextId + 1) >>> 0;
  return `pi-herdr-${Date.now().toString(36)}-${nextId.toString(36)}`;
}

export interface HerdrClientOptions {
  /** Override the socket path. Defaults to $HERDR_SOCKET_PATH then ~/.config/herdr/herdr.sock */
  socketPath?: string;
  /** Per-request timeout in ms. Default 5000. */
  timeoutMs?: number;
  /** Optional AbortSignal — combines with timeoutMs; either fires cancels. */
  signal?: AbortSignal;
}

export class HerdrClient {
  private readonly defaultTimeoutMs: number;
  private socketPath: string | undefined;

  constructor(opts: HerdrClientOptions = {}) {
    this.defaultTimeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (opts.socketPath) this.socketPath = opts.socketPath;
  }

  /**
   * Resolve the socket path. Order:
   *   1. explicit socketPath from constructor
   *   2. $HERDR_SOCKET_PATH
   *   3. ~/.config/herdr/herdr.sock
   *
   * Returns undefined if the path can't be resolved or doesn't exist.
   */
  async resolveSocketPath(): Promise<string | undefined> {
    if (this.socketPath) return this.socketPath;
    const envPath = process.env.HERDR_SOCKET_PATH;
    if (envPath && existsSync(envPath)) {
      this.socketPath = envPath;
      return envPath;
    }
    const home = process.env.HOME ?? homedir();
    const defaultPath = join(home, ".config", "herdr", "herdr.sock");
    if (existsSync(defaultPath)) {
      this.socketPath = defaultPath;
      return defaultPath;
    }
    return undefined;
  }

  /**
   * Make a single IPC call. Opens a fresh connection, writes one line, reads
   * one line, closes. Always bounded by `timeoutMs` (or the default).
   *
   * Returns a `ToolResult` so callers can never throw out to the agent.
   */
  async request<R = unknown, P = unknown>(
    method: string,
    params: P,
    opts: HerdrClientOptions = {},
  ): Promise<ToolResult<R>> {
    const socketPath = await this.resolveSocketPath();
    if (!socketPath) {
      return {
        ok: false,
        error: "herdr socket not found (set HERDR_SOCKET_PATH or start the herdr server)",
        code: "socket_not_found",
      };
    }

    const timeoutMs = opts.timeoutMs ?? this.defaultTimeoutMs;
    const id = newId();
    const request: IpcRequest<P> = { method, params, id };

    // Combine our timeout with any caller-supplied AbortSignal.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
    const onCallerAbort = () => controller.abort(opts.signal?.reason);
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort(opts.signal.reason);
      else opts.signal.addEventListener("abort", onCallerAbort, { once: true });
    }

    try {
      const outcome = await this.exchange(socketPath, request, controller.signal);
      if (outcome.kind === "aborted") {
        const reason = controller.signal.reason;
        const isTimeout = reason instanceof Error && reason.message === "timeout";
        return {
          ok: false,
          error: isTimeout
            ? `herdr ${method}: timed out after ${timeoutMs}ms`
            : `herdr ${method}: aborted (${String(reason)})`,
          code: isTimeout ? "timeout" : "aborted",
        };
      }
      if (outcome.kind === "error") {
        return {
          ok: false,
          error: outcome.err.message || `herdr ${method} failed`,
          code: "client_error",
        };
      }
      // outcome.kind === "ok"
      const response = outcome.response;
      if ("error" in response) {
        return {
          ok: false,
          error: response.error.message || `herdr ${method} failed`,
          code: response.error.code || "herdr_error",
        };
      }
      return { ok: true, data: response.result as R };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        code: "client_error",
      };
    } finally {
      clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener("abort", onCallerAbort);
    }
  }

  /**
   * One connection, one request, one response. Returns a discriminated union
   * so the caller can distinguish "ok" from "aborted" from "transport error".
   */
  private exchange<P>(
    socketPath: string,
    request: IpcRequest<P>,
    signal: AbortSignal,
  ): Promise<
    | { kind: "ok"; response: IpcResponse }
    | { kind: "aborted" }
    | { kind: "error"; err: Error }
  > {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve({ kind: "aborted" });
        return;
      }

      const socket: Socket = connect(socketPath);
      let buffer = "";
      let settled = false;

      const settle = (
        value:
          | { kind: "ok"; response: IpcResponse }
          | { kind: "aborted" }
          | { kind: "error"; err: Error },
      ) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        socket.removeAllListeners();
        socket.destroy();
        resolve(value);
      };

      const onAbort = () => settle({ kind: "aborted" });
      signal.addEventListener("abort", onAbort, { once: true });

      socket.once("error", (err) => settle({ kind: "error", err }));

      socket.once("connect", () => {
        socket.write(JSON.stringify(request) + "\n", (err) => {
          if (err) {
            settle({ kind: "error", err });
            return;
          }
          socket.end();
        });
      });

      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        // Herdr responses are exactly one line. Find the first newline.
        const nl = buffer.indexOf("\n");
        if (nl >= 0) {
          const line = buffer.slice(0, nl).trim();
          if (!line) {
            settle({ kind: "error", err: new Error("empty response from herdr") });
            return;
          }
          try {
            const parsed = JSON.parse(line) as IpcResponse;
            settle({ kind: "ok", response: parsed });
          } catch (err) {
            settle({
              kind: "error",
              err: new Error(`invalid JSON from herdr: ${(err as Error).message}`),
            });
          }
        }
      });

      socket.on("end", () => {
        if (!settled) {
          settle({
            kind: "error",
            err: new Error("herdr closed connection without sending a response"),
          });
        }
      });
    });
  }

  /**
   * Lightweight liveness check. Uses a short timeout. Returns true if herdr
   * server is reachable AND answered the ping.
   */
  async ping(timeoutMs = 2_000): Promise<boolean> {
    const r = await this.request("ping", {}, { timeoutMs });
    return r.ok;
  }
}

// --- Helpers used by tool implementations ----------------------------------

/** Coerce a user-supplied ms value into a safe positive integer. */
export function safeTimeoutMs(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (value < 1) return fallback; // < 1ms is not a useful timeout
  return Math.min(Math.floor(value), 10 * 60_000); // cap at 10 minutes
}

export const TIMEOUTS = {
  default: DEFAULT_TIMEOUT_MS,
  long: LONG_TIMEOUT_MS,
  veryLong: VERY_LONG_TIMEOUT_MS,
} as const;

// Re-export for convenience
export { HERDR_CONFIG_PATH };
