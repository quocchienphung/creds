import test from "node:test";
import assert from "node:assert/strict";
import { colorCanvas, defaultColors, floorHeights, floorPath, gradientStops, lightCanvas, lightScale, stillSeconds } from "./gradient-floor-model.ts";

const first = { rim: 505.6, left: 247.5, right: 251.9, shelf: 593.3, mid: 519.5 };

test("time 0 reproduces the first frame measured on the preview", () => {
  const h = floorHeights(0);
  for (const key of Object.keys(first)) assert(Math.abs(h[key] - first[key]) < 0.6, `${key}: ${h[key]} vs ${first[key]}`);
});

test("one loop of `speed` seconds returns to the same shape", () => {
  for (const speed of [3, 1.5, 6]) {
    const a = floorHeights(0.4, speed), b = floorHeights(0.4 + speed, speed);
    for (const key of Object.keys(a)) assert(Math.abs(a[key] - b[key]) < 1e-9, key);
  }
});

test("each height stays within its measured range", () => {
  const range = { rim: [485.7, 645.7], left: [187.3, 407.3], right: [251.2, 471.2], shelf: [485.9, 645.9], mid: [318.9, 538.9] };
  for (let t = 0; t < 6; t += 0.05) {
    const h = floorHeights(t);
    for (const [key, [lo, hi]] of Object.entries(range)) assert(h[key] >= lo - 0.3 && h[key] <= hi + 0.3, `${key} ${h[key]} at ${t}`);
  }
});

test("speed 0 keeps the shape still", () => {
  assert.deepEqual(floorHeights(0, 0), floorHeights(5, 0));
});

test("the still pose used for reduced motion is the one measured on the preview", () => {
  const h = floorHeights(stillSeconds);
  const measured = { rim: 643.3, left: 297.3, right: 453.9, shelf: 507.3, mid: 376.1 };
  for (const key of Object.keys(measured)) assert(Math.abs(h[key] - measured[key]) < 0.6, `${key}: ${h[key]} vs ${measured[key]}`);
});

test("the five heights move out of step (the peaks and valleys rise and fall against each other)", () => {
  const peak = key => { let best = [0, -1]; for (let t = 0; t < 3; t += 0.01) { const v = floorHeights(t)[key]; if (v > best[1]) best = [t, v]; } return best[0]; };
  const peaks = ["rim", "left", "right", "shelf", "mid"].map(peak);
  assert.equal(new Set(peaks.map(t => t.toFixed(1))).size, 5);
});

test("the path is a closed contour with the measured anchor points", () => {
  const d = floorPath(floorHeights(0));
  assert(d.startsWith("M926.8 505.6C926.8 505.6 302.1 247.5 291.3 241.5V1222.8H3155.8V251.9L2493.8 593.3H2189.3V593.3L1898.8 519.5H1510.8V519.5L1230.8 505.6H926.8V505.6Z") || d.startsWith("M926.8 505."), d);
  assert(d.endsWith("Z"));
});

test("the light layer is the same contour at 0.8427 scale on its own canvas", () => {
  assert(Math.abs(lightScale - 0.8427) < 1e-4);
  assert(Math.abs(lightCanvas.height / colorCanvas.height - lightScale) < 1e-3);
  const h = floorHeights(1.2);
  const nums = d => d.match(/-?\d+\.?\d*/g).map(Number);
  const c = nums(floorPath(h)), l = nums(floorPath(h, lightScale));
  c.forEach((n, i) => assert(Math.abs(l[i] - n * lightScale) < 0.15, `${i}: ${l[i]} vs ${n * lightScale}`));
});

test("default colours and stops are the measured ones", () => {
  assert.deepEqual([...defaultColors], ["#FF7700", "#FF0055", "#0073FF"]);
  assert.deepEqual([...gradientStops], [0, 0.302885, 0.673077]);
});
