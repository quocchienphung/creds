import test from "node:test";
import assert from "node:assert/strict";
import { assistantModels, resolveEffort, resolveModelId } from "./assistant-models.ts";

test("every model has a unique id, a name and a router (Auto) to fall back on", () => {
  assert.equal(new Set(assistantModels.map(model => model.id)).size, assistantModels.length);
  assert.ok(assistantModels.every(model => model.id && model.name));
  assert.ok(assistantModels.some(model => model.id === "auto"));
});

test("ratings are whole numbers from 1 to 5, set all together or not at all, and figures are positive", () => {
  for (const model of assistantModels) {
    const rated = [model.speed, model.quality, model.cost].filter(value => value !== undefined);
    assert.ok(rated.length === 0 || rated.length === 3, `${model.id}: speed, quality and cost go together`);
    for (const value of rated) assert.ok(Number.isInteger(value) && value >= 1 && value <= 5, `${model.id}: ${value}`);
    if (model.latencyMs !== undefined) assert.ok(model.latencyMs > 0);
    if (model.pricePerM !== undefined) assert.ok(model.pricePerM > 0);
  }
});

test("saved model ids from earlier versions map to a model; unknown ones become Auto", () => {
  assert.equal(resolveModelId("claude"), "claude-sonnet-5-5");
  assert.equal(resolveModelId("chatgpt"), "gpt-6-1-sol");
  assert.equal(resolveModelId("gemini"), "gemini");
  assert.equal(resolveModelId("claude-opus-5-5"), "claude-opus-5-5");
  assert.equal(resolveModelId("nope"), "auto");
  assert.equal(resolveModelId(undefined), "auto");
  assert.equal(resolveModelId("x", [{ id: "x" }]), "x");
  assert.deepEqual(["low", "high", "medium", "bogus", 3].map(resolveEffort), ["low", "high", "medium", "medium", "medium"]);
});
