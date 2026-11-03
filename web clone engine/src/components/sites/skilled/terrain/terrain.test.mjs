import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { simulateCamera } from "../../../../../scripts/forensics/lib/terrain-sim.mjs";
import { TerrainCamera } from "./terrain-camera.ts";
import { Columns } from "./terrain-columns.ts";
import { rampColors, topColor } from "./terrain-colors.ts";
import { MAX_HEIGHT } from "./terrain-constants.ts";
import { DAY_NAMES, buildWorkspaceWeek, cellDetail, describeCell, describeWeek, formatDelta, moveCell, rangeLabel, summarize, weekStartOf } from "./terrain-data.ts";
import { createScene, darkTheme, drawTerrain, lightTheme, pick } from "./terrain-draw.ts";
import { DragGesture, DRAG_THRESHOLD } from "./terrain-pointer.ts";
import { SAMPLE_WEEK } from "./sample-week.ts";
import { Spring, framePerspective, frameTop } from "./terrain-math.ts";

const fixtures = new URL("../../../../../docs/research/uiarc-terrain/fixtures/", import.meta.url);
const fixture = async name => JSON.parse(await readFile(new URL(name, fixtures), "utf8"));
const size = { width: 622.81, height: 291.63 };

// ------------------------------------------------------------------------------------------------------------------------------------ data

test("the sample week is the one the public preview shows, with its totals, peaks and busiest day", () => {
  const sums = Object.fromEntries(Object.entries(SAMPLE_WEEK.metrics).map(([id, m]) => [id, [m.values.reduce((a, b) => a + b, 0), m.previous.reduce((a, b) => a + b, 0)]]));
  assert.deepEqual(sums, { operations: [231253, 212864], deliveries: [1074, 998], errors: [4275, 3350] });
  const operations = summarize(SAMPLE_WEEK.metrics.operations);
  assert.equal(formatDelta(operations.delta), "+8.6%");
  assert.equal(formatDelta(summarize(SAMPLE_WEEK.metrics.deliveries).delta), "+7.6%");
  assert.equal(formatDelta(summarize(SAMPLE_WEEK.metrics.errors).delta), "+27.6%");
  assert.deepEqual(operations.peaks.map(p => [DAY_NAMES[p.day], p.hour, p.value]), [["Wednesday", 15, 4745], ["Wednesday", 14, 4694], ["Thursday", 14, 4679]]);
  assert.equal(DAY_NAMES[operations.busiest.day], "Wednesday");
  assert.equal(operations.busiest.total, 44019);
  assert.equal(SAMPLE_WEEK.rangeLabel, "Sep 14 to 20, 2026");
});

test("a workspace week counts only what was recorded, by hour of the workspace clock, and never invents a comparison", () => {
  // Wednesday 22 Oct 2026, 14:35 in Ho Chi Minh City (UTC+7) is 07:35 UTC
  const now = Date.UTC(2026, 9, 22, 7, 35), start = weekStartOf(now);
  assert.equal(new Date(start + 7 * 3600_000).toISOString(), "2026-10-19T00:00:00.000Z");
  assert.equal(rangeLabel(start), "Oct 19 to 25, 2026");
  assert.equal(rangeLabel(weekStartOf(Date.UTC(2026, 9, 29, 5))), "Oct 26 to Nov 1, 2026");
  const at = (day, hour, minute = 5) => Date.UTC(2026, 9, 19 + day, hour - 7, minute);
  const events = [
    { t: at(3, 14), kind: "save", outcome: "success" }, { t: at(3, 14, 40), kind: "import", outcome: "success" }, { t: at(3, 14, 41), kind: "export", outcome: "success" },
    { t: at(3, 14, 42), kind: "transfer", outcome: "error" }, { t: at(0, 0, 0), kind: "save", outcome: "success" },
    { t: at(-4, 9), kind: "save", outcome: "success" },          // the week before (Thursday 15 Oct? Friday), counted as "last week"
    { t: at(9, 9), kind: "save", outcome: "success" },           // next week: not in this one
  ];
  const week = buildWorkspaceWeek(events, now), cell = 3 * 24 + 14;
  assert.equal(week.metrics.operations.values[cell], 4);
  assert.equal(week.metrics.deliveries.values[cell], 1);
  assert.equal(week.metrics.errors.values[cell], 1);
  assert.equal(week.metrics.operations.values[0], 1, "Monday 00:05 is the first hour of the week");
  assert.equal(week.metrics.operations.values.reduce((a, b) => a + b, 0), 5);
  assert.equal(week.metrics.operations.previous.reduce((a, b) => a + b, 0), 1);
  const summary = summarize(week.metrics.operations);
  assert.equal(summary.total, 5);
  assert.deepEqual(summary.peaks.map(p => [p.index, p.value]), [[cell, 4], [0, 1]]);
  const empty = summarize(buildWorkspaceWeek([], now).metrics.operations);
  assert.equal(empty.hasData, false); assert.equal(empty.delta, null); assert.equal(empty.busiest, null); assert.deepEqual(empty.peaks, []);
});

test("hour details, keyboard moves and the sentences read out", () => {
  const ops = SAMPLE_WEEK.metrics.operations, detail = cellDetail(ops, 2 * 24 + 15);
  assert.equal(detail.value, 4745); assert.equal(detail.previous, 4556); assert.equal(formatDelta(detail.change), "+4.1%");
  assert.equal(detail.share.toFixed(1), "10.8"); assert.equal(Math.max(...detail.spark), 1); assert.ok(Math.min(...detail.spark) >= 0.06);
  assert.equal(describeCell(ops, detail), "Wednesday 15:00 to 16:00: 4,745 operations, +4.1% on last week.");
  assert.equal(describeCell(ops, cellDetail(ops, 71), true), "Focused on Wednesday 23:00 to 00:00: 399 operations, −3.2% on last week.");
  assert.match(describeWeek(ops, SAMPLE_WEEK, summarize(ops)), /231,253 operations in total, \+8\.6% on last week\. Peak on Wednesday at 15:00 with 4,745\. Wednesday is the busiest day\./);
  assert.equal(moveCell(63, "ArrowRight"), 64); assert.equal(moveCell(63, "ArrowUp"), 39); assert.equal(moveCell(63, "Home"), 48); assert.equal(moveCell(63, "End"), 71);
  assert.equal(moveCell(0, "ArrowLeft"), 0); assert.equal(moveCell(167, "ArrowDown"), 167); assert.equal(moveCell(23, "ArrowRight"), 23);
});

// ------------------------------------------------------------------------------------------------------------------------------------ math

test("springs: critical and underdamped steps agree with a fine numerical integration for any step size", () => {
  for (const zeta of [1, 0.93, 0.6]) {
    const exact = new Spring(10, 6, zeta); exact.target = 2; exact.velocity = -3;
    let x = 10, v = -3; const h = 1e-5, k = 36, c = 2 * zeta * 6;
    for (let i = 0; i < 100000; i++) { const a = -k * (x - 2) - c * v; v += a * h; x += v * h; }       // 1 s, semi-implicit Euler
    for (let i = 0; i < 4; i++) exact.step(0.25);
    assert.ok(Math.abs(exact.value - x) < 2e-3, `zeta ${zeta}: ${exact.value} vs ${x}`);
    const split = new Spring(10, 6, zeta); split.target = 2; split.velocity = -3;
    for (let i = 0; i < 100; i++) split.step(0.01);
    assert.ok(Math.abs(split.value - exact.value) < 1e-6, "the same result however the time is cut");
  }
});

test("framing fits the scene at the measured scale for the sample metrics and canvas sizes", async () => {
  const heights = (await fixture("heights.json"));
  const rest = framePerspective(31.0193, -32.008, 41.985, heights.operations, size);
  assert.ok(Math.abs(rest.scale - 18.8948) < 0.05 && Math.abs(rest.ox - 16.232) < 0.4 && Math.abs(rest.oy + 10.885) < 0.5, JSON.stringify(rest));
  const errors = framePerspective(31.0193, -32.008, 41.985, heights.errors, size);
  assert.ok(Math.abs(errors.scale - 19.3847) < 0.1, `errors ${errors.scale}`);
  const big = framePerspective(31.0193, -32.008, 41.985, heights.operations, { width: 742, height: 344 });
  assert.ok(Math.abs(big.scale - 22.7718) < 0.1, `742x344 ${big.scale}`);
  const phone = framePerspective(31.0193, -50.032, 41.985, heights.operations, { width: 286, height: 280 });
  assert.ok(Math.abs(phone.scale - 10.0822) < 0.1 && Math.abs(phone.oy + 15.1) < 1, JSON.stringify(phone));
  const top = frameTop(size);
  assert.ok(Math.abs(top.scale - 21.48) < 0.02);
});

test("a drag starts only after the pointer has travelled the threshold, and releases with the recent velocity", () => {
  const g = new DragGesture();
  g.down(100, 100, 0);
  assert.equal(g.move(100 + DRAG_THRESHOLD, 100, 16), null, "within the threshold it is still a click");
  assert.deepEqual(g.move(100 + DRAG_THRESHOLD + 4, 100, 32), { dx: 0, dy: 0, began: true });
  assert.deepEqual(g.move(100 + DRAG_THRESHOLD + 8, 100, 64), { dx: 4, dy: 0, began: false });
  const end = g.up(70);
  assert.equal(end.moved, true); assert.ok(end.vx > 100 && end.vx < 300, `vx ${end.vx}`);
  const tap = new DragGesture(); tap.down(5, 5, 0); tap.move(7, 5, 10);
  assert.deepEqual(tap.up(20), { moved: false, vx: 200, vy: 0 });
});

test("the camera never leaves its soft limits for good, and flying and flattening are reversible", () => {
  const cam = new TerrainCamera(size); cam.setHeights(new Array(168).fill(2)); cam.snapToRest();
  const rest = cam.pose;
  cam.dragStart(); for (let i = 0; i < 60; i++) cam.dragMove(0, 8); cam.dragEnd(0, 0);
  assert.ok(cam.pose.pitch <= 90 && cam.pose.pitch >= 80, `dragged ${cam.pose.pitch}`);
  for (let i = 0; i < 300; i++) cam.step(1 / 60);
  assert.ok(cam.pose.pitch <= 84.7 && cam.pose.pitch >= 84.5, `springs back to the limit: ${cam.pose.pitch}`);
  cam.setView({ yaw: -32.008, pitch: 31.0193 }); cam.flyTo({ x: 3.5, y: 1, z: -1 });
  for (let i = 0; i < 300; i++) cam.step(1 / 60);
  assert.ok(cam.pose.scale > rest.scale * 1.45 && cam.pose.scale < rest.scale * 1.55);
  cam.flyTo(null); for (let i = 0; i < 300; i++) cam.step(1 / 60);
  assert.ok(Math.abs(cam.pose.scale - rest.scale) < 0.05 && Math.abs(cam.pose.tx) < 1e-3, "flying out restores the framing");
  cam.setMode("top"); for (let i = 0; i < 400; i++) cam.step(1 / 60);
  assert.ok(Math.abs(cam.pose.pitch - 90) < 0.01 && Math.abs(cam.pose.yaw) < 0.01);
  cam.setMode("perspective"); for (let i = 0; i < 400; i++) cam.step(1 / 60);
  assert.ok(Math.abs(cam.pose.scale - rest.scale) < 0.05 && Math.abs(cam.pose.pitch - rest.pitch) < 0.01, "top view and back lands on the rest pose");
  cam.zoomBy(10); assert.equal(cam.zoomLevel, 2.8); cam.zoomBy(0.001); assert.equal(cam.zoomLevel, 0.7);
});

// ------------------------------------------------------------------------------------------------------------------------------------ colour

test("column colours run from light to dark in the light theme, the other way in the dark, and to red for errors", () => {
  assert.ok(topColor(0, "neutral", false).every(v => v >= 220 && v <= 224), "the lowest hour is almost the platform grey");
  const light = [0, 0.25, 0.5, 0.75, 1].map(t => topColor(t, "neutral", false)[0]), dark = [0, 0.25, 0.5, 0.75, 1].map(t => topColor(t, "neutral", true)[0]);
  assert.deepEqual(light.slice().sort((a, b) => b - a), light); assert.deepEqual(dark.slice().sort((a, b) => a - b), dark);
  const red = topColor(1, "danger", false); assert.ok(red[0] > 190 && red[1] < 40 && red[2] < 60);
  assert.equal(rampColors("neutral", false).length, 6);
});

// ------------------------------------------------------------------------------------------------------------------------------------ rendering

/** Draw into a recording stand-in for the canvas, as {pts, fill} polygons and labels. */
function paint(params) {
  const polys = [], labels = [], texts = [];
  let path = [];
  const ctx = {
    fillStyle: "", strokeStyle: "", lineWidth: 1, lineJoin: "miter", font: "", textAlign: "start", textBaseline: "alphabetic", globalAlpha: 1,
    beginPath() { path = []; }, moveTo(x, y) { path.push([x, y]); }, lineTo(x, y) { path.push([x, y]); }, closePath() {},
    fill() { polys.push({ pts: path.slice(), fill: this.fillStyle }); }, stroke() {}, clearRect() {}, setLineDash() {}, roundRect() {},
    fillText(text, x, y) { labels.push({ text, x, y, fill: this.fillStyle }); texts.push(text); }, measureText(text) { return { width: text.length * 6.2 }; },
  };
  const scene = createScene();
  drawTerrain(ctx, params, scene);
  return { polys, labels, scene };
}
const rgbOf = s => /(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(s).slice(1).map(Number);
function compareFrame(mine, recorded) {
  const centroid = pts => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
  const used = new Set(); let matched = 0, missing = 0, worst = 0, colour = 0, colourWorst = 0;
  for (const r of recorded.polys.slice(1)) {
    if (r.p.length !== 8) continue;
    const pts = Array.from({ length: 4 }, (_, i) => [r.p[2 * i], r.p[2 * i + 1]]), c = centroid(pts);
    let best = -1, distance = 3;
    mine.polys.forEach((m, i) => { if (used.has(i) || m.pts.length !== 4) return; const d = Math.hypot(...centroid(m.pts).map((v, k) => v - c[k])); if (d < distance) { distance = d; best = i; } });
    if (best < 0) { missing++; continue; }
    used.add(best);
    const m = mine.polys[best];
    worst = Math.max(worst, ...pts.map(p => Math.min(...m.pts.map(q => Math.hypot(p[0] - q[0], p[1] - q[1])))));
    const dc = Math.max(...rgbOf(r.f).map((v, k) => Math.abs(v - rgbOf(m.fill)[k]))); colour += dc; colourWorst = Math.max(colourWorst, dc); matched++;
  }
  return { matched, missing, extra: mine.polys.length - used.size - 1, worst, colour: colour / matched, colourWorst };
}
async function renderSetup(extra = {}) {
  const heights = (await fixture("heights.json")).operations, max = Math.max(...heights);
  return { heights, shares: heights.map(h => h / max), world: heights.map(h => h / max * MAX_HEIGHT), ...extra };
}

test("the rest view draws the same polygons, colours and labels as the public preview, frame for frame", async () => {
  const frame = await fixture("frame-rest.json"), { world, shares } = await renderSetup();
  const pose = { yaw: frame.pose.yaw, pitch: frame.pose.pitch, dist: frame.pose.dist, scale: frame.pose.scale, ox: frame.pose.cx, oy: frame.pose.cy, tx: 0, ty: 0, tz: 0 };
  const mine = paint({ pose, size, theme: lightTheme, tone: "neutral", heights: world, shares, highlight: null, flight: 0, compact: false });
  assert.equal(mine.polys.length, frame.polys.length, "the same number of polygons (visible faces)");
  const r = compareFrame(mine, frame);
  assert.equal(r.missing, 0); assert.equal(r.extra, 0);
  assert.ok(r.worst < 1, `vertices within a pixel: ${r.worst}`); assert.ok(r.colour < 3 && r.colourWorst <= 8, `colours ${r.colour} / ${r.colourWorst}`);
  assert.equal(mine.polys[0].fill, "rgb(249 249 249)");
  assert.deepEqual(mine.labels.map(l => l.text), frame.labels.map(l => l.text));
  mine.labels.forEach((l, i) => assert.ok(Math.hypot(l.x - frame.labels[i].x, l.y - frame.labels[i].y) < 1.2, `${l.text}`));
});

test("the top view draws flat tiles at the preview's positions, and the dark theme its darker colours", async () => {
  const top = await fixture("frame-top.json"), { shares } = await renderSetup();
  const pose = { yaw: 0, pitch: 90, dist: 159.6, scale: top.pose.scale, ox: top.pose.cx, oy: top.pose.cy, tx: 0, ty: 0, tz: 0 };
  const flat = paint({ pose, size, theme: lightTheme, tone: "neutral", heights: new Array(168).fill(0), shares, highlight: null, flight: 1, compact: false });
  assert.equal(flat.polys.length, top.polys.length);
  const r = compareFrame(flat, top);
  assert.ok(r.worst < 1 && r.missing === 0, JSON.stringify(r));
  assert.deepEqual(flat.labels.map(l => l.text), top.labels.map(l => l.text), "all seven days and every third hour in the flat view");
  const rest = await fixture("frame-rest.json"), dark = await fixture("frame-dark.json"), { world } = await renderSetup();
  const restPose = { yaw: rest.pose.yaw, pitch: rest.pose.pitch, dist: rest.pose.dist, scale: rest.pose.scale, ox: rest.pose.cx, oy: rest.pose.cy, tx: 0, ty: 0, tz: 0 };
  const night = paint({ pose: restPose, size, theme: darkTheme, tone: "neutral", heights: world, shares, highlight: null, flight: 0, compact: false });
  const rd = compareFrame(night, dark);
  assert.ok(rd.worst < 1 && rd.colour < 3, JSON.stringify(rd));
  assert.equal(night.polys[0].fill, "rgb(33 33 33)");
});

test("hover finds the column under the pointer, nearest first, and the highlight adds guide lines and two pills", async () => {
  const { world, shares } = await renderSetup();
  const cam = new TerrainCamera(size); cam.setHeights(world); cam.snapToRest();
  const params = { pose: cam.pose, size, theme: lightTheme, tone: "neutral", heights: world, shares, highlight: null, flight: 0, compact: false };
  const plain = paint(params);
  assert.equal(pick(plain.scene, 311.4, 145.8), 106, "the column under the middle of the canvas at rest");
  assert.equal(pick(plain.scene, 5, 5), null);
  const lit = paint({ ...params, highlight: 106 });
  assert.equal(lit.polys.filter(p => p.pts.length === 4).length, plain.polys.length + 2, "two ground bands");
  assert.ok(lit.scene.highlight && lit.scene.highlight.index === 106);
  assert.ok(lit.labels.some(l => l.text === "10:00" && l.fill === "rgb(255 255 255)") && lit.labels.some(l => l.text === "Fri"));
});

// ------------------------------------------------------------------------------------------------------------------------------------ motion

async function cameraScenario(name, extra = {}) {
  const data = await fixture(`camera-${name}.json`), heights = await fixture("heights.json");
  const sets = { load: heights.operations, [name]: heights[{ "metric-deploys": "deliveries", "metric-errors": "errors" }[name]] ?? heights.operations, before: name === "metric-deploys" ? heights.operations : heights.deliveries };
  return simulateCamera({ name, size, series: data.series, events: data.events, heights: sets, ...extra });
}
test("the camera's motion follows the recorded frames: intro, flights, orbit, zoom, fly", async () => {
  const limits = {
    load: [2, 8], "flatten-top": [2, 6], "flatten-perspective": [4, 22], "orbit-drag-slow": [1, 2], "orbitv-down": [2.5, 5],
    "zoom-keys": [2, 6], "peak-fly": [2.5, 6], "peak-leave": [1, 2], "metric-deploys": [1, 1.5], "metric-errors": [1, 1.5],
  };
  for (const [name, [mean, max]] of Object.entries(limits)) {
    const result = await cameraScenario(name);
    assert.ok(result.mean < mean && result.max < max, `${name}: mean ${result.mean.toFixed(2)}px (limit ${mean}), max ${result.max.toFixed(2)}px (limit ${max})`);
  }
});

test("columns rise in a wave along the grid's diagonal, quickly on a metric change", async () => {
  const heights = await fixture("heights.json");
  for (const [name, rise, start, end, flat] of [["load", "intro", new Array(168).fill(0), heights.operations, false], ["metric-deploys", "metric", heights.operations, heights.deliveries, false]]) {
    const frames = (await fixture(`columns-${name}.json`)).frames;
    const cols = new Columns();
    cols.setValues(start, "metric", flat, true); cols.springs.forEach((s, k) => s.snap(start[k]));
    cols.setValues(end, rise, flat);
    let previous = frames[0].t, sum = 0, n = 0, worst = 0;
    for (const f of frames) {
      cols.step(Math.max(0, f.t - previous) / 1000); previous = f.t;
      for (let k = 0; k < 168; k++) if (f.h[k] != null) { const d = Math.abs(cols.shown[k] - Math.max(0, f.h[k])); sum += d; n++; worst = Math.max(worst, d); }
    }
    assert.ok(sum / n < 0.02 && worst < 0.4, `${name}: mean ${(sum / n).toFixed(4)} worst ${worst.toFixed(3)} units`);
  }
});
