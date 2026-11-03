"use client";

import { useEffect, useRef, useState } from "react";
import { resolveEffort, resolveModelId } from "./assistant-models";
import type { AssistantEffort } from "./assistant-models";
import type { AssistantChatApi, AssistantSendInput, AssistantThread, AssistantThreadSummary } from "./assistant-types";

interface Session { draft: string; model: string; plugins: string[]; thinking: boolean; effort: AssistantEffort; folderId?: string; activeThreadId?: string }
const defaults: Session = { draft: "", model: "auto", plugins: [], thinking: false, effort: "medium" };
function readSession(key: string): Session {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) || "null");
    if (!saved || typeof saved !== "object") return defaults;
    const raw = saved as Record<string, unknown>;
    return { draft: typeof raw.draft === "string" ? raw.draft : "", model: resolveModelId(raw.model), thinking: raw.thinking === true, effort: resolveEffort(raw.effort), plugins: Array.isArray(raw.plugins) ? raw.plugins.filter((item): item is string => typeof item === "string") : [], folderId: typeof raw.folderId === "string" ? raw.folderId : undefined, activeThreadId: typeof raw.activeThreadId === "string" ? raw.activeThreadId : undefined };
  } catch { return defaults; }
}
export function assistantError(error: unknown) { return error instanceof Error ? error.message : "The request could not be completed. Please try again."; }

/** Conversation text comes only from the backend; browser storage holds composer preferences and drafts. */
export function useAssistantChat(workspaceId: string, api: AssistantChatApi | null, startFresh = false) {
  const key = `affectui:${workspaceId}:assistant-session`;
  const [session, setSession] = useState<Session>(defaults);
  const [ready, setReady] = useState(false);
  const [thread, setThread] = useState<AssistantThread | null>(null);
  const [threads, setThreads] = useState<AssistantThreadSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [failed, setFailed] = useState<AssistantSendInput | null>(null);
  const request = useRef<{ controller: AbortController; input: AssistantSendInput } | null>(null);
  const loadRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const contextEpoch = useRef(0);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      const saved = readSession(key);
      const stored = startFresh ? { ...saved, activeThreadId: undefined, draft: "" } : saved;
      setSession(stored); setReady(true);
      if (!api) return;
      void api.list(workspaceId, controller.signal).then(value => { if (!controller.signal.aborted) setThreads(value); }).catch(reason => { if (!controller.signal.aborted) setHistoryError(assistantError(reason)); });
      if (stored.activeThreadId) {
        loadRequest.current = controller;
        setLoading(true);
        void api.get(workspaceId, stored.activeThreadId, controller.signal).then(value => { if (!controller.signal.aborted) setThread(value); }).catch(reason => { if (!controller.signal.aborted) setError(assistantError(reason)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
      }
    });
    return () => { mounted.current = false; controller.abort(); request.current?.controller.abort(); loadRequest.current?.abort(); };
  }, [api, key, startFresh, workspaceId]);
  useEffect(() => { if (ready) { try { localStorage.setItem(key, JSON.stringify(session)); } catch { /* Draft remains editable when browser storage is unavailable. */ } } }, [key, ready, session]);

  function updateSession(patch: Partial<Session>) { setSession(current => ({ ...current, ...patch })); }
  async function refreshHistory() {
    if (!api) { setHistoryError("Connect your workspace backend to load conversations."); return; }
    setHistoryError("");
    try { const items = await api.list(workspaceId); if (mounted.current) setThreads(items); }
    catch (reason) { if (mounted.current) setHistoryError(assistantError(reason)); }
  }
  async function openThread(id: string) {
    if (!api || busy) return;
    contextEpoch.current++;
    loadRequest.current?.abort();
    const controller = new AbortController(); loadRequest.current = controller;
    setLoading(true); setError(""); setFailed(null);
    try {
      const value = await api.get(workspaceId, id, controller.signal);
      if (!controller.signal.aborted && mounted.current) { setThread(value); updateSession({ activeThreadId: value.id }); }
    } catch (reason) { if (!controller.signal.aborted && mounted.current) setError(assistantError(reason)); }
    finally { if (!controller.signal.aborted && mounted.current) setLoading(false); }
  }
  async function execute(input: AssistantSendInput) {
    if (!api) { setError("Your message is saved as a draft. Connect the workspace backend to send it."); return; }
    if (request.current) return;
    contextEpoch.current++;
    loadRequest.current?.abort(); setLoading(false);
    const controller = new AbortController(); request.current = { controller, input };
    const id = input.threadId || crypto.randomUUID();
    input = { ...input, threadId: id }; request.current.input = input;
    setBusy(true); setError(""); setFailed(null);
    const now = new Date().toISOString();
    setThread(current => ({ id, title: current?.id === id ? current.title : input.text.slice(0, 80) || "Attached files", updatedAt: now, messages: [...(current?.id === id ? current.messages.filter(message => message.id !== input.clientMessageId) : []), { id: input.clientMessageId, role: "user", content: input.text, createdAt: now, attachments: input.attachments }] }));
    updateSession({ draft: "", activeThreadId: id });
    try {
      const result = await api.send(workspaceId, input, controller.signal);
      if (controller.signal.aborted || !mounted.current || request.current?.controller !== controller) return;
      setThread(result.thread); updateSession({ activeThreadId: result.thread.id });
      setThreads(current => [result.thread, ...current.filter(item => item.id !== result.thread.id)]);
      return true;
    } catch (reason) {
      if (!controller.signal.aborted && mounted.current && request.current?.controller === controller) { setError(assistantError(reason)); setFailed(input); updateSession({ draft: input.text }); }
    } finally {
      if (request.current?.controller === controller) { request.current = null; if (mounted.current) setBusy(false); }
    }
  }
  function send(text: string, attachments: AssistantSendInput["attachments"] = []) {
    if (!text.trim() && !attachments.length) return;
    if (failed && failed.text === text.trim() && failed.model === session.model && !!failed.thinking === session.thinking && (!session.thinking || failed.effort === session.effort) && JSON.stringify(failed.plugins) === JSON.stringify(session.plugins) && failed.folderId === session.folderId && JSON.stringify(failed.attachments) === JSON.stringify(attachments)) return execute(failed);
    return execute({ threadId: thread?.id, clientMessageId: crypto.randomUUID(), text: text.trim(), model: session.model, plugins: session.plugins, ...(session.thinking ? { thinking: true, effort: session.effort } : {}), folderId: session.folderId, attachments });
  }
  function stop() {
    const current = request.current;
    if (!current) return;
    current.controller.abort(); request.current = null; setBusy(false);
    setFailed(current.input); setError("Response stopped. You can retry this message."); updateSession({ draft: current.input.text });
    const epoch = contextEpoch.current;
    if (api && current.input.threadId) void api.cancel(workspaceId, current.input.threadId, current.input.clientMessageId).catch(reason => { if (mounted.current && contextEpoch.current === epoch && !request.current) setError(`Stopped waiting. ${assistantError(reason)}`); });
  }
  function newChat() {
    stop(); contextEpoch.current++; loadRequest.current?.abort(); setLoading(false); setThread(null); setFailed(null); setError(""); updateSession({ activeThreadId: undefined, draft: "" });
  }
  async function removeThread(id: string) {
    if (!api) return;
    try { await api.remove(workspaceId, id); if (!mounted.current) return; setThreads(current => current.filter(item => item.id !== id)); if (thread?.id === id) newChat(); }
    catch (reason) { if (mounted.current) setHistoryError(assistantError(reason)); }
  }
  return { session, updateSession, ready, thread, threads, busy, loading, error, historyError, failed, send, retry: () => failed ? execute(failed) : undefined, stop, newChat, openThread, removeThread, refreshHistory };
}
