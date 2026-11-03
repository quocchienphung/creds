import { BackendError } from "../../../lib/workspace-backend/types.ts";
import { applyAction, isRunLog, isRunSnapshot, replay, startLog } from "./run-model.ts";
import type { RunAction, RunLog, RunSnapshot } from "./run-model.ts";
import { findNode, providerIds } from "./process-model.ts";
import type { ProcessDoc, Provider } from "./process-model.ts";

/**
 * The seam between the Process page and whatever actually runs the tasks: a local model server, a chat bot, an agent
 * framework. The page only hands over a plan and the person's decisions and shows the snapshots that come back; it
 * never calls a model itself. Two engines ship with it: a simulated one (the default; deterministic, nothing leaves the
 * browser) and a REST one that follows `docs/backend-api.md` ("Process (engine)"). Any other transport can implement
 * `ProcessEngine` and be passed to the page.
 */
export interface EngineInfo {
  /** Stable id, for example "ollama:llama3.2". Stored in a task's AI block as `model`. */
  id: string;
  provider: Provider;
  /** What the person sees. */
  label: string;
  /** Runs on the person's own machine. */
  local: boolean;
  note?: string;
}

/** What the page keeps for one run. A simulated run is its plan and decisions; a remote one is the last snapshot the server reported. */
export type RunHandle =
  | { kind: "simulated"; log: RunLog }
  | { kind: "remote"; runId: string; snapshot: RunSnapshot; receivedAt: number; version?: string };

export interface ProcessEngine {
  readonly kind: "simulated" | "remote";
  /** The AI blocks this engine can run, for example the models installed in a local Ollama. Optional: without it any model name can be typed. */
  catalog?(workspaceId: string, signal?: AbortSignal): Promise<EngineInfo[]>;
  /** Starts a run of the whole process, or of one task and what is under it (`from`). */
  start(workspaceId: string, doc: ProcessDoc, from: string | undefined, now: number, signal?: AbortSignal): Promise<RunHandle>;
  /** A decision: approve or reject a waiting task, retry or dismiss a failed one, or stop the run. */
  act(workspaceId: string, handle: RunHandle, action: RunAction, now: number, signal?: AbortSignal): Promise<RunHandle>;
  /** Asks for the newest state. Only engines that run elsewhere need it; the page polls while the run is active. */
  refresh?(workspaceId: string, handle: RunHandle, signal?: AbortSignal): Promise<RunHandle>;
  /** The run the engine already has for this process (after a reload). */
  latest?(workspaceId: string, processId: string, signal?: AbortSignal): Promise<RunHandle | null>;
  /** The run as it is at `now` (the local clock; remote handles correct it by the server's clock). */
  read(handle: RunHandle, now: number): RunSnapshot;
}

/** The clock a handle's timers should use: the local one, or the server's, moved on by the time since it reported. */
export function handleNow(handle: RunHandle, now: number) {
  // A terminal run has unsubscribed from the shared clock. A new retry must be read at least at its decision time,
  // otherwise that stale tick still sees the failure, and the page never subscribes again to advance the retry.
  return handle.kind === "remote" ? handle.snapshot.at + Math.max(0, now - handle.receivedAt) : Math.max(now, handle.log.events.at(-1)?.t ?? now);
}

/* ---------- the simulated engine ---------- */
export function createSimulatedEngine(): ProcessEngine {
  return {
    kind: "simulated",
    async start(_workspace, doc, from, now) {
      const root = from ? findNode(doc.root, from) : doc.root;
      if (!root) throw new BackendError("not-found", "That task is not in this process any more.");
      return { kind: "simulated", log: startLog(root, doc.id, doc.unit, now, undefined, doc.links) };
    },
    async act(_workspace, handle, action, now) {
      if (handle.kind !== "simulated") throw new BackendError("invalid", "This run belongs to another engine.");
      const log = applyAction(handle.log, action, now);
      if (!log) throw new BackendError("conflict", "That is not possible at this moment: the run has moved on.");
      return { kind: "simulated", log };
    },
    read(handle, now) {
      if (handle.kind !== "simulated") throw new BackendError("invalid", "This run belongs to another engine.");
      return replay(handle.log, now);
    },
  };
}

/** A saved simulated run, or null when it is not one. */
export const simulatedHandle = (raw: unknown): RunHandle | null => isRunLog(raw) ? { kind: "simulated", log: raw } : null;

/* ---------- the REST engine ---------- */
export interface RemoteEngineConfig {
  /** Base URL of the API, the same one as the workspace backend ("https://api.example.com/v1"). */
  baseUrl: string;
  headers?: () => HeadersInit | Promise<HeadersInit>;
  credentials?: RequestCredentials;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const trim = (url: string) => url.replace(/\/+$/, "");
function failure(status: number, body: unknown) {
  const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
  const text = typeof message === "string" && message ? message : `The engine answered ${status}.`;
  const code = status === 401 ? "unauthorized" : status === 403 ? "forbidden" : status === 404 ? "not-found" : status === 409 || status === 412 ? "conflict" : status === 429 ? "rate-limited" : status >= 500 ? "server" : "invalid";
  return new BackendError(code, text, status, body);
}

/**
 * Routes (all under `{base}/workspaces/{workspaceId}/process`):
 * - GET  /engines                       → { data: EngineInfo[] }
 * - POST /runs                          body { processId, process, from? } → { data: RunSnapshot }
 * - GET  /runs?processId=…&latest=1     → { data: RunSnapshot | null }
 * - GET  /runs/{runId}                  → { data: RunSnapshot }, 304 with If-None-Match when unchanged
 * - POST /runs/{runId}/actions          body RunAction → { data?: RunSnapshot }
 */
export function createRemoteEngine(config: RemoteEngineConfig): ProcessEngine {
  const base = trim(config.baseUrl), timeoutMs = config.timeoutMs ?? 15_000;
  const doFetch = (input: RequestInfo | URL, init?: RequestInit) => (config.fetch ?? fetch)(input, init);
  const root = (workspaceId: string) => `${base}/workspaces/${encodeURIComponent(workspaceId)}/process`;

  async function request(url: string, init: RequestInit & { headers?: Record<string, string> }, signal?: AbortSignal) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const relay = () => controller.abort();
    if (signal) { if (signal.aborted) controller.abort(); else signal.addEventListener("abort", relay, { once: true }); }
    try {
      const extra = config.headers ? await config.headers() : {};
      const headers = new Headers(extra);
      headers.set("Accept", "application/json");
      for (const [key, value] of Object.entries(init.headers ?? {})) headers.set(key, value);
      return await doFetch(url, { ...init, headers, signal: controller.signal, credentials: config.credentials ?? "same-origin" });
    } catch (error) {
      if (timedOut) throw new BackendError("timeout", "The engine took too long to answer.");
      if ((error as { name?: string })?.name === "AbortError") throw new BackendError("aborted", "The request was cancelled.");
      throw new BackendError("network", "Could not reach the engine.");
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", relay); }
  }
  async function json(response: Response): Promise<unknown> {
    if (response.status === 204) return null;
    const body = await response.text();
    if (!body) return null;
    try { return JSON.parse(body); } catch { throw new BackendError("invalid", "The engine sent something that is not JSON.", response.status); }
  }
  const dataOf = (body: unknown) => (body && typeof body === "object" && "data" in body ? (body as { data: unknown }).data : undefined);
  const snapshotOf = (body: unknown): RunSnapshot => {
    const data = dataOf(body);
    if (!isRunSnapshot(data)) throw new BackendError("invalid", "The engine's answer is not a valid run. The previous state is kept.");
    return data;
  };
  const handleOf = (snapshot: RunSnapshot, response: Response, body: unknown): RunHandle => {
    const fromBody = (body as { version?: unknown } | null)?.version;
    return { kind: "remote", runId: snapshot.id, snapshot, receivedAt: Date.now(), version: typeof fromBody === "string" ? fromBody : response.headers.get("ETag") ?? undefined };
  };
  const post = (url: string, payload: unknown, signal?: AbortSignal) => request(url, { method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "application/json" } }, signal);

  return {
    kind: "remote",
    async catalog(workspaceId, signal) {
      const response = await request(`${root(workspaceId)}/engines`, { method: "GET" }, signal);
      if (response.status === 404 || response.status === 204) return [];
      const body = await json(response);
      if (!response.ok) throw failure(response.status, body);
      const list = dataOf(body);
      if (!Array.isArray(list)) throw new BackendError("invalid", "The engine list is not a list.");
      return list.filter((item): item is EngineInfo => !!item && typeof item === "object" && typeof (item as EngineInfo).id === "string" && typeof (item as EngineInfo).label === "string").slice(0, 200)
        .map(item => ({ id: item.id.slice(0, 120), label: item.label.slice(0, 120), provider: providerIds.includes(item.provider) ? item.provider : "custom", local: item.local === true, ...(typeof item.note === "string" ? { note: item.note.slice(0, 200) } : {}) }));
    },
    async start(workspaceId, doc, from, _now, signal) {
      const response = await post(`${root(workspaceId)}/runs`, { processId: doc.id, process: doc, ...(from ? { from } : {}) }, signal);
      const body = await json(response);
      if (!response.ok) throw failure(response.status, body);
      return handleOf(snapshotOf(body), response, body);
    },
    async act(workspaceId, handle, action, _now, signal) {
      if (handle.kind !== "remote") throw new BackendError("invalid", "This run belongs to another engine.");
      const response = await post(`${root(workspaceId)}/runs/${encodeURIComponent(handle.runId)}/actions`, action, signal);
      const body = await json(response);
      if (!response.ok) throw failure(response.status, body);
      // The answer may carry the new snapshot; otherwise the next poll will.
      return dataOf(body) ? handleOf(snapshotOf(body), response, body) : handle;
    },
    async refresh(workspaceId, handle, signal) {
      if (handle.kind !== "remote") return handle;
      const response = await request(`${root(workspaceId)}/runs/${encodeURIComponent(handle.runId)}`, { method: "GET", headers: handle.version ? { "If-None-Match": handle.version } : {} }, signal);
      if (response.status === 304) return handle;
      const body = await json(response);
      if (!response.ok) throw failure(response.status, body);
      return handleOf(snapshotOf(body), response, body);
    },
    async latest(workspaceId, processId, signal) {
      const response = await request(`${root(workspaceId)}/runs?${new URLSearchParams({ processId, latest: "1" })}`, { method: "GET" }, signal);
      if (response.status === 404 || response.status === 204) return null;
      const body = await json(response);
      if (!response.ok) throw failure(response.status, body);
      return dataOf(body) ? handleOf(snapshotOf(body), response, body) : null;
    },
    read(handle) {
      if (handle.kind !== "remote") throw new BackendError("invalid", "This run belongs to another engine.");
      return handle.snapshot;
    },
  };
}

/** The engine the page uses: the REST one when the host sets `serverProcess` next to the workspace backend's `baseUrl`, otherwise the simulated one. */
export function configuredEngine(): ProcessEngine {
  const runtime = globalThis.__workspaceBackendConfig as (Partial<RemoteEngineConfig> & { serverProcess?: boolean }) | undefined;
  const baseUrl = runtime?.baseUrl || process.env.NEXT_PUBLIC_WORKSPACE_API_URL;
  const server = runtime?.serverProcess ?? process.env.NEXT_PUBLIC_WORKSPACE_SERVER_PROCESS === "1";
  return baseUrl && server ? createRemoteEngine({ baseUrl, headers: runtime?.headers, credentials: runtime?.credentials, fetch: runtime?.fetch, timeoutMs: runtime?.timeoutMs }) : createSimulatedEngine();
}
