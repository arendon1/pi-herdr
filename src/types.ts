// Type definitions for the Herdr IPC surface. Names mirror the JSON schema
// (`herdr api schema`, schema_version 1, protocol 22). Optional fields are
// marked with `?` even when the schema says they're always present, because
// the server may evolve.

export type ProtocolVersion = 22;
export type EndpointGeneration = 1;

// --- Agent state machine -----------------------------------------------------

export type AgentStatus = "working" | "blocked" | "done" | "idle" | "unknown";

export interface AgentSession {
  agent: string;
  kind: string;
  source?: string;
  value?: string;
}

export interface AgentSummary {
  agent: string;
  agent_session?: AgentSession;
  agent_status: AgentStatus;
  completion_seq?: number;
  cwd?: string;
  focused: boolean;
  foreground_cwd?: string;
  pane_id: PaneId;
  revision: number;
  screen_detection_skipped?: boolean;
  state_change_seq: number;
  tab_id: TabId;
  terminal_id?: string;
  terminal_title?: string;
  terminal_title_stripped?: string;
  workspace_id: WorkspaceId;
}

// --- Workspaces / tabs / panes ----------------------------------------------

export type WorkspaceId = string; // e.g. "wG"
export type TabId = `${WorkspaceId}:t${number}`; // e.g. "wG:t1"
export type PaneId = `${WorkspaceId}:p${number}`; // e.g. "wG:p1"

export interface PaneSummary {
  pane_id: PaneId;
  workspace_id: WorkspaceId;
  tab_id: TabId;
  terminal_id?: string;
  agent?: string;
  agent_session?: AgentSession;
  agent_status?: AgentStatus;
  cwd?: string;
  focused: boolean;
  foreground_cwd?: string;
  revision: number;
  scroll?: { max_offset_from_bottom: number; offset_from_bottom: number; viewport_rows: number };
}

export interface TabSummary {
  tab_id: TabId;
  workspace_id: WorkspaceId;
  number: number;
  label?: string;
  pane_count: number;
  focused: boolean;
  agent_status?: AgentStatus;
}

export interface WorkspaceSummary {
  workspace_id: WorkspaceId;
  number: number;
  label?: string;
  focused: boolean;
  tab_count: number;
  pane_count: number;
  active_tab_id: TabId;
  agent_status?: AgentStatus;
}

// --- Session snapshot -------------------------------------------------------

export interface SessionSnapshot {
  protocol: ProtocolVersion;
  version: string;
  focused_workspace_id?: WorkspaceId;
  focused_tab_id?: TabId;
  focused_pane_id?: PaneId;
  workspaces: WorkspaceSummary[];
  tabs: TabSummary[];
  panes: PaneSummary[];
  agents: AgentSummary[];
  layouts: unknown[];
}

// --- Pane read output -------------------------------------------------------

export type ReadSource = "visible" | "recent" | "recent-unwrapped" | "detection";
export type ReadFormat = "text" | "ansi";

export interface PaneReadResult {
  pane_id: PaneId;
  source: ReadSource;
  format: ReadFormat;
  text: string;
  bytes: number;
}

// --- Agent prompt / wait ---------------------------------------------------

export type AgentPromptWaitUntil = AgentStatus | "submitted";

export interface AgentPromptParams {
  target: string; // agent name or pane id
  text: string;
  wait?: boolean;
  until?: AgentPromptWaitUntil[];
  timeout_ms?: number;
}

export interface AgentPromptResult {
  ok: boolean;
  state?: AgentStatus;
  submitted?: boolean;
  blocked?: boolean;
  error?: string;
}

// --- Events ----------------------------------------------------------------

export type SubscriptionTopic =
  | "agent_state"
  | "agent_session"
  | "pane_focus"
  | "pane_state"
  | "tab_focus"
  | "workspace_focus"
  | "session_saved"
  | "release_notes"
  | "product_announcement";

export interface SubscriptionEvent {
  event: string;
  data: unknown;
  subscription_id: string;
  seq?: number;
}

export interface SubscribeResult {
  subscription_id: string;
  active_topics: SubscriptionTopic[];
}

export interface PollResult {
  events: SubscriptionEvent[];
  timed_out: boolean;
}

// --- IPC envelopes ---------------------------------------------------------

export interface IpcRequest<P = unknown> {
  method: string;
  params: P;
  id?: string;
}

export type IpcResponse<R = unknown> =
  | { id: string; result: R }
  | { id: string; error: { code: string; message: string; data?: unknown } };

// --- Tool result envelope (returned by every pi tool) ---------------------

export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };
