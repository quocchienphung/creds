import test from "node:test";
import assert from "node:assert/strict";
import { activeStep, createPlan, effectOf, estimateMs, formatElapsed, formatEstimate, formatStepTime, planReducer, progressOf } from "./plan-model.ts";
import { defaultInvoiceSteps, invoiceStatusOf } from "./invoice-plan.ts";

const start = () => createPlan(defaultInvoiceSteps);
const run = (state, ...actions) => actions.reduce(planReducer, state);
const titles = state => state.steps.map(step => step.title);
const states = state => state.steps.map(step => step.state);
const finish = (state, count) => {
  for (let i = 0; i < count; i++) state = planReducer(state, { type: "done", id: activeStep(state).id, tookMs: 1000 + i });
  return state;
};

test("a new plan is a draft with every step pending", () => {
  const plan = start();
  assert.equal(plan.phase, "draft");
  assert.deepEqual(states(plan), ["pending", "pending", "pending", "pending", "pending"]);
  assert.equal(invoiceStatusOf(plan.steps), "draft");
});

test("rename trims, ignores blanks and unknown ids", () => {
  const plan = start();
  assert.equal(titles(run(plan, { type: "rename", id: "review", title: "  Check totals " }))[1], "Check totals");
  assert.equal(run(plan, { type: "rename", id: "review", title: "   " }), plan);
  assert.equal(run(plan, { type: "rename", id: "nope", title: "x" }), plan);
  assert.equal(run(plan, { type: "rename", id: "review", title: "Review totals and tax" }), plan, "unchanged title is a no-op");
});

test("remove, add and move edit the order; ids stay stable", () => {
  let plan = run(start(), { type: "remove", id: "wait" }, { type: "add", title: "Archive the invoice" });
  assert.deepEqual(plan.steps.map(step => step.id), ["draft", "review", "send", "settle", "step-6"]);
  plan = run(plan, { type: "move", id: "settle", to: 0 });
  assert.deepEqual(plan.steps.map(step => step.id), ["settle", "draft", "review", "send", "step-6"]);
  plan = run(plan, { type: "move", id: "settle", to: 99 });
  assert.equal(plan.steps.at(-1).id, "settle", "target is clamped");
  assert.equal(run(plan, { type: "move", id: "nope", to: 1 }), plan);
  assert.equal(run(plan, { type: "add", title: " " }), plan);
});

test("Cancel restores the plan as first given, including removed and renamed steps", () => {
  const edited = run(start(), { type: "remove", id: "draft" }, { type: "rename", id: "send", title: "Mail it" }, { type: "add", title: "Extra" });
  const restored = run(edited, { type: "cancel" });
  assert.deepEqual(titles(restored), titles(start()));
  assert.equal(restored.phase, "draft");
});

test("running: the first step becomes active, each done step activates the next, the last one ends the run", () => {
  let plan = run(start(), { type: "run" });
  assert.equal(plan.phase, "running");
  assert.deepEqual(states(plan), ["active", "pending", "pending", "pending", "pending"]);
  assert.deepEqual(progressOf(plan), { position: 1, total: 5 });
  plan = finish(plan, 2);
  assert.deepEqual(states(plan), ["done", "done", "active", "pending", "pending"]);
  assert.deepEqual(progressOf(plan), { position: 3, total: 5 });
  plan = finish(plan, 3);
  assert.equal(plan.phase, "done");
  assert.deepEqual(states(plan), ["done", "done", "done", "done", "done"]);
  assert.deepEqual(plan.steps.map(step => step.tookMs), [1000, 1001, 1000, 1001, 1002]);
});

test("a plan with no steps cannot run, and nothing can be edited once it runs", () => {
  const empty = createPlan([]);
  assert.equal(run(empty, { type: "run" }), empty);
  const running = run(start(), { type: "run" });
  for (const action of [{ type: "rename", id: "review", title: "x" }, { type: "remove", id: "review" }, { type: "move", id: "review", to: 0 }, { type: "add", title: "x" }, { type: "cancel" }, { type: "run" }]) {
    assert.equal(run(running, action), running, action.type);
  }
});

test("a failed step stops the run; Retry resets it and everything after it, and keeps earlier results", () => {
  let plan = finish(run(start(), { type: "run" }), 2);
  plan = run(plan, { type: "fail", id: "send", error: "Mailbox full" });
  assert.equal(plan.phase, "failed");
  assert.deepEqual(states(plan), ["done", "done", "failed", "pending", "pending"]);
  assert.equal(plan.steps[2].error, "Mailbox full");
  assert.deepEqual(progressOf(plan), { position: 3, total: 5 });
  assert.equal(run(plan, { type: "retry", id: "review" }), plan, "only the failed step can be retried");
  plan = run(plan, { type: "retry", id: "send" });
  assert.equal(plan.phase, "running");
  assert.deepEqual(states(plan), ["done", "done", "active", "pending", "pending"]);
  assert.equal(plan.steps[2].error, undefined);
  assert.equal(plan.steps[0].tookMs, 1000, "earlier timings are kept");
});

test("stale completions are ignored (a step that is no longer active, or a plan that stopped)", () => {
  const running = run(start(), { type: "run" });
  assert.equal(run(running, { type: "done", id: "review", tookMs: 5 }), running);
  assert.equal(run(running, { type: "fail", id: "review", error: "x" }), running);
  const failed = run(running, { type: "fail", id: "draft", error: "x" });
  assert.equal(run(failed, { type: "done", id: "draft", tookMs: 5 }), failed);
});

test("Run again returns a finished or failed plan to review with clean steps, edits possible again", () => {
  const done = finish(run(start(), { type: "run" }), 5);
  const again = run(done, { type: "reopen" });
  assert.equal(again.phase, "draft");
  assert.deepEqual(states(again), ["pending", "pending", "pending", "pending", "pending"]);
  assert(again.steps.every(step => step.tookMs === undefined));
  assert.equal(titles(run(again, { type: "remove", id: "wait" })).length, 4);
  assert.equal(run(start(), { type: "reopen" }).phase, "draft");
});

test("the invoice is draft, then unpaid once it is sent, then paid once the payment is recorded", () => {
  let plan = run(start(), { type: "run" });
  assert.equal(invoiceStatusOf(plan.steps), "draft");
  plan = finish(plan, 2);
  assert.equal(invoiceStatusOf(plan.steps), "draft", "reviewing does not send it");
  plan = finish(plan, 1);
  assert.equal(invoiceStatusOf(plan.steps), "unpaid");
  plan = finish(plan, 1);
  assert.equal(invoiceStatusOf(plan.steps), "unpaid", "waiting keeps it unpaid");
  plan = finish(plan, 1);
  assert.equal(invoiceStatusOf(plan.steps), "paid");
  assert.equal(invoiceStatusOf(run(plan, { type: "reopen" }).steps), "draft", "a rerun starts from draft");
});

test("a failed send leaves the invoice a draft; the retry then sends it", () => {
  let plan = finish(run(start(), { type: "run" }), 2);
  plan = run(plan, { type: "fail", id: "send", error: "x" });
  assert.equal(invoiceStatusOf(plan.steps), "draft");
  plan = finish(run(plan, { type: "retry", id: "send" }), 1);
  assert.equal(invoiceStatusOf(plan.steps), "unpaid");
});

test("effect of a custom plan follows the steps that carry one", () => {
  const steps = [{ id: "a", title: "a", state: "done", effect: "x" }, { id: "b", title: "b", state: "done" }, { id: "c", title: "c", state: "pending", effect: "y" }];
  assert.equal(effectOf(steps, "start"), "x");
  assert.equal(effectOf([], "start"), "start");
});

test("estimate and clocks are formatted as on the preview", () => {
  assert.equal(estimateMs(createPlan(defaultInvoiceSteps).steps), 6600);
  assert.equal(formatEstimate(6600), "~7 s");
  assert.equal(formatEstimate(120000), "~2 min");
  assert.equal(formatEstimate(0), "~1 s");
  assert.equal(formatElapsed(48), "1s");
  assert.equal(formatElapsed(1550), "2s");
  assert.equal(formatElapsed(9300), "9s");
  assert.equal(formatStepTime(1316), "1.3s");
  assert.equal(formatStepTime(-5), "0.0s");
});
