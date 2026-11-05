import { test } from "node:test";
import assert from "node:assert/strict";
import { loadingLabel, skeletonKindOf } from "./skeleton-kind.ts";
import { workspaceSections } from "../affectui-crm/workspace-state.ts";

test("every workspace section has a skeleton shaped for it, not the fallback by accident", () => {
  const expected = { Queue: "files", "Excel formation": "files", "JSON formation": "settings", Converter: "files" };
  assert.deepEqual(Object.keys(expected).sort(), [...workspaceSections].sort(), "the test knows every section");
  for (const section of workspaceSections) assert.equal(skeletonKindOf(section), expected[section], section);
  assert.equal(skeletonKindOf("Something new"), "table", "an unknown page gets the list skeleton");
});

test("the loading label tells a screen reader which page is loading", () => {
  assert.equal(loadingLabel("Queue"), "Loading queue…");
  assert.equal(loadingLabel("Excel formation"), "Loading excel formation…");
});
