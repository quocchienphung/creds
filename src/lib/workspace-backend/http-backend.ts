import { BackendError } from "./types.ts";
import { parseKnowledgeIndex } from "../storage/knowledge-contract.ts";
import type { CommandName, FailureCode, Loaded, QueryName, ResourceRef, SaveContext, SaveResult, UploadKind, WorkspaceBackend } from "./types.ts";

export type HttpTarget =
  | { kind: "resource"; ref: ResourceRef }
  | { kind: "query"; name: QueryName; workspaceId: string; params: Record<string, string | number> }
  | { kind: "command"; name: CommandName; workspaceId: string }
  | { kind: "run"; workspaceId: string }
  | { kind: "knowledge"; workspaceId: string; id?: string; operation: "document" | "index" | "original" | "search"; query?: string }
  | { kind: "upload"; workspaceId: string | undefined; upload: UploadKind };

export interface HttpBackendConfig {
  /** Base URL of the API, for example "https://api.example.com/v1". */
  baseUrl: string;
  /** Headers added to every request, usually authentication. Called for each request, so tokens can refresh. */
  headers?: () => HeadersInit | Promise<HeadersInit>;
  /** Defaults to "same-origin". Use "include" for a cookie session on another origin. */
  credentials?: RequestCredentials;
  /** Injected for tests or non-browser runtimes. Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** A request that takes longer is abandoned and retried. Default 15 000 ms. */
  timeoutMs?: number;
  /** How often resources marked `live` are polled. Default 4 000 ms. */
  pollMs?: number;
  /** Wait after an edit before saving. Default 400 ms. */
  debounceMs?: number;
  /** Set when the server runs the agent itself: the Run screen then sends actions to it and shows its snapshots instead of simulating the run in the browser. Default false. */
  serverRun?: boolean;
  /** Return a URL to use instead of the default route for a target, when the server lays its routes out differently. */
  resolveUrl?: (target: HttpTarget) => string | undefined;
}

const trim = (url: string) => url.replace(/\/+$/, "");
function failure(status: number, body: unknown): BackendError {
  const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
  const text = typeof message === "string" && message ? message : `The server answered ${status}.`;
  const code: FailureCode = status === 401 ? "unauthorized" : status === 403 ? "forbidden" : status === 404 ? "not-found" : status === 409 || status === 412 ? "conflict" : status === 429 ? "rate-limited" : status >= 500 ? "server" : "invalid";
  return new BackendError(code, text, status, body);
}

/**
 * Talks to a REST API that follows docs/backend-api.md:
 * - GET    {base}/workspaces/{id}/{resource}            → 200 { data, version? } | 204/404 (nothing saved yet)
 * - PUT    {base}/workspaces/{id}/{resource}            body { data, changes?, commands?, baseVersion? }, If-Match: version
 * - GET    {base}/workspaces/{id}/queries/{name}        → { data }
 * - POST   {base}/workspaces/{id}/commands/{name}       → { data }
 * - POST   {base}/workspaces/{id}/agent-run/actions     → { data? }   (only with serverRun)
 * - POST   {base}/workspaces/{id}/uploads/{logo|document} multipart "file" → { data: { url } }
 * - POST   {base}/account/uploads/avatar                 multipart "file" → { data: { url } }
 * Account-level resources use {base}/account/{resource}.
 */
export function createHttpBackend(config: HttpBackendConfig): WorkspaceBackend {
  const base = trim(config.baseUrl);
  const doFetch = (input: RequestInfo | URL, init?: RequestInit) => (config.fetch ?? fetch)(input, init);
  const timeoutMs = config.timeoutMs ?? 15_000, pollMs = config.pollMs ?? 4_000;

  const urlFor = (target: HttpTarget): string => {
    const custom = config.resolveUrl?.(target);
    if (custom) return custom;
    if (target.kind === "resource") return target.ref.workspaceId ? `${base}/workspaces/${encodeURIComponent(target.ref.workspaceId)}/${target.ref.name}` : `${base}/account/${target.ref.name}`;
    if (target.kind === "upload" && !target.workspaceId) return `${base}/account/uploads/${target.upload}`;
    const workspace = `${base}/workspaces/${encodeURIComponent(target.workspaceId ?? "")}`;
    if (target.kind === "query") { const search = new URLSearchParams(Object.entries(target.params).map(([key, value]) => [key, String(value)])).toString(); return `${workspace}/queries/${target.name}${search ? `?${search}` : ""}`; }
    if (target.kind === "command") return `${workspace}/commands/${target.name}`;
    if (target.kind === "upload") return `${workspace}/uploads/${target.upload}`;
    if (target.kind === "knowledge") {
      const root = `${workspace}/storage`;
      if (target.operation === "search") return `${root}/search?q=${encodeURIComponent(target.query ?? "")}`;
      return `${root}/documents/${encodeURIComponent(target.id ?? "")}${target.operation === "document" ? "" : `/${target.operation}`}`;
    }
    return `${workspace}/agent-run/actions`;
  };

  async function request(url: string, init: RequestInit & { headers?: Record<string, string> }, signal?: AbortSignal): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const relay = () => controller.abort();
    if (signal) { if (signal.aborted) controller.abort(); else signal.addEventListener("abort", relay, { once: true }); }
    try {
      const extra = config.headers ? await config.headers() : {};
      const headers = new Headers(extra); headers.set("Accept", "application/json");
      // A host may default to JSON; the browser must set multipart's boundary for actual file uploads.
      if (init.body instanceof FormData) headers.delete("Content-Type");
      for (const [key, value] of Object.entries(init.headers ?? {})) headers.set(key, value);
      return await doFetch(url, { ...init, headers, signal: controller.signal, credentials: config.credentials ?? "same-origin" });
    } catch (error) {
      if (timedOut) throw new BackendError("timeout", "The server took too long to answer.");
      if (error instanceof BackendError) throw error;
      if ((error as { name?: string })?.name === "AbortError") throw new BackendError("aborted", "The request was cancelled.");
      throw new BackendError("network", "Could not reach the server.");
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", relay); }
  }
  async function readBody(response: Response): Promise<unknown> {
    if (response.status === 204) return null;
    const text = await response.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { throw new BackendError("invalid", "The server sent something that is not JSON.", response.status); }
  }
  const versionOf = (response: Response, body: unknown) => {
    const fromBody = (body as { version?: unknown } | null)?.version;
    return typeof fromBody === "string" ? fromBody : response.headers.get("ETag") ?? undefined;
  };
  const dataOf = (body: unknown, status: number) => {
    if (!body || typeof body !== "object" || !("data" in body)) throw new BackendError("invalid", "The server's answer has no data field.", status);
    return (body as { data: unknown }).data;
  };

  async function load<T>(ref: ResourceRef, signal?: AbortSignal, known?: string): Promise<Loaded<T> | null | "unchanged"> {
    const response = await request(urlFor({ kind: "resource", ref }), { method: "GET", headers: known ? { "If-None-Match": known } : {} }, signal);
    if (response.status === 304) return "unchanged";
    if (response.status === 404 || response.status === 204) return null;
    const body = await readBody(response);
    if (!response.ok) throw failure(response.status, body);
    return { value: dataOf(body, response.status) as T, version: versionOf(response, body) };
  }

  const backend: WorkspaceBackend = {
    kind: "http",
    remote: true,
    debounceMs: config.debounceMs ?? 400,
    async load<T>(ref: ResourceRef, signal?: AbortSignal) { const loaded = await load<T>(ref, signal); return loaded === "unchanged" ? null : loaded; },
    async save<T>(ref: ResourceRef, value: T, context: SaveContext<T>): Promise<SaveResult> {
      const body = JSON.stringify({ data: value, ...(context.changes ? { changes: context.changes } : {}), ...(context.commands ? { commands: context.commands } : {}), ...(context.baseVersion ? { baseVersion: context.baseVersion } : {}) });
      const headers: Record<string, string> = { "Content-Type": "application/json", ...(context.baseVersion ? { "If-Match": context.baseVersion } : {}) };
      const response = await request(urlFor({ kind: "resource", ref }), { method: "PUT", body, headers, keepalive: !!context.unloading && body.length < 60_000 }, context.signal);
      const answer = await readBody(response);
      if (!response.ok) throw failure(response.status, answer);
      return { version: versionOf(response, answer) };
    },
    subscribe<T>(ref: ResourceRef, listener: (loaded: Loaded<T>) => void, hint?: { poll?: boolean }) {
      if (!hint?.poll) return () => {};
      let stopped = false, known: string | undefined;
      const tick = async () => {
        if (stopped || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
        try { const loaded = await load<T>(ref, undefined, known); if (loaded && loaded !== "unchanged" && !stopped) { known = loaded.version; listener(loaded); } } catch { /* the next poll tries again */ }
      };
      const timer = setInterval(() => void tick(), pollMs);
      return () => { stopped = true; clearInterval(timer); };
    },
    async query<T>(name: QueryName, workspaceId: string, params: Record<string, string | number>, signal?: AbortSignal) {
      const response = await request(urlFor({ kind: "query", name, workspaceId, params }), { method: "GET" }, signal);
      if (response.status === 404 || response.status === 204) return undefined;
      const body = await readBody(response);
      if (!response.ok) throw failure(response.status, body);
      return dataOf(body, response.status) as T;
    },
    async command<I, O>(name: CommandName, workspaceId: string, input: I, signal?: AbortSignal) {
      const response = await request(urlFor({ kind: "command", name, workspaceId }), { method: "POST", body: JSON.stringify(input), headers: { "Content-Type": "application/json" } }, signal);
      const body = await readBody(response);
      if (!response.ok) throw failure(response.status, body);
      return dataOf(body, response.status) as O;
    },
    run: config.serverRun ? {
      async send(workspaceId: string, action: unknown, signal?: AbortSignal) {
        const response = await request(urlFor({ kind: "run", workspaceId }), { method: "POST", body: JSON.stringify(action), headers: { "Content-Type": "application/json" } }, signal);
        const body = await readBody(response);
        if (!response.ok) throw failure(response.status, body);
        return body && typeof body === "object" && "data" in body ? (body as { data: unknown }).data : undefined;
      },
    } : undefined,
    knowledge: {
      async save(workspaceId, id, file, index, sha256, signal) {
        if (!parseKnowledgeIndex(index)) throw new BackendError("invalid", "The document index is invalid.");
        const form = new FormData(); form.set("file", file); form.set("text", index.text); form.set("sha256", sha256);
        const response = await request(urlFor({ kind: "knowledge", workspaceId, id, operation: "document" }), { method: "PUT", body: form }, signal);
        const body = await readBody(response);
        if (!response.ok) throw failure(response.status, body);
        const result = dataOf(body, response.status) as { id?: unknown; sha256?: unknown; bytes?: unknown } | null;
        if (!result || result.id !== id || result.sha256 !== sha256 || result.bytes !== file.size) throw new BackendError("invalid", "The document upload receipt does not match the original.");
        return { id, sha256, bytes: file.size };
      },
      async load(workspaceId, id, signal) {
        const response = await request(urlFor({ kind: "knowledge", workspaceId, id, operation: "index" }), { method: "GET" }, signal);
        const body = await readBody(response);
        if (!response.ok) throw failure(response.status, body);
        const index = parseKnowledgeIndex(dataOf(body, response.status));
        if (!index) throw new BackendError("invalid", "The server returned an invalid document index.");
        return index;
      },
      async download(workspaceId, id, signal) {
        const response = await request(urlFor({ kind: "knowledge", workspaceId, id, operation: "original" }), { method: "GET", headers: { Accept: "application/octet-stream" } }, signal);
        if (!response.ok) throw failure(response.status, await readBody(response));
        return response.blob();
      },
      async remove(workspaceId, id, signal) {
        const response = await request(urlFor({ kind: "knowledge", workspaceId, id, operation: "document" }), { method: "DELETE" }, signal);
        if (!response.ok) throw failure(response.status, await readBody(response));
      },
      async search(workspaceId, query, signal) {
        const response = await request(urlFor({ kind: "knowledge", workspaceId, operation: "search", query }), { method: "GET" }, signal);
        const body = await readBody(response);
        if (!response.ok) throw failure(response.status, body);
        const result = dataOf(body, response.status) as { ids?: unknown } | null;
        if (!result || !Array.isArray(result.ids) || !result.ids.every(id => typeof id === "string")) throw new BackendError("invalid", "The server returned invalid document search results.");
        return result.ids as string[];
      },
    },
    async upload(workspaceId: string | undefined, kind: UploadKind, file: File, signal?: AbortSignal) {
      const form = new FormData(); form.set("file", file);
      const response = await request(urlFor({ kind: "upload", workspaceId, upload: kind }), { method: "POST", body: form }, signal);
      const body = await readBody(response);
      if (!response.ok) throw failure(response.status, body);
      const result = (body && typeof body === "object" && "data" in body ? (body as { data: unknown }).data : body) as { url?: unknown } | null;
      if (!result || typeof result.url !== "string") throw new BackendError("invalid", "The upload answer has no url.", response.status);
      return { url: result.url };
    },
  };
  return backend;
}
