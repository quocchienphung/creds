import { test } from "node:test";
import assert from "node:assert/strict";
import { loadingLabel, skeletonKindOf } from "./skeleton-kind.ts";
import { workspaceSections } from "../affectui-crm/workspace-state.ts";

test("every workspace section has a skeleton shaped for it, not the fallback by accident", () => {
  const expected = { Home: "home", Companies: "table", Contacts: "table", Deals: "table", Reports: "reports", "New chat": "chat", Files: "files", Run: "run", Skilled: "run", Repo: "run", Storage: "files", Queue: "files", Mapping: "canvas", Process: "canvas", Tracing: "trace", Orchestrator: "canvas", Invoice: "invoice", Usage: "settings", "Excel formation": "files", "JSON formation": "settings", "New business": "table", Renewals: "table", Partnerships: "table" };
  assert.deepEqual(Object.keys(expected).sort(), [...workspaceSections].sort(), "the test knows every section");
  for (const section of workspaceSections) assert.equal(skeletonKindOf(section), expected[section], section);
  assert.equal(skeletonKindOf("Something new"), "table", "an unknown page gets the list skeleton");
});

test("the loading label tells a screen reader which page is loading", () => {
  assert.equal(loadingLabel("Process"), "Loading process…");
  assert.equal(loadingLabel("Companies"), "Loading companies…");
  assert.equal(loadingLabel("New chat"), "Loading chat…");
  assert.equal(loadingLabel("New business"), "Loading new business…");
});
