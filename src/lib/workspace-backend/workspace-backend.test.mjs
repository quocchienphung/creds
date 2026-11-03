import test from "node:test";
import assert from "node:assert/strict";
import { BackendError, ResourceStore, createHttpBackend, createLocalBackend, conforms, createSnapshotSource, defineResource, diffById, localKey, storeFile, stripSecrets } from "./index.ts";

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const memoryStorage = (initial = {}) => { const data = new Map(Object.entries(initial)); return { data, getItem: key => data.has(key) ? data.get(key) : null, setItem: (key, value) => { data.set(key, value); } }; };
const json = (status, body, headers = {}) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
/** A backend that records every call, for testing the store. */
function fakeBackend({ remote = true, debounceMs = 5, stored = {}, failures = [] } = {}) {
  const calls = { load: [], save: [] };
  const backend = {
    kind: "fake", remote, debounceMs,
    async load(ref) { calls.load.push(ref); const hit = stored[`${ref.workspaceId ?? "-"}/${ref.name}`]; return hit === undefined ? null : hit; },
    async save(ref, value, context) { const failure = failures.shift(); calls.save.push({ ref, value, context }); await wait(8); if (failure) throw failure; return { version: `v${calls.save.length}` }; },
  };
  return { backend, calls };
}
const people = defineResource({ name: "contacts", scope: "workspace", storage: "backend", collection: true, empty: [] });
const keys = defineResource({ name: "settings-api-keys", scope: "workspace", storage: "backend", collection: true, secret: ["value"], empty: [] });
const tab = defineResource({ name: "active-tab", scope: "workspace", storage: "device" });
const run = defineResource({ name: "agent-run", scope: "workspace", storage: "backend", signature: value => `${value.phase}:${value.steps.join(",")}` });

test("changes are matched by id: created, updated, deleted, and reordering alone is not a change", () => {
  const before = [{ id: "a", n: 1 }, { id: "b", n: 2 }, { id: "c", n: 3 }];
  const after = [{ id: "c", n: 3 }, { id: "b", n: 20 }, { id: "d", n: 4 }];
  assert.deepEqual(diffById(before, after).map(change => [change.op, change.id]), [["update", "b"], ["create", "d"], ["delete", "a"]]);
  assert.deepEqual(diffById(before, [...before].reverse()), []);
  assert.equal(diffById([], [{ id: "x" }])[0].op, "create");
});

test("local keys are the ones earlier versions wrote, so saved data keeps working", () => {
  assert.equal(localKey({ name: "contacts", workspaceId: "acme" }), "affectui:acme:contacts");
  assert.equal(localKey({ name: "profile" }), "affectui:profile");
  assert.equal(localKey({ name: "mapping", workspaceId: "acme" }), "affectui:acme:mapping-data");
  assert.equal(localKey({ name: "invoice", workspaceId: "p" }), "affectui:p:invoice");
  assert.equal(localKey({ name: "agent-run", workspaceId: "acme" }), "affectui:acme:agent-run");
});

test("secrets are removed from records and plain objects, and untouched when there are none", () => {
  const list = [{ id: "1", name: "k", value: "sk-secret" }];
  assert.deepEqual(stripSecrets({ secret: ["value"] }, list), [{ id: "1", name: "k" }]);
  assert.deepEqual(stripSecrets({ secret: ["value"] }, { value: "x", keep: 1 }), { keep: 1 });
  assert.equal(stripSecrets({}, list), list);
  assert.equal(list[0].value, "sk-secret", "the original is not changed");
});

test("the local backend round-trips values and tolerates broken storage", async () => {
  const storage = memoryStorage({ "affectui:acme:contacts": JSON.stringify([{ id: "1" }]), "affectui:acme:folders": "{not json" });
  const backend = createLocalBackend(storage);
  assert.deepEqual((await backend.load({ name: "contacts", workspaceId: "acme" })).value, [{ id: "1" }]);
  assert.equal(await backend.load({ name: "folders", workspaceId: "acme" }), null);
  assert.equal(await backend.load({ name: "views", workspaceId: "acme" }), null);
  await backend.save({ name: "views", workspaceId: "acme" }, [{ id: "v" }], {});
  assert.equal(storage.data.get("affectui:acme:views"), '[{"id":"v"}]');
  assert.deepEqual([backend.remote, backend.debounceMs], [false, 0]);
  assert.deepEqual(backend.peek({ name: "contacts", workspaceId: "acme" }), { value: [{ id: "1" }] }, "stored data can be read without waiting");
  assert.equal(backend.peek({ name: "views", workspaceId: "acme" }).value[0].id, "v");
  assert.equal(createLocalBackend(null).peek({ name: "views" }), undefined, "no storage: cannot tell");
  assert.doesNotThrow(() => createLocalBackend({ getItem() { throw new Error("denied"); }, setItem() { throw new Error("full"); } }).save({ name: "views" }, 1, {}));
});

test("the http backend uses the documented routes, auth headers, versions and statuses", async () => {
  const seen = [];
  const responses = [json(200, { data: [{ id: "1" }], version: "7" }), json(404, { error: { message: "none" } }), json(204), json(200, { data: { ok: 1 } }, { ETag: '"9"' }), json(204, undefined, { ETag: '"10"' })];
  const backend = createHttpBackend({ baseUrl: "https://api.test/v1/", headers: async () => ({ Authorization: "Bearer t0k3n" }), fetch: async (url, init) => { seen.push([url, init.method, Object.fromEntries(new Headers(init.headers)), init.body, init.keepalive, init.credentials]); return responses.shift(); } });
  const loaded = await backend.load({ name: "contacts", workspaceId: "ac me" });
  assert.deepEqual(loaded, { value: [{ id: "1" }], version: "7" });
  assert.equal(seen[0][0], "https://api.test/v1/workspaces/ac%20me/contacts");
  assert.equal(seen[0][2].authorization, "Bearer t0k3n"); assert.equal(seen[0][2].accept, "application/json"); assert.equal(seen[0][5], "same-origin");
  assert.equal(await backend.load({ name: "profile" }), null, "404 means nothing saved yet");
  assert.equal(seen[1][0], "https://api.test/v1/account/profile");
  assert.equal(await backend.load({ name: "views", workspaceId: "w" }), null, "204 too");
  const etag = await backend.load({ name: "folders", workspaceId: "w" });
  assert.equal(etag.version, '"9"', "version from the ETag header");
  const saved = await backend.save({ name: "contacts", workspaceId: "w" }, [{ id: "2" }], { changes: [{ op: "create", id: "2" }], baseVersion: "7", unloading: true });
  assert.deepEqual(saved, { version: '"10"' });
  const [url, method, headers, body, keepalive] = seen[4];
  assert.deepEqual([url, method, headers["if-match"], headers["content-type"], keepalive], ["https://api.test/v1/workspaces/w/contacts", "PUT", "7", "application/json", true]);
  assert.deepEqual(JSON.parse(body), { data: [{ id: "2" }], changes: [{ op: "create", id: "2" }], baseVersion: "7" });
});

test("http failures become typed errors the screens can act on", async () => {
  const cases = [[401, "unauthorized"], [403, "forbidden"], [409, "conflict"], [412, "conflict"], [422, "invalid"], [429, "rate-limited"], [503, "server"]];
  for (const [status, code] of cases) {
    const backend = createHttpBackend({ baseUrl: "https://x", fetch: async () => json(status, { error: { message: `no ${status}` } }) });
    await assert.rejects(backend.save({ name: "views", workspaceId: "w" }, [], {}), error => error instanceof BackendError && error.code === code && error.status === status && error.message === `no ${status}`);
  }
  assert.equal(new BackendError("server", "x").retryable, true);
  assert.equal(new BackendError("conflict", "x").retryable, false);
  const offline = createHttpBackend({ baseUrl: "https://x", fetch: async () => { throw new TypeError("Failed to fetch"); } });
  await assert.rejects(offline.load({ name: "views", workspaceId: "w" }), error => error.code === "network");
  const hanging = createHttpBackend({ baseUrl: "https://x", timeoutMs: 20, fetch: (url, init) => new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))) });
  await assert.rejects(hanging.load({ name: "views", workspaceId: "w" }), error => error.code === "timeout");
  const bad = createHttpBackend({ baseUrl: "https://x", fetch: async () => new Response("<html>", { status: 200 }) });
  await assert.rejects(bad.load({ name: "views", workspaceId: "w" }), error => error.code === "invalid");
  const noData = createHttpBackend({ baseUrl: "https://x", fetch: async () => json(200, { nothing: 1 }) });
  await assert.rejects(noData.load({ name: "views", workspaceId: "w" }), error => error.code === "invalid");
});

test("queries, commands, uploads and run actions have their own routes; routes can be remapped", async () => {
  const seen = [];
  const backend = createHttpBackend({ baseUrl: "https://api.test", serverRun: true, resolveUrl: target => target.kind === "query" && target.name === "usage" ? "https://elsewhere.test/usage" : undefined, fetch: async (url, init) => { seen.push([url, init.method, init.body instanceof FormData ? "form" : init.body]); return url.includes("queries/plans") ? json(404) : json(200, { data: { url: "https://cdn/x.png", secret: "sk-1" } }); } });
  assert.equal(await backend.query("plans", "w", {}), undefined, "404 on a query means use the built-in sample");
  assert.deepEqual(await backend.query("analytics", "w", { days: 30 }), { url: "https://cdn/x.png", secret: "sk-1" });
  await backend.query("usage", "w", {});
  assert.deepEqual((await backend.command("api-key.create", "w", { name: "n" })).secret, "sk-1");
  await backend.run.send("w", { type: "approve", id: "s1" });
  assert.deepEqual(await backend.upload("w", "logo", new File(["x"], "logo.png")), { url: "https://cdn/x.png" });
  assert.deepEqual(seen.map(entry => [entry[0], entry[1]]), [["https://api.test/workspaces/w/queries/plans", "GET"], ["https://api.test/workspaces/w/queries/analytics?days=30", "GET"], ["https://elsewhere.test/usage", "GET"], ["https://api.test/workspaces/w/commands/api-key.create", "POST"], ["https://api.test/workspaces/w/agent-run/actions", "POST"], ["https://api.test/workspaces/w/uploads/logo", "POST"]]);
  assert.equal(seen[3][2], '{"name":"n"}'); assert.equal(seen[4][2], '{"type":"approve","id":"s1"}'); assert.equal(seen[5][2], "form");
});

test("the browser simulates the run unless the server is said to drive it", () => {
  assert.equal(createHttpBackend({ baseUrl: "https://api.test" }).run, undefined);
  assert.equal(typeof createHttpBackend({ baseUrl: "https://api.test", serverRun: true }).run.send, "function");
  assert.equal(createLocalBackend(null).run, undefined);
});

test("live resources are polled with a conditional request and unchanged answers are ignored", async () => {
  const calls = [];
  const backend = createHttpBackend({ baseUrl: "https://x", pollMs: 15, fetch: async (url, init) => { calls.push(new Headers(init.headers).get("If-None-Match")); return calls.length === 1 ? json(200, { data: 1 }, { ETag: "a" }) : calls.length === 2 ? new Response(null, { status: 304 }) : json(200, { data: 2 }, { ETag: "b" }); } });
  const updates = [];
  const stop = backend.subscribe({ name: "agent-run", workspaceId: "w" }, update => updates.push(update), { poll: true });
  await wait(90); stop();
  assert.deepEqual(updates.slice(0, 2), [{ value: 1, version: "a" }, { value: 2, version: "b" }]);
  assert.deepEqual(calls.slice(0, 3), [null, "a", "a"]);
  const quiet = backend.subscribe({ name: "contacts", workspaceId: "w" }, () => assert.fail("not live"), {});
  quiet();
});

test("the store shows an empty value while a remote load runs, then the stored one; screens share one entry", async () => {
  const { backend, calls } = fakeBackend({ stored: { "w/contacts": { value: [{ id: "1" }], version: "3" } } });
  const store = new ResourceStore(backend, createLocalBackend(memoryStorage()));
  const a = store.entry(people, "w", [{ id: "demo" }]);
  const b = store.entry(people, "w", [{ id: "other" }]);
  assert.equal(a, b);
  assert.deepEqual(a.getSnapshot().value, [], "remote backends start from the empty value, not the demo data");
  assert.deepEqual(a.getServerSnapshot().value, [{ id: "demo" }], "server rendering uses the demo defaults");
  const stop = a.subscribe(() => {});
  assert.equal(a.getSnapshot().phase, "loading");
  await wait(10);
  assert.deepEqual([a.getSnapshot().value, a.getSnapshot().phase], [[{ id: "1" }], "ready"]);
  assert.equal(calls.load.length, 1);
  const none = store.entry(people, "empty", [{ id: "demo" }]); none.subscribe(() => {}); await wait(10);
  assert.deepEqual(none.getSnapshot().value, [{ id: "demo" }], "nothing stored yet: the demo defaults");
  stop();
});

test("edits show at once and are saved after a pause with only the latest value, a diff and the base version", async () => {
  const { backend, calls } = fakeBackend({ stored: { "w/contacts": { value: [{ id: "1", n: 1 }], version: "3" } } });
  const entry = new ResourceStore(backend, createLocalBackend(memoryStorage())).entry(people, "w", []);
  entry.subscribe(() => {}); await wait(10);
  entry.set(rows => [...rows, { id: "2", n: 2 }]);
  entry.set(rows => rows.map(row => row.id === "1" ? { ...row, n: 10 } : row));
  assert.equal(entry.getSnapshot().value[0].n, 10, "immediate");
  assert.equal(calls.save.length, 0, "not yet");
  await wait(40);
  assert.equal(calls.save.length, 1);
  assert.deepEqual(calls.save[0].context.changes.map(change => [change.op, change.id]), [["update", "1"], ["create", "2"]]);
  assert.equal(calls.save[0].context.baseVersion, "3");
  assert.deepEqual(calls.save[0].value, [{ id: "1", n: 10 }, { id: "2", n: 2 }]);
  entry.set(rows => rows.filter(row => row.id !== "2")); await wait(40);
  assert.equal(calls.save[1].context.baseVersion, "v1", "the next save builds on the version the server returned");
  assert.deepEqual(calls.save[1].context.changes.map(change => [change.op, change.id]), [["delete", "2"]]);
  assert.equal(entry.getSnapshot().save, "idle");
});

test("only one save is in flight and an edit made meanwhile is saved right after", async () => {
  const { backend, calls } = fakeBackend({ remote: false, debounceMs: 0 });
  const entry = new ResourceStore(backend, backend).entry(people, "w", []);
  entry.subscribe(() => {}); await wait(5);
  entry.set([{ id: "1" }]); await wait(3);
  assert.equal(entry.getSnapshot().save, "saving");
  entry.set([{ id: "1" }, { id: "2" }]);
  await wait(40);
  assert.equal(calls.save.length, 2);
  assert.deepEqual(calls.save.map(call => call.value.length), [1, 2]);
});

test("secrets stay in the browser: removed from remote saves, kept by the local backend", async () => {
  const remote = fakeBackend(); const local = fakeBackend({ remote: false, debounceMs: 0 });
  for (const [fake, expected] of [[remote, undefined], [local, "sk-1"]]) {
    const entry = new ResourceStore(fake.backend, createLocalBackend(memoryStorage())).entry(keys, "w", []);
    entry.subscribe(() => {}); await wait(8);
    entry.set([{ id: "k", name: "Key", value: "sk-1" }]); await wait(40);
    assert.equal(fake.calls.save[0].value[0].value, expected);
    assert.equal(entry.getSnapshot().value[0].value, "sk-1", "the screen still has it");
  }
});

test("device resources never leave this browser, even with a remote backend", async () => {
  const { backend, calls } = fakeBackend(); const device = fakeBackend({ remote: false, debounceMs: 0 });
  const entry = new ResourceStore(backend, device.backend).entry(tab, "w", "Company CRM");
  entry.subscribe(() => {}); await wait(8);
  entry.set("Pixel integration"); await wait(20);
  assert.equal(calls.load.length + calls.save.length, 0);
  assert.equal(device.calls.save[0].value, "Pixel integration");
});

test("failures: network errors retry on their own, conflicts and rejections wait for the person", async () => {
  const flaky = fakeBackend({ debounceMs: 0, failures: [new BackendError("network", "offline")] });
  const entry = new ResourceStore(flaky.backend, createLocalBackend(memoryStorage())).entry(people, "w", []);
  entry.subscribe(() => {}); await wait(10);
  entry.set([{ id: "1" }]); await wait(40);
  assert.equal(entry.getSnapshot().save, "saving", "waiting to retry");
  await wait(1100);
  assert.equal(flaky.calls.save.length, 2); assert.equal(entry.getSnapshot().save, "idle");
  const conflict = fakeBackend({ debounceMs: 0, stored: { "w/contacts": { value: [{ id: "old" }], version: "1" } }, failures: [new BackendError("conflict", "changed elsewhere", 412)] });
  const stale = new ResourceStore(conflict.backend, createLocalBackend(memoryStorage())).entry(people, "w", []);
  stale.subscribe(() => {}); await wait(10);
  stale.set([{ id: "mine" }]); await wait(40);
  assert.deepEqual([stale.getSnapshot().save, stale.getSnapshot().error.code], ["error", "conflict"]);
  assert.equal(conflict.calls.save.length, 1, "no automatic retry on a conflict");
  stale.retry(); await wait(40);
  assert.deepEqual([stale.getSnapshot().value, stale.getSnapshot().save], [[{ id: "old" }], "idle"], "retry on a conflict reloads the stored value");
  const rejected = fakeBackend({ debounceMs: 0, failures: [new BackendError("invalid", "bad data", 422)] });
  const entryRejected = new ResourceStore(rejected.backend, createLocalBackend(memoryStorage())).entry(people, "w", []);
  entryRejected.subscribe(() => {}); await wait(10);
  entryRejected.set([{ id: "x" }]); await wait(40);
  assert.equal(entryRejected.getSnapshot().save, "error");
  entryRejected.retry(); await wait(40);
  assert.equal(entryRejected.getSnapshot().save, "idle");
  assert.equal(rejected.calls.save.length, 2);
});

test("edits made while the first load runs are kept, and nothing is saved until the load is done", async () => {
  const slow = fakeBackend({ debounceMs: 0, stored: { "w/contacts": { value: [{ id: "stored" }], version: "5" } } });
  const original = slow.backend.load; slow.backend.load = async ref => { await wait(30); return original(ref); };
  const entry = new ResourceStore(slow.backend, createLocalBackend(memoryStorage())).entry(people, "w", []);
  entry.subscribe(() => {});
  entry.set([{ id: "typed" }]); await wait(10);
  assert.equal(slow.calls.save.length, 0);
  await wait(60);
  assert.deepEqual(entry.getSnapshot().value, [{ id: "typed" }]);
  assert.equal(slow.calls.save.length, 1); assert.equal(slow.calls.save[0].context.baseVersion, "5");
});

test("a signature keeps high-frequency state from being saved on every tick", async () => {
  const { backend, calls } = fakeBackend({ debounceMs: 0, stored: { "w/agent-run": { value: { phase: "running", steps: ["a"], elapsed: 0 } } } });
  const entry = new ResourceStore(backend, backend).entry(run, "w", { phase: "running", steps: ["a"], elapsed: 0 });
  entry.subscribe(() => {}); await wait(10);
  for (let elapsed = 100; elapsed <= 500; elapsed += 100) entry.set(state => ({ ...state, elapsed }));
  await wait(30);
  assert.equal(calls.save.length, 0, "ticks alone are not saved");
  entry.set(state => ({ ...state, phase: "waiting" })); await wait(30);
  assert.equal(calls.save.length, 1);
  entry.apply({ phase: "done", steps: ["a"], elapsed: 9 });
  assert.equal(entry.getSnapshot().value.phase, "done"); assert.equal(calls.save.length, 1, "values pushed by the backend are not saved back");
});

test("changes from elsewhere replace the value unless there are unsaved local edits", async () => {
  let push;
  const { backend } = fakeBackend({ debounceMs: 0, stored: { "w/contacts": { value: [{ id: "1" }] } } });
  backend.subscribe = (ref, listener) => { push = listener; return () => {}; };
  const entry = new ResourceStore(backend, backend).entry(people, "w", []);
  entry.subscribe(() => {}); await wait(10);
  push({ value: [{ id: "1" }, { id: "from-elsewhere" }] });
  assert.equal(entry.getSnapshot().value.length, 2);
  entry.set([{ id: "mine" }]);
  push({ value: [{ id: "ignored" }] });
  assert.deepEqual(entry.getSnapshot().value, [{ id: "mine" }]);
});

test("the sync summary counts loading, saving and failed resources of remote backends only", async () => {
  const { backend } = fakeBackend({ debounceMs: 0, failures: [new BackendError("invalid", "Rejected by the server.", 422)] });
  const store = new ResourceStore(backend, createLocalBackend(memoryStorage()));
  const seen = []; store.subscribeSummary(() => seen.push(store.getSummary()));
  const entry = store.entry(people, "w", []); entry.subscribe(() => {});
  assert.equal(store.getSummary().loading, 1, "the first load counts");
  await wait(10);
  assert.equal(store.getSummary().loading, 0);
  entry.set([{ id: "1" }]); await wait(30);
  assert.deepEqual(store.getSummary(), { loading: 0, saving: 0, errors: 1, message: "Rejected by the server." });
  assert.ok(seen.some(summary => summary.saving === 1));
  store.retryAll(); await wait(30);
  assert.equal(store.getSummary().errors, 0);
  const device = store.entry(tab, "w", "x"); device.subscribe(() => {}); device.set("y"); await wait(10);
  assert.equal(store.getSummary().saving, 0, "device resources do not count");
});

test("a server-driven resource can opt out of saving", async () => {
  const { backend, calls } = fakeBackend({ debounceMs: 0 });
  const entry = new ResourceStore(backend, backend).entry(people, "w", [], { persist: false });
  entry.subscribe(() => {}); await wait(10);
  entry.set([{ id: "local" }]); await wait(30);
  assert.equal(calls.save.length, 0);
});

test("browser storage is read on the first render, so a screen never flashes its defaults", async () => {
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  try {
    const storage = memoryStorage({ "affectui:w:contacts": JSON.stringify([{ id: "stored" }]) });
    const store = new ResourceStore(createLocalBackend(storage), createLocalBackend(storage));
    const entry = store.entry(people, "w", [{ id: "demo" }]);
    assert.deepEqual([entry.getSnapshot().value, entry.getSnapshot().phase], [[{ id: "stored" }], "ready"]);
    assert.deepEqual(entry.getServerSnapshot().value, [{ id: "demo" }], "hydration still starts from the defaults");
    const none = store.entry(people, "empty", [{ id: "demo" }]);
    assert.deepEqual(none.getSnapshot().value, [{ id: "demo" }]);
    entry.subscribe(() => {}); entry.set([{ id: "edited" }]); await wait(10);
    assert.equal(storage.data.get("affectui:w:contacts"), '[{"id":"edited"}]');
  } finally { delete globalThis.window; }
});

test("a snapshot source sends the revision back, forwards commands, and after a conflict fetches the newest revision for the retry", async () => {
  const saved = [];
  let stored = { value: { n: 1 }, version: "v1" }, conflict = true;
  const backend = {
    kind: "fake", remote: true, debounceMs: 0,
    async load() { return stored; },
    async save(ref, value, context) { saved.push({ ref, value, context }); if (conflict) { conflict = false; stored = { value: { n: 2 }, version: "v2" }; throw new BackendError("conflict", "moved on", 409); } return { version: "v3" }; },
  };
  const source = createSnapshotSource(backend, { name: "mapping", workspaceId: "w" }, raw => { if (!raw || typeof raw.n !== "number") throw new Error("bad"); return raw; });
  assert.deepEqual(await source.load(), { n: 1 });
  await assert.rejects(() => source.save({ n: 5 }, [{ type: "x" }]), error => error.code === "conflict");
  await source.save({ n: 6 }, []);
  await source.save({ n: 7 });
  assert.deepEqual(saved.map(call => [call.context.baseVersion, call.context.commands]), [["v1", [{ type: "x" }]], ["v2", undefined], ["v3", undefined]]);
  assert.equal(source.subscribe, undefined, "no push channel means no subscribe");
  stored = { value: { oops: true }, version: "v9" };
  await assert.rejects(() => source.load(), /bad/, "untrusted data is checked before the screen sees it");
  stored = null;
  assert.equal(await source.load(), null, "nothing stored yet: the screen starts from its sample");
});

test("a snapshot source relays remote changes and drops the ones that fail validation", () => {
  let push = () => {};
  const backend = { kind: "fake", remote: true, debounceMs: 0, async load() { return null; }, async save() {}, subscribe(ref, listener) { push = listener; return () => { push = () => {}; }; } };
  const seen = [];
  const stop = createSnapshotSource(backend, { name: "invoice", workspaceId: "w" }, raw => { if (raw === "bad") throw new Error("bad"); return raw; }).subscribe(value => seen.push(value));
  push({ value: "ok", version: "v2" }); push({ value: "bad" }); push({ value: "also ok" });
  stop();
  assert.deepEqual(seen, ["ok", "also ok"]);
});

test("answers are checked against a sample of the expected shape", () => {
  const sample = { days: 7, items: [{ label: "a", value: 1 }], flag: true };
  assert.equal(conforms(sample, { days: 30, items: [{ label: "x", value: 2.5, extra: 1 }], flag: false, more: 1 }), true);
  assert.equal(conforms(sample, { days: 30, items: [], flag: false }), true, "no rows is a valid answer");
  assert.equal(conforms(sample, { days: "30", items: [], flag: false }), false);
  assert.equal(conforms(sample, { days: 30, items: [{ label: "x" }], flag: false }), false, "every row is checked");
  assert.equal(conforms(sample, { days: 30, items: {}, flag: false }), false);
  assert.equal(conforms(sample, { days: Number.NaN, items: [], flag: true }), false);
  assert.equal(conforms(sample, null), false);
  assert.equal(conforms(sample, [sample]), false);
});

test("a read model falls back to the built-in sample when the answer is missing or invalid, and keeps its data when a refresh fails", async () => {
  let answer = { n: 1 }, fail = false;
  const backend = { kind: "fake", remote: true, debounceMs: 0, async load() { return null; }, async save() {}, async query() { if (fail) throw new BackendError("server", "down", 500); return answer; } };
  const store = new ResourceStore(backend, createLocalBackend(null));
  const parse = raw => raw && typeof raw.n === "number" ? raw : undefined;
  const entry = store.query("usage", "w", {}, { n: 0 }, parse);
  assert.equal(entry.getSnapshot().phase, "loading");
  assert.deepEqual(entry.getSnapshot().data, { n: 0 }, "the sample is there while the server answers");
  const stop = entry.subscribe(() => {});
  await wait(10);
  assert.deepEqual([entry.getSnapshot().phase, entry.getSnapshot().data.n, entry.getSnapshot().error], ["ready", 1, null]);
  answer = { wrong: true }; await entry.load();
  assert.deepEqual([entry.getSnapshot().data.n, entry.getSnapshot().error.code], [0, "invalid"], "an answer in the wrong shape never reaches the screen");
  answer = { n: 5 }; await entry.load();
  fail = true; await entry.load(true);
  assert.deepEqual([entry.getSnapshot().data.n, entry.getSnapshot().error.code], [5, "server"], "a failed refresh keeps what is shown");
  fail = false; entry.retry(); await wait(10);
  assert.equal(entry.getSnapshot().error, null);
  assert.equal(store.query("usage", "w", {}, { n: 99 }, parse), entry, "screens share one query");
  assert.notEqual(store.query("usage", "w", { days: 30 }, { n: 0 }, parse), entry, "different parameters are different queries");
  stop();
  const local = new ResourceStore(createLocalBackend(null), createLocalBackend(null)).query("plans", "w", {}, ["sample"]);
  assert.deepEqual([local.getSnapshot().phase, local.getSnapshot().data], ["ready", ["sample"]], "no backend query: the sample, with nothing to wait for");
});

test("files go to the backend's upload route (account files to the account route), and fall back to a data URL only when there is no such route", async () => {
  const seen = [];
  const http = createHttpBackend({ baseUrl: "https://api.test", fetch: async (url, init) => { seen.push([url, init.method]); return url.includes("/document") ? json(404) : url.includes("/logo") ? json(500, { error: { message: "disk full" } }) : json(200, { data: { url: "https://cdn/a.png" } }); } });
  const file = new File(["hi"], "a.png", { type: "image/png" });
  assert.equal(await storeFile(http, undefined, "avatar", file), "https://cdn/a.png");
  assert.equal(await storeFile(http, "w", "document", file), "data:image/png;base64,aGk=", "no upload route: the file travels inside the saved data");
  await assert.rejects(() => storeFile(http, "w", "logo", file), /disk full/, "other failures are reported, not hidden");
  assert.deepEqual(seen.map(entry => entry[0]), ["https://api.test/account/uploads/avatar", "https://api.test/workspaces/w/uploads/document", "https://api.test/workspaces/w/uploads/logo"]);
  assert.equal(await storeFile(createLocalBackend(null), "w", "logo", file), "data:image/png;base64,aGk=", "this browser keeps the image in the saved data");
});
