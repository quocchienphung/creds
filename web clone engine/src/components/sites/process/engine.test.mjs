import { test } from "node:test";
import assert from "node:assert/strict";
import { createRemoteEngine, createSimulatedEngine, handleNow, simulatedHandle } from "./engine.ts";
import { createBlankProcess, createNode, createSampleProcess } from "./process-model.ts";
import { replay } from "./run-model.ts";

const doc = createSampleProcess(new Date("2026-10-21T09:00:00Z"));
const T0 = 5_000_000;
const snapshot = (extra = {}) => ({ id: "run-9", processId: doc.id, startedAt: 1000, at: 5000, state: "running", nodes: { launch: { status: "running", cost: 0.1, started: 1000 } }, ...extra });

/** A fetch that records calls and answers from a list of [status, body, headers?]. */
function mock(...answers) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(init.body) : undefined, headers: Object.fromEntries(new Headers(init.headers).entries()), credentials: init.credentials });
    const [status, body, headers] = answers.shift() ?? [500, { error: { message: "no answer" } }];
    return new Response(status === 204 || status === 304 ? null : JSON.stringify(body), { status, headers: headers ?? {} });
  };
  return { fetch, calls };
}
const engine = (m, extra = {}) => createRemoteEngine({ baseUrl: "https://api.test/v1/", fetch: m.fetch, headers: () => ({ Authorization: "Bearer t" }), credentials: "include", ...extra });

test('Retry after a terminal failure wakes the stopped page clock', async () => {
  const sim = createSimulatedEngine();
  const plan = createBlankProcess();
  plan.root = createNode({ id: 'failed', sim: { durationMs: 1000, failOnce: true } });
  const handle = await sim.start('w', plan, undefined, T0);
  assert.equal(sim.read(handle, T0 + 700).state, 'failed');
  const next = await sim.act('w', handle, { type: 'retry', id: 'failed' }, T0 + 2000);
  assert.equal(handleNow(next, T0 + 700), T0 + 2000);
  assert.equal(sim.read(next, handleNow(next, T0 + 700)).state, 'running');
  assert.equal(sim.read(next, T0 + 3100).state, 'done');
});

test("the simulated engine starts a run of the plan or of one task, and answers decisions", async () => {
  const sim = createSimulatedEngine();
  const whole = await sim.start("w", doc, undefined, T0);
  assert.equal(whole.kind, "simulated");
  assert.deepEqual(Object.keys(sim.read(whole, T0 + 100).nodes).sort(), ["analyst", "coder", "fixer", "launch", "planner", "research", "scraper", "tester", "writer"]);
  const branch = await sim.start("w", doc, "research", T0);
  assert.deepEqual(Object.keys(sim.read(branch, T0 + 100).nodes).sort(), ["analyst", "research", "scraper"]);
  await assert.rejects(sim.start("w", doc, "ghost", T0), error => error.code === "not-found");
  const waiting = T0 + 800;
  assert.equal(sim.read(whole, waiting).nodes.writer.status, "waiting");
  const approved = await sim.act("w", whole, { type: "approve", id: "writer" }, waiting);
  assert.equal(sim.read(approved, waiting + 100).nodes.writer.status, "running");
  await assert.rejects(sim.act("w", whole, { type: "retry", id: "writer" }, waiting), error => error.code === "conflict");
  assert.equal(handleNow(whole, 123), 123);
  assert.equal(simulatedHandle(whole.log).kind, "simulated");
  assert.equal(simulatedHandle({ nope: 1 }), null);
  assert.deepEqual(replay(whole.log, T0).nodes.launch.status, "running");
});

test("the REST engine posts the plan to the documented route with the host's headers", async () => {
  const m = mock([201, { data: snapshot(), version: "v1" }]);
  const handle = await engine(m).start("ws 1", doc, "research", T0);
  assert.equal(m.calls[0].url, "https://api.test/v1/workspaces/ws%201/process/runs");
  assert.equal(m.calls[0].method, "POST");
  assert.equal(m.calls[0].headers.authorization, "Bearer t");
  assert.equal(m.calls[0].headers["content-type"], "application/json");
  assert.equal(m.calls[0].credentials, "include");
  assert.equal(m.calls[0].body.processId, doc.id);
  assert.equal(m.calls[0].body.from, "research");
  assert.equal(m.calls[0].body.process.root.id, "launch");
  assert.equal(handle.kind, "remote");
  assert.equal(handle.runId, "run-9");
  assert.equal(handle.version, "v1");
});

test("actions go to the run's route; an answer with a snapshot replaces the state, an empty one keeps it", async () => {
  const m = mock([200, { data: snapshot({ at: 6000 }) }], [200, { data: snapshot() }], [204], [200, { data: snapshot({ at: 7000, state: "waiting" }) }]);
  const e = engine(m);
  const first = await e.start("w", doc, undefined, T0);
  const answered = await e.act("w", first, { type: "approve", id: "writer" }, T0);
  assert.equal(m.calls[1].url, "https://api.test/v1/workspaces/w/process/runs/run-9/actions");
  assert.deepEqual(m.calls[1].body, { type: "approve", id: "writer" });
  assert.equal(answered.snapshot.at, 5000);
  const quiet = await e.act("w", answered, { type: "stop" }, T0);
  assert.equal(quiet, answered);
  const polled = await e.refresh("w", answered);
  assert.equal(polled.snapshot.state, "waiting");
  assert.equal(e.read(polled).at, 7000);
});

test("polling sends the last version and keeps the handle on 304", async () => {
  const m = mock([200, { data: snapshot(), version: "v7" }], [304], [200, { data: snapshot({ at: 9000 }) }, { ETag: "v8" }]);
  const e = engine(m);
  const first = await e.start("w", doc, undefined, T0);
  const same = await e.refresh("w", first);
  assert.equal(m.calls[1].headers["if-none-match"], "v7");
  assert.equal(m.calls[1].method, "GET");
  assert.equal(same, first);
  const next = await e.refresh("w", same);
  assert.equal(next.version, "v8");
  assert.equal(next.snapshot.at, 9000);
});

test("the remote clock moves on from the server's time", async () => {
  const handle = { kind: "remote", runId: "r", snapshot: snapshot({ at: 10_000 }), receivedAt: 50_000 };
  assert.equal(handleNow(handle, 52_500), 12_500);
  assert.equal(handleNow(handle, 40_000), 10_000, "never backwards");
});

test("a snapshot that is not valid is refused and the old state stays", async () => {
  const m = mock([200, { data: { id: "x", state: "exploded" } }]);
  await assert.rejects(engine(m).start("w", doc, undefined, T0), error => error.code === "invalid" && /not a valid run/.test(error.message));
  const noData = mock([200, { nothing: true }]);
  await assert.rejects(engine(noData).start("w", doc, undefined, T0), error => error.code === "invalid");
  const text = mock([200, "<html>"]);
  text.fetch = async () => new Response("<html>", { status: 200 });
  await assert.rejects(engine(text).start("w", doc, undefined, T0), error => error.code === "invalid" && /not JSON/.test(error.message));
});

test("failures map to the backend's error codes and show the server's message", async () => {
  for (const [status, code] of [[401, "unauthorized"], [403, "forbidden"], [404, "not-found"], [409, "conflict"], [429, "rate-limited"], [503, "server"], [422, "invalid"]]) {
    const m = mock([status, { error: { message: `no ${status}` } }]);
    await assert.rejects(engine(m).start("w", doc, undefined, T0), error => error.code === code && error.message === `no ${status}`, String(status));
  }
  await assert.rejects(engine({ fetch: async () => { throw new TypeError("offline"); } }).start("w", doc, undefined, T0), error => error.code === "network");
  const slow = createRemoteEngine({ baseUrl: "https://api.test", timeoutMs: 20, fetch: (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))) });
  await assert.rejects(slow.start("w", doc, undefined, T0), error => error.code === "timeout");
  const controller = new AbortController();
  const hang = createRemoteEngine({ baseUrl: "https://api.test", fetch: (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))) });
  const pending = hang.start("w", doc, undefined, T0, controller.signal);
  controller.abort();
  await assert.rejects(pending, error => error.code === "aborted");
});

test("the catalog lists installed models, tolerates a missing route and drops what is not an entry", async () => {
  const m = mock([200, { data: [{ id: "ollama:llama3.2", label: "Llama 3.2 (local)", provider: "ollama", local: true, note: "on this machine" }, { id: "x", label: "Odd", provider: "skynet" }, { nope: 1 }, null] }], [404, {}]);
  const e = engine(m);
  const list = await e.catalog("w");
  assert.equal(m.calls[0].url, "https://api.test/v1/workspaces/w/process/engines");
  assert.deepEqual(list, [{ id: "ollama:llama3.2", label: "Llama 3.2 (local)", provider: "ollama", local: true, note: "on this machine" }, { id: "x", label: "Odd", provider: "custom", local: false }]);
  assert.deepEqual(await e.catalog("w"), []);
});

test("latest asks for the process's newest run and treats 'none' as null", async () => {
  const m = mock([200, { data: snapshot() }], [200, { data: null }], [404, {}]);
  const e = engine(m);
  const found = await e.latest("w", "proc 1");
  assert.equal(m.calls[0].url, "https://api.test/v1/workspaces/w/process/runs?processId=proc+1&latest=1");
  assert.equal(found.runId, "run-9");
  assert.equal(await e.latest("w", "p"), null);
  assert.equal(await e.latest("w", "p"), null);
});
