import { BackendError } from "../../../lib/workspace-backend/types.ts";
import type { FailureCode } from "../../../lib/workspace-backend/types.ts";
import type { HttpBackendConfig } from "../../../lib/workspace-backend/http-backend.ts";
import type { AssistantAttachment, AssistantChatApi, AssistantIntegration, AssistantMessage, AssistantSendInput, AssistantSendResult, AssistantThread, AssistantThreadSummary } from "./assistant-types.ts";

export type AssistantHttpTarget =
  | { kind: "list"; workspaceId: string }
  | { kind: "send"; workspaceId: string }
  | { kind: "upload"; workspaceId: string }
  | { kind: "integrations"; workspaceId: string }
  | { kind: "connect"; workspaceId: string; integrationId: string }
  | { kind: "get" | "remove"; workspaceId: string; threadId: string }
  | { kind: "cancel"; workspaceId: string; threadId: string; requestId: string };

/** Shares workspace authentication/transport settings without changing Claude's resource API. */
export interface AssistantHttpConfig extends HttpBackendConfig {
  resolveAssistantUrl?: (target: AssistantHttpTarget) => string | undefined;
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const identifier = (value: unknown): value is string => text(value) && value.trim().length > 0 && !/[\r\n\0]/.test(value);
const date = (value: unknown): value is string => text(value) && Number.isFinite(Date.parse(value));
const optionalId = (value: unknown) => value === undefined || identifier(value);
const invalid = (message = "The assistant server returned invalid data.") => new BackendError("invalid", message);

function safeUrl(value: unknown): value is string {
  if (!text(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return true;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol); } catch { return false; }
}

function attachment(raw: unknown): AssistantAttachment {
  if (!record(raw) || !identifier(raw.id) || !text(raw.name) || !text(raw.type) || typeof raw.size !== "number" || !Number.isSafeInteger(raw.size) || raw.size < 0 || (raw.url !== undefined && !safeUrl(raw.url))) throw invalid();
  return { id: raw.id, name: raw.name, type: raw.type, size: raw.size, ...(raw.url !== undefined ? { url: raw.url as string } : {}) };
}

function message(raw: unknown): AssistantMessage {
  if (!record(raw) || !identifier(raw.id) || (raw.role !== "user" && raw.role !== "assistant") || !text(raw.content) || !date(raw.createdAt) || (raw.attachments !== undefined && !Array.isArray(raw.attachments))) throw invalid();
  return { id: raw.id, role: raw.role, content: raw.content, createdAt: raw.createdAt, ...(Array.isArray(raw.attachments) ? { attachments: raw.attachments.map(attachment) } : {}) };
}

function summary(raw: unknown): AssistantThreadSummary {
  if (!record(raw) || !identifier(raw.id) || !text(raw.title) || !date(raw.updatedAt) || !optionalId(raw.folderId)) throw invalid();
  return { id: raw.id, title: raw.title, updatedAt: raw.updatedAt, ...(raw.folderId !== undefined ? { folderId: raw.folderId as string } : {}) };
}

function thread(raw: unknown): AssistantThread {
  const base = summary(raw);
  if (!record(raw) || !Array.isArray(raw.messages)) throw invalid();
  return { ...base, messages: raw.messages.map(message) };
}

function sendResult(raw: unknown): AssistantSendResult {
  if (!record(raw) || !optionalId(raw.requestId)) throw invalid();
  return { thread: thread(raw.thread), ...(raw.requestId !== undefined ? { requestId: raw.requestId as string } : {}) };
}

function integration(raw: unknown): AssistantIntegration {
  if (!record(raw) || !identifier(raw.id) || !text(raw.name) || typeof raw.connected !== "boolean") throw invalid();
  return { id: raw.id, name: raw.name, connected: raw.connected };
}

function validateSend(input: AssistantSendInput): AssistantSendInput {
  if (!record(input) || !identifier(input.clientMessageId) || !optionalId(input.threadId) || !optionalId(input.folderId) || !text(input.text) || !identifier(input.model) || (input.thinking !== undefined && typeof input.thinking !== "boolean") || (input.effort !== undefined && !["low", "medium", "high"].includes(input.effort)) || !Array.isArray(input.plugins) || !input.plugins.every(identifier) || !Array.isArray(input.attachments) || (!input.text.trim() && input.attachments.length === 0)) throw invalid("Enter a message or attach a file before sending.");
  return { clientMessageId: input.clientMessageId, text: input.text, model: input.model, plugins: [...input.plugins], ...(input.thinking ? { thinking: true, effort: input.effort ?? "medium" } : {}), attachments: input.attachments.map(attachment), ...(input.threadId ? { threadId: input.threadId } : {}), ...(input.folderId ? { folderId: input.folderId } : {}) };
}

function responseFailure(status: number, body: unknown): BackendError {
  const code: FailureCode = status === 401 ? "unauthorized" : status === 403 ? "forbidden" : status === 404 ? "not-found" : status === 409 || status === 412 ? "conflict" : status === 429 ? "rate-limited" : status >= 500 ? "server" : "invalid";
  const detail = record(body) && record(body.error) && text(body.error.message) ? body.error.message : `The assistant server answered ${status}.`;
  return new BackendError(code, detail, status, body);
}

/** A JSON transport: retries are explicit and reuse the caller's clientMessageId. */
export function createHttpAssistantApi(config: AssistantHttpConfig): AssistantChatApi {
  const base = config.baseUrl.replace(/\/+$/, "");
  if (!base.trim()) throw invalid("An assistant API base URL is required.");
  const segment = (value: string) => { if (!identifier(value)) throw invalid("A workspace, conversation or request ID is missing."); return encodeURIComponent(value); };
  function urlFor(target: AssistantHttpTarget) {
    const custom = config.resolveAssistantUrl?.(target);
    if (custom) return custom;
    const root = `${base}/workspaces/${segment(target.workspaceId)}/assistant`;
    if (target.kind === "integrations") return `${root}/integrations`;
    if (target.kind === "connect") return `${root}/integrations/${segment(target.integrationId)}/connect`;
    if (target.kind === "upload") return `${root}/attachments`;
    if (target.kind === "list") return `${root}/threads`;
    if (target.kind === "send") return `${root}/messages`;
    const path = `${root}/threads/${segment(target.threadId)}`;
    return target.kind === "cancel" ? `${path}/requests/${segment(target.requestId)}/cancel` : path;
  }

  async function request(target: AssistantHttpTarget, init: RequestInit, signal?: AbortSignal, allowEmpty = false): Promise<unknown> {
    const controller = new AbortController();
    let timedOut = false;
    let rejectAbort: ((reason: BackendError) => void) | undefined;
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
    const stop = () => {
      controller.abort();
      rejectAbort?.(new BackendError(timedOut ? "timeout" : "aborted", timedOut ? "The assistant server took too long to answer." : "The assistant request was cancelled."));
    };
    const timer = setTimeout(() => { timedOut = true; stop(); }, config.timeoutMs ?? 60_000);
    signal?.addEventListener("abort", stop, { once: true });
    if (signal?.aborted) stop();
    const operation = async () => {
      if (controller.signal.aborted) throw new BackendError("aborted", "The assistant request was cancelled.");
      const headers = new Headers(await config.headers?.());
      if (controller.signal.aborted) throw new BackendError("aborted", "The assistant request was cancelled.");
      headers.set("Accept", "application/json");
      // Let the browser choose the multipart boundary, even if a host has default JSON headers.
      if (init.body instanceof FormData) headers.delete("Content-Type");
      new Headers(init.headers).forEach((value, name) => headers.set(name, value));
      const response = await (config.fetch ?? fetch)(urlFor(target), { ...init, headers, credentials: config.credentials ?? "same-origin", cache: "no-store", signal: controller.signal });
      const raw = await response.text();
      let body: unknown = null;
      if (raw) { try { body = JSON.parse(raw); } catch { if (response.ok) throw invalid("The assistant server sent something that is not JSON."); } }
      if (!response.ok) throw responseFailure(response.status, body);
      if (allowEmpty && (response.status === 204 || response.status === 205)) return undefined;
      if (!record(body) || !("data" in body)) throw invalid("The assistant server's answer has no data field.");
      return body.data;
    };
    try { return await Promise.race([operation(), aborted]); }
    catch (error) {
      if (error instanceof BackendError) throw error;
      if (controller.signal.aborted || (record(error) && error.name === "AbortError")) throw new BackendError(timedOut ? "timeout" : "aborted", timedOut ? "The assistant server took too long to answer." : "The assistant request was cancelled.");
      throw new BackendError("network", "Could not reach the assistant server.");
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", stop); }
  }

  return {
    remote: true,
    async list(workspaceId, signal) { const data = await request({ kind: "list", workspaceId }, { method: "GET" }, signal); if (!Array.isArray(data)) throw invalid(); return data.map(summary); },
    async get(workspaceId, threadId, signal) { return thread(await request({ kind: "get", workspaceId, threadId }, { method: "GET" }, signal)); },
    async send(workspaceId, input, signal) {
      const data = validateSend(input);
      return sendResult(await request({ kind: "send", workspaceId }, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": data.clientMessageId }, body: JSON.stringify(data) }, signal));
    },
    async cancel(workspaceId, threadId, requestId, signal) { await request({ kind: "cancel", workspaceId, threadId, requestId }, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, signal, true); },
    async upload(workspaceId, file, signal) { const body = new FormData(); body.set("file", file); return attachment(await request({ kind: "upload", workspaceId }, { method: "POST", body }, signal)); },
    async remove(workspaceId, threadId, signal) { await request({ kind: "remove", workspaceId, threadId }, { method: "DELETE" }, signal, true); },
    async integrations(workspaceId, signal) { const data = await request({ kind: "integrations", workspaceId }, { method: "GET" }, signal); if (!Array.isArray(data)) throw invalid(); return data.map(integration); },
    async connect(workspaceId, integrationId, signal) {
      const data = await request({ kind: "connect", workspaceId, integrationId }, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, signal);
      if (!record(data) || !text(data.authorizationUrl)) throw invalid();
      try { const url = new URL(data.authorizationUrl); if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw invalid(); } catch { throw invalid("The integration did not return a valid authorization URL."); }
      return { authorizationUrl: data.authorizationUrl };
    },
  };
}

/** No configured API means no pretend assistant replies or implicit external requests. */
export function createConfiguredAssistantApi(): AssistantChatApi | null {
  const runtime = (globalThis as typeof globalThis & { __workspaceBackendConfig?: Partial<AssistantHttpConfig> }).__workspaceBackendConfig;
  const baseUrl = runtime?.baseUrl || process.env.NEXT_PUBLIC_WORKSPACE_API_URL;
  return baseUrl ? createHttpAssistantApi({ ...runtime, baseUrl }) : null;
}
