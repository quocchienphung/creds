import type { KnowledgeTransport } from "../storage/knowledge-contract.ts";

/**
 * The contract between the workspace screens and whatever stores their data.
 *
 * Every persisted thing in the workspace (companies, contacts, settings, the map, the invoice…) is a named
 * resource. A screen never touches storage or the network: it asks the store for a resource, and the store
 * talks to a `WorkspaceBackend`. The default backend keeps everything in this browser; `createHttpBackend`
 * speaks a documented REST convention (docs/backend-api.md) and any other transport can implement the same
 * interface.
 */
export type ResourceName =
  | "workspaces" | "active-workspace" | "profile" | "preferences" | "feedback" | "security-preview" | "interface-language"
  | "companies" | "contacts" | "views" | "active-tab" | "favorites" | "news" | "checklist" | "pixel-connected" | "documents" | "folders"
  | "report-period" | "reports"
  | "run-draft" | "agent-run"
  | "command-settings" | "settings-general" | "settings-members" | "settings-billing" | "settings-api-keys"
  | "mapping" | "invoice" | "file-library" | "process" | "process-run" | "skill-library" | "skill-events" | "knowledge-library";

/** Read-only data a screen shows but never edits (the backend computes it). */
export type QueryName = "analytics" | "usage" | "invoices" | "plans";
/** Actions whose result only the backend can produce (a secret, an uploaded file's URL). */
export type CommandName = "api-key.create" | "skill.transfer";

export type UploadKind = "avatar" | "logo" | "document";

export interface ResourceRef { name: ResourceName; workspaceId?: string }

export type ChangeOp = "create" | "update" | "delete";
/** One record that differs between the last saved collection and the one being saved. */
export interface Change { op: ChangeOp; id: string; value?: unknown; previous?: unknown }

export interface Loaded<T> { value: T; /** Opaque revision used for optimistic concurrency. */ version?: string }

export interface SaveContext<T> {
  /** The last value known to be stored (what this save is based on). */
  previous?: T;
  /** For collections of records with ids: created, updated and deleted records. */
  changes?: Change[];
  /** Domain commands that produced this value (the map sends its edit commands). */
  commands?: unknown[];
  baseVersion?: string;
  /** The page is closing: use a transport that survives it. */
  unloading?: boolean;
  signal?: AbortSignal;
}
export interface SaveResult { version?: string }

/** A run the backend drives: the screen sends user actions and shows the snapshots the backend reports. */
export interface RunTransport {
  /** Send a user action (approve, deny, stop, retry, edit the plan). Resolves with the new snapshot when known. */
  send(workspaceId: string, action: unknown, signal?: AbortSignal): Promise<unknown | void>;
}

export interface WorkspaceBackend {
  readonly kind: string;
  /** True when data leaves this browser. Secrets are then stripped from what is saved. */
  readonly remote: boolean;
  /** How long the store waits after an edit before saving. */
  readonly debounceMs: number;
  /** Reads a resource synchronously when that is possible (this browser's storage). Undefined means "cannot tell without a request". Lets a screen show stored data on its first render instead of flashing its defaults. */
  peek?<T>(ref: ResourceRef): Loaded<T> | null | undefined;
  /** Resolves null when nothing is stored yet, so the screen starts from its defaults. */
  load<T>(ref: ResourceRef, signal?: AbortSignal): Promise<Loaded<T> | null>;
  save<T>(ref: ResourceRef, value: T, context: SaveContext<T>): Promise<SaveResult | void>;
  /** Push changes made elsewhere (another tab or person) into the screen. Returns the unsubscribe function. */
  subscribe?<T>(ref: ResourceRef, listener: (loaded: Loaded<T>) => void, hint?: { poll?: boolean }): () => void;
  /** Computed data: undefined means "use the built-in sample". */
  query?<T>(name: QueryName, workspaceId: string, params: Record<string, string | number>, signal?: AbortSignal): Promise<T | undefined>;
  command?<I, O>(name: CommandName, workspaceId: string, input: I, signal?: AbortSignal): Promise<O>;
  /** Present when the backend, not the browser, advances the agent run. */
  run?: RunTransport;
  /** Original document bytes, full text indexes, server search and deletion for Storage. */
  knowledge?: KnowledgeTransport;
  /** Store a file and return its URL. `workspaceId` is undefined for account-level files (the profile picture). Without `upload` the file travels inside the saved JSON as a data URL. */
  upload?(workspaceId: string | undefined, kind: UploadKind, file: File, signal?: AbortSignal): Promise<{ url: string }>;
}

export type FailureCode = "network" | "timeout" | "unauthorized" | "forbidden" | "not-found" | "conflict" | "invalid" | "rate-limited" | "server" | "aborted";

export class BackendError extends Error {
  readonly code: FailureCode;
  readonly status?: number;
  readonly detail?: unknown;
  constructor(code: FailureCode, message: string, status?: number, detail?: unknown) {
    super(message);
    this.name = "BackendError";
    this.code = code; this.status = status; this.detail = detail;
  }
  /** Worth trying again without asking the person. */
  get retryable() { return this.code === "network" || this.code === "timeout" || this.code === "server" || this.code === "rate-limited"; }
}
