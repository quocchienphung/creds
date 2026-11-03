import assert from "node:assert/strict";
import test from "node:test";
import { computeWires } from "./wires.ts";

// Recorded from the public preview (docs/research/orchestrator/source/agent-orchestrator/wires.json), coordinates relative to the flow
const rect = (left, top, width, height) => ({ left, top, width, height });

test("side by side: a trunk, a bus above the lanes and one below, an elbow into the last lane (the recorded paths)", () => {
  const wires = computeWires({
    leadMark: rect(20, 20, 20, 20), lead: rect(20, 20, 742, 122),
    lanes: [rect(20, 182, 178, 129), rect(208, 182, 178, 129), rect(396, 182, 178, 129), rect(584, 182, 178, 129)],
    summary: rect(20, 351, 742, 255), summaryMark: rect(20, 351, 20, 20),
  });
  assert.equal(wires.wide, true);
  assert.equal(wires.trunk, "M30.5 46V154.5Q30.5 162.5 38.5 162.5H665.5M665.5 331.5H38.5Q30.5 331.5 30.5 339.5V345");
  const into = wires.branches.filter(branch => branch.side === "in").map(branch => branch.d);
  assert.deepEqual(into, ["M109.5 162.5V182", "M297.5 162.5V182", "M485.5 162.5V182", "M665.5 162.5Q673.5 162.5 673.5 170.5V182"]);
  const out = wires.branches.filter(branch => branch.side === "out").map(branch => branch.d);
  assert.deepEqual(out, ["M109.5 311V331.5", "M297.5 311V331.5", "M485.5 311V331.5", "M673.5 311V323.5Q673.5 331.5 665.5 331.5"]);
  assert.deepEqual(wires.ports.filter(port => port.side === "in").map(port => [port.cx, port.cy]), [[109.5, 182.5], [297.5, 182.5], [485.5, 182.5], [673.5, 182.5]]);
  assert.deepEqual(wires.ports.filter(port => port.side === "out").map(port => port.cy), [310.5, 310.5, 310.5, 310.5]);
});

test("stacked: one trunk in the lead's column and a short branch with a port into each lane (the recorded paths)", () => {
  const lanes = [158, 297, 436, 575].map(top => rect(52, top, 590.81, 129));
  const wires = computeWires({ leadMark: rect(20, 20, 20, 20), lead: rect(20, 20, 622.81, 122), lanes, summary: rect(20, 720, 622.81, 255), summaryMark: rect(20, 720, 20, 20) });
  assert.equal(wires.wide, false);
  assert.equal(wires.trunk, "M30.5 46V714");
  assert.deepEqual(wires.branches.map(branch => branch.d), ["M30.5 179.5H52", "M30.5 318.5H52", "M30.5 457.5H52", "M30.5 596.5H52"]);
  assert.deepEqual(wires.ports.map(port => [port.cx, port.cy]), [[52.5, 179.5], [52.5, 318.5], [52.5, 457.5], [52.5, 596.5]]);
});

test("the packet routes follow the same paths: down the trunk into a lane, and from a lane back to the summary", () => {
  const lanes = [158, 297].map(top => rect(52, top, 590, 129));
  const stacked = computeWires({ leadMark: rect(20, 20, 20, 20), lead: rect(20, 20, 600, 122), lanes, summary: rect(20, 500, 600, 100), summaryMark: rect(20, 500, 20, 20) });
  assert.equal(stacked.dispatch[1], "M30.5 46V318.5H52");
  assert.equal(stacked.back[1], "M52 318.5H30.5V494");
  const side = computeWires({ leadMark: rect(20, 20, 20, 20), lead: rect(20, 20, 742, 122), lanes: [rect(20, 182, 178, 129), rect(208, 182, 178, 129)], summary: rect(20, 351, 742, 100), summaryMark: rect(20, 351, 20, 20) });
  assert.equal(side.dispatch[0], "M30.5 46V154.5Q30.5 162.5 38.5 162.5H109.5V182");
  assert.ok(side.dispatch[1].endsWith("Q297.5 162.5 297.5 170.5V182"));
  assert.ok(side.back[0].startsWith("M109.5 311V331.5H38.5Q30.5 331.5"));
});

test("lanes of different heights: each bottom branch starts at its own lane, the merge bus is under the summary's gap", () => {
  const wires = computeWires({ leadMark: rect(20, 20, 20, 20), lead: rect(20, 20, 742, 122), lanes: [rect(20, 182, 178, 129), rect(208, 182, 178, 329)], summary: rect(20, 551, 742, 100), summaryMark: rect(20, 551, 20, 20) });
  assert.deepEqual(wires.branches.filter(branch => branch.side === "out").map(branch => branch.d.slice(0, 12)), ["M109.5 311V5", "M297.5 511V5"]);
});
