import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { authorize } from "./api-guard.ts";
import { matchesNone, readResource, writeResource } from "./workspace-store.ts";
import { deliverToAgent } from "./agent-delivery.ts";
import { createHash } from "node:crypto";

let dir;
before(async () => { dir = await mkdtemp(path.join(tmpdir(), "logio-store-")); process.env.LOGIO_DATA_DIR = dir; });
after(async () => { await rm(dir, { recursive: true, force: true }); delete process.env.LOGIO_DATA_DIR; delete process.env.LOGIO_API_TOKEN; });

const request = (host, init = {}) => new Request(`http://${host}/api/workspace/health`, { ...init, headers: { host, ...(init.headers ?? {}) } });

test("store round-trips, versions and rejects stale writes", async () => {
  assert.equal(await readResource("acme", "repo-library"), null);
  const first = await writeResource("acme", "repo-library", [{ id: "1" }], null);
  assert.equal((await readResource("acme", "repo-library")).version, first.version);
  assert.ok(matchesNone(`"${first.version}"`, first.version));
  const second = await writeResource("acme", "repo-library", [{ id: "1" }, { id: "2" }], first.version);
  assert.notEqual(second.version, first.version);
  await assert.rejects(writeResource("acme", "repo-library", [], first.version), error => error.status === 412);
  const account = await writeResource(undefined, "profile", { name: "A" }, null);
  assert.deepEqual((await readResource(undefined, "profile")).data, { name: "A" });
  assert.ok(account.version);
});

test("store refuses unsafe names and ids", async () => {
  await assert.rejects(readResource("../x", "profile"), error => error.status === 400);
  await assert.rejects(readResource("acme", "../profile"), error => error.status === 400);
  await assert.rejects(writeResource("acme", "Profile", 1, null), error => error.status === 400);
});

test("concurrent writes are serialised", async () => {
  await Promise.all(Array.from({ length: 12 }, (_, index) => writeResource("acme", "checklist", [index], null)));
  const stored = await readResource("acme", "checklist");
  assert.ok(Array.isArray(stored.data) && stored.data.length === 1);
});

test("guard serves private hosts only unless a token is set", async () => {
  delete process.env.LOGIO_API_TOKEN;
  assert.equal(authorize(request("localhost:3000")), null);
  assert.equal(authorize(request("192.168.1.20:3000")), null);
  assert.equal(authorize(request("nas.local")), null);
  assert.equal(authorize(request("example.com"))?.status, 403);
  assert.equal(authorize(request("localhost:3000", { method: "PUT", headers: { origin: "http://evil.test" } }))?.status, 403);
  assert.equal(authorize(request("localhost:3000", { method: "PUT", headers: { origin: "http://localhost:3000" } })), null);
  process.env.LOGIO_API_TOKEN = "secret-token";
  assert.equal(authorize(request("example.com"))?.status, 401);
  assert.equal(authorize(request("example.com", { headers: { authorization: "Bearer wrong-token" } }))?.status, 401);
  assert.equal(authorize(request("example.com", { headers: { authorization: "Bearer secret-token" } })), null);
  delete process.env.LOGIO_API_TOKEN;
});

const sha = value => createHash("sha256").update(value, "utf8").digest("hex");
function bundle(workspaceId) {
  const instructions = "---\nname: demo-skill\ndescription: Demo.\n---\n\nDo the thing.\n";
  return { version: 1, workspaceId, createdAt: new Date().toISOString(), skills: [{ id: "s1", name: "demo-skill", description: "Demo.", instructions, sourceUrl: "", sourceRef: "", sourcePath: "", sha256: sha(instructions), bytes: Buffer.byteLength(instructions), importedAt: new Date().toISOString(), target: "Local AI", status: "ready", guardrails: { citeSources: true, verifyBeforeAnswer: true, askWhenUncertain: true }, files: [] }] };
}

test("skill.transfer writes the bundle for the agent and returns a matching receipt", async () => {
  const receipt = await deliverToAgent("acme", { agent: "research-agent", bundle: bundle("acme") });
  assert.equal(receipt.agent, "research-agent");
  assert.deepEqual(receipt.accepted.map(item => item.id), ["s1"]);
  assert.match(await readFile(path.join(dir, "agents", "research-agent", "demo-skill", "SKILL.md"), "utf8"), /Do the thing/);
  // delivering again replaces the files instead of failing
  await deliverToAgent("acme", { agent: "research-agent", bundle: bundle("acme") });
});

test("skill.transfer refuses a wrong workspace, a bad agent id and a tampered bundle", async () => {
  await assert.rejects(deliverToAgent("other", { agent: "a", bundle: bundle("acme") }), error => error.status === 400);
  await assert.rejects(deliverToAgent("acme", { agent: "../evil", bundle: bundle("acme") }), error => error.status === 403);
  const tampered = bundle("acme"); tampered.skills[0].instructions += "x";
  await assert.rejects(deliverToAgent("acme", { agent: "a", bundle: tampered }), error => error.status === 422);
  process.env.LOGIO_AGENTS = "only-this";
  await assert.rejects(deliverToAgent("acme", { agent: "a", bundle: bundle("acme") }), error => error.status === 403);
  delete process.env.LOGIO_AGENTS;
});
