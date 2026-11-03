import test from "node:test";
import assert from "node:assert/strict";
import { createConfiguredAssistantApi, createHttpAssistantApi } from "./assistant-api.ts";

const now = "2026-10-20T10:00:00.000Z";
const summary = { id: "thread/1", title: "A conversation", updatedAt: now };
const message = { id: "reply-1", role: "assistant", content: "A real server response", createdAt: now };
const thread = { ...summary, messages: [message] };
const input = { threadId: "thread/1", clientMessageId: "message-1", text: "Hello", model: "auto", plugins: [], attachments: [] };
const json = (data, status = 200) => new Response(JSON.stringify({ data }), { status, headers: { "Content-Type": "application/json" } });
const fail = code => error => error.code === code;

test("authenticated list/get/history encode workspace and thread IDs, refreshing headers each time", async () => {
  const calls = [];
  let auth = 0;
  const api = createHttpAssistantApi({ baseUrl: "https://api.test/v1/", credentials: "include", headers: async () => ({ Authorization: `Bearer session-${++auth}` }), fetch: async (url, init) => { calls.push({ url, init }); return json(url.endsWith("/threads") ? [summary] : thread); } });
  assert.equal(api.remote, true);
  assert.deepEqual(await api.list("work space/1"), [summary]);
  assert.deepEqual(await api.get("work space/1", "thread/1"), thread);
  assert.equal(calls[0].url, "https://api.test/v1/workspaces/work%20space%2F1/assistant/threads");
  assert.equal(calls[1].url, "https://api.test/v1/workspaces/work%20space%2F1/assistant/threads/thread%2F1");
  assert.equal(new Headers(calls[0].init.headers).get("Authorization"), "Bearer session-1");
  assert.equal(new Headers(calls[1].init.headers).get("Authorization"), "Bearer session-2");
  assert.equal(calls[0].init.credentials, "include");
  assert.equal(calls[0].init.cache, "no-store");
});

test("send retries preserve clientMessageId, model, plugins and idempotency without inventing replies", async () => {
  const calls = [];
  const api = createHttpAssistantApi({ baseUrl: "/api", fetch: async (url, init) => { calls.push({ url, init }); if (calls.length === 1) return new Response(null, { status: 503 }); return json({ thread, requestId: "request-1" }); } });
  await assert.rejects(api.send("w", input), fail("server"));
  assert.deepEqual(await api.send("w", input), { thread, requestId: "request-1" });
  for (const call of calls) {
    assert.equal(call.url, "/api/workspaces/w/assistant/messages");
    assert.equal(call.init.method, "POST");
    assert.equal(new Headers(call.init.headers).get("Idempotency-Key"), "message-1");
    assert.deepEqual(JSON.parse(call.init.body), input);
  }
  const before = calls.length;
  await assert.rejects(api.send("w", { ...input, text: "  " }), fail("invalid"));
  await assert.rejects(api.send("w", { ...input, clientMessageId: "bad\r\nheader" }), fail("invalid"));
  assert.equal(calls.length, before, "invalid messages are never sent");
});

test("cancel and delete use real API endpoints and support successful empty responses", async () => {
  const calls = [];
  const api = createHttpAssistantApi({ baseUrl: "https://api.test", fetch: async (url, init) => { calls.push([url, init.method, init.body]); return new Response(null, { status: 204 }); } });
  await api.cancel("w", "t/1", "client request/1");
  await api.remove("w", "t/1");
  assert.deepEqual(calls, [
    ["https://api.test/workspaces/w/assistant/threads/t%2F1/requests/client%20request%2F1/cancel", "POST", "{}"],
    ["https://api.test/workspaces/w/assistant/threads/t%2F1", "DELETE", undefined],
  ]);
});

test("multipart attachment uploads use the actual file and browser-generated content type", async () => {
  const file = new File(["file contents"], "report.txt", { type: "text/plain" });
  const value = { id: "file-1", name: "report.txt", type: "text/plain", size: file.size, url: "/files/file-1" };
  const api = createHttpAssistantApi({ baseUrl: "/api", headers: () => ({ "Content-Type": "application/json", Authorization: "Bearer session" }), fetch: async (url, init) => {
    assert.equal(url, "/api/workspaces/w/assistant/attachments");
    assert.equal(init.method, "POST");
    assert.equal(new Headers(init.headers).get("Content-Type"), null);
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer session");
    assert.ok(init.body instanceof FormData);
    assert.equal(await init.body.get("file").text(), "file contents");
    assert.equal(init.body.get("file").name, "report.txt");
    return json(value);
  } });
  assert.deepEqual(await api.upload("w", file), value);
});

test("untrusted response envelopes, messages, attachments and timestamps are validated", async () => {
  const cases = [
    new Response("<html>bad gateway</html>"),
    new Response(JSON.stringify({ messages: [] })),
    json({ ...thread, messages: [{ ...message, role: "system" }] }),
    json({ ...thread, messages: [{ ...message, content: 1 }] }),
    json({ ...thread, messages: [{ ...message, createdAt: "yesterday" }] }),
    json({ ...thread, messages: [{ ...message, attachments: [{ id: "f", name: "f", type: "x", size: -1 }] }] }),
    json({ ...thread, messages: [{ ...message, attachments: [{ id: "f", name: "f", type: "x", size: 1, url: "javascript:alert(1)" }] }] }),
    json({ ...thread, updatedAt: null }),
    json({ ...thread, messages: "wrong" }),
  ];
  for (const response of cases) {
    const api = createHttpAssistantApi({ baseUrl: "/api", fetch: async () => response });
    await assert.rejects(api.get("w", "t"), fail("invalid"));
  }
  const api = createHttpAssistantApi({ baseUrl: "/api", fetch: async () => json({ ...thread, messages: [{ ...message, content: "<script>text only</script>", internalSecret: "drop" }], internalSecret: "drop" }) });
  const result = await api.get("w", "t");
  assert.equal(result.messages[0].content, "<script>text only</script>", "content stays plain text for React rendering");
  assert.equal(result.internalSecret, undefined);
  assert.equal(result.messages[0].internalSecret, undefined);
});

test("HTTP status, server errors and network failures retain actionable error codes", async () => {
  for (const [status, code] of [[401, "unauthorized"], [403, "forbidden"], [404, "not-found"], [409, "conflict"], [412, "conflict"], [422, "invalid"], [429, "rate-limited"], [502, "server"]]) {
    const api = createHttpAssistantApi({ baseUrl: "/api", fetch: async () => new Response(JSON.stringify({ error: { message: `Failure ${status}` } }), { status }) });
    await assert.rejects(api.list("w"), error => error.code === code && error.status === status && error.message === `Failure ${status}`);
  }
  const offline = createHttpAssistantApi({ baseUrl: "/api", fetch: async () => { throw new TypeError("offline"); } });
  await assert.rejects(offline.list("w"), fail("network"));
  const htmlFailure = createHttpAssistantApi({ baseUrl: "/api", fetch: async () => new Response("<html>unavailable</html>", { status: 503 }) });
  await assert.rejects(htmlFailure.list("w"), fail("server"));
});

test("caller cancellation works before fetch, during auth and during body reading", async () => {
  let sent = 0;
  const controller = new AbortController();
  controller.abort();
  const api = createHttpAssistantApi({ baseUrl: "/api", fetch: async () => { sent++; return json([]); } });
  await assert.rejects(api.list("w", controller.signal), fail("aborted"));
  assert.equal(sent, 0);
  const duringAuth = new AbortController();
  const authApi = createHttpAssistantApi({ baseUrl: "/api", headers: () => new Promise(() => {}), fetch: async () => { sent++; return json([]); } });
  const authRequest = authApi.list("w", duringAuth.signal);
  duringAuth.abort();
  await assert.rejects(authRequest, fail("aborted"));
  assert.equal(sent, 0);
  const body = new AbortController();
  let observed;
  const bodyApi = createHttpAssistantApi({ baseUrl: "/api", fetch: async (_url, init) => { observed = init.signal; return { ok: true, status: 200, text: () => new Promise(() => {}) }; } });
  const pending = bodyApi.list("w", body.signal);
  await Promise.resolve(); await Promise.resolve();
  body.abort();
  await assert.rejects(pending, fail("aborted"));
  assert.equal(observed.aborted, true);
});

test("timeout covers full response body and pending authentication", async () => {
  const slowBody = createHttpAssistantApi({ baseUrl: "/api", timeoutMs: 10, fetch: async () => ({ ok: true, status: 200, text: () => new Promise(() => {}) }) });
  await assert.rejects(slowBody.list("w"), fail("timeout"));
  const slowAuth = createHttpAssistantApi({ baseUrl: "/api", timeoutMs: 10, headers: () => new Promise(() => {}) });
  await assert.rejects(slowAuth.list("w"), fail("timeout"));
});

test("integrations use server connection state and validate authorization URL schemes", async () => {
  const calls = [];
  const api = createHttpAssistantApi({ baseUrl: "/api", fetch: async (url, init) => { calls.push([url, init.method]); return json(url.endsWith("/integrations") ? [{ id: "google/drive", name: "Google Drive", connected: false }] : { authorizationUrl: "https://auth.test/oauth?state=s" }); } });
  assert.equal((await api.integrations("w"))[0].connected, false);
  assert.deepEqual(await api.connect("w", "google/drive"), { authorizationUrl: "https://auth.test/oauth?state=s" });
  assert.deepEqual(calls, [["/api/workspaces/w/assistant/integrations", "GET"], ["/api/workspaces/w/assistant/integrations/google%2Fdrive/connect", "POST"]]);
  for (const authorizationUrl of ["javascript:alert(1)", "data:text/html,x", "/relative-auth", "https://user:password@auth.test/"]) {
    const bad = createHttpAssistantApi({ baseUrl: "/api", fetch: async () => json({ authorizationUrl }) });
    await assert.rejects(bad.connect("w", "x"), fail("invalid"));
  }
  const bad = createHttpAssistantApi({ baseUrl: "/api", fetch: async () => json([{ id: "x", name: "X", connected: "yes" }]) });
  await assert.rejects(bad.integrations("w"), fail("invalid"));
});

test("configuration reuses workspace runtime settings, supports custom routes, and is null without an endpoint", async () => {
  const previous = globalThis.__workspaceBackendConfig;
  const oldEnv = process.env.NEXT_PUBLIC_WORKSPACE_API_URL;
  try {
    delete globalThis.__workspaceBackendConfig;
    delete process.env.NEXT_PUBLIC_WORKSPACE_API_URL;
    assert.equal(createConfiguredAssistantApi(), null);
    const calls = [];
    globalThis.__workspaceBackendConfig = { baseUrl: "https://api.test", headers: async () => ({ Authorization: "Bearer runtime" }), resolveAssistantUrl: target => target.kind === "list" ? "/host/threads" : undefined, fetch: async (url, init) => { calls.push([url, new Headers(init.headers).get("Authorization")]); return json([]); } };
    await createConfiguredAssistantApi().list("w");
    assert.deepEqual(calls, [["/host/threads", "Bearer runtime"]]);
  } finally {
    if (previous === undefined) delete globalThis.__workspaceBackendConfig; else globalThis.__workspaceBackendConfig = previous;
    if (oldEnv === undefined) delete process.env.NEXT_PUBLIC_WORKSPACE_API_URL; else process.env.NEXT_PUBLIC_WORKSPACE_API_URL = oldEnv;
  }
});

test("extended thinking and effort travel with the message only when thinking is on", async () => {
  const bodies = [];
  const api = createHttpAssistantApi({ baseUrl: "/api", fetch: async (url, init) => { bodies.push(JSON.parse(init.body)); return json({ thread }); } });
  await api.send("w", input);
  await api.send("w", { ...input, thinking: false, effort: "high" });
  await api.send("w", { ...input, thinking: true, effort: "high" });
  await api.send("w", { ...input, thinking: true });
  assert.deepEqual(bodies.map(body => [body.thinking, body.effort]), [[undefined, undefined], [undefined, undefined], [true, "high"], [true, "medium"]]);
  const before = bodies.length;
  await assert.rejects(api.send("w", { ...input, thinking: "yes" }), fail("invalid"));
  await assert.rejects(api.send("w", { ...input, thinking: true, effort: "extreme" }), fail("invalid"));
  assert.equal(bodies.length, before);
});
