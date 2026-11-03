import { test } from "node:test";
import assert from "node:assert/strict";
import { clampParts, daysInMonth, impressionTilt, isStamp, isStampDate, kindInfo, newStamp, parseDate, sameStamp, shortDate, stampDateText, toDate, weekdayLabel } from "./invoice-stamp-model.ts";
import { BEAT, CLIP_A, CLIP_B, MARK, ease, poseA, poseAt, poseB, track } from "./stamp-timeline.ts";
import { PICK_SCALE } from "./stamp-geometry.ts";

test("the wheels only ever hold a date that exists", () => {
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(daysInMonth(2026, 9), 30);
  assert.deepEqual(clampParts({ y: 2026, m: 2, d: 31 }), { y: 2026, m: 2, d: 28 }, "moving the month pulls the day back");
  assert.deepEqual(clampParts({ y: 1980, m: 14, d: 0 }), { y: 2000, m: 12, d: 1 });
  assert.equal(toDate({ y: 2026, m: 9, d: 5 }), "2026-09-05");
  assert.deepEqual(parseDate("2026-09-15"), { y: 2026, m: 9, d: 15 });
  assert.equal(isStampDate("2026-02-30"), false);
  assert.equal(isStampDate("2026-9-15"), false);
  assert.equal(isStampDate("1999-01-01"), false);
  assert.equal(isStampDate("2026-09-15"), true);
});

test("a date reads the way the picker and the stamp print it", () => {
  assert.equal(weekdayLabel("2026-09-15"), "Tuesday, 15 September 2026");
  assert.equal(weekdayLabel("2026-09-13"), "Sunday, 13 September 2026");
  assert.equal(shortDate("2026-09-15"), "15 Sep 2026");
  assert.equal(stampDateText("2026-09-05"), "5 SEP 2026");
  assert.equal(stampDateText("nonsense"), "");
});

test("a stamp is checked before it is trusted, and each kind has its own words and ink", () => {
  assert.equal(isStamp({ kind: "paid", date: "2026-09-15", ink: "red" }), true);
  assert.equal(isStamp({ kind: "paid", date: "2026-09-31", ink: "red" }), false);
  assert.equal(isStamp({ kind: "void", date: "2026-09-15", ink: "red" }), false);
  assert.equal(isStamp({ kind: "paid", date: "2026-09-15", ink: "pink" }), false);
  assert.equal(isStamp(null), false);
  assert.equal(isStamp([]), false);
  assert.equal(kindInfo("received").action, "Mark as received");
  assert.equal(newStamp("approved", "2026-01-02").ink, "green");
  assert.equal(sameStamp(newStamp("paid", "2026-01-02"), newStamp("paid", "2026-01-02")), true);
  assert.equal(sameStamp(newStamp("paid", "2026-01-02"), null), false);
  assert.equal(sameStamp(null, undefined), true);
});

test("an impression is never set down perfectly square, and the same stamp always lands the same way", () => {
  const stamp = newStamp("paid", "2026-09-15");
  assert.equal(impressionTilt(stamp), impressionTilt({ ...stamp }));
  for (const day of ["2026-01-01", "2026-03-17", "2027-12-31"]) { const tilt = impressionTilt(newStamp("paid", day)); assert.ok(tilt >= -2.6 && tilt <= 1.4, String(tilt)); }
  assert.notEqual(impressionTilt(newStamp("paid", "2026-09-15")), impressionTilt(newStamp("paid", "2026-09-16")));
});

test("easing starts at 0, ends at 1 and a move that arrives is monotonic", () => {
  for (const name of ["linear", "out", "in", "inout", "snap", "slam"]) {
    assert.equal(ease(name, 0), 0); assert.ok(Math.abs(ease(name, 1) - 1) < 1e-9);
    let last = 0; for (let i = 1; i <= 50; i += 1) { const v = ease(name, i / 50); assert.ok(v >= last - 1e-9, `${name} at ${i}`); last = v; }
  }
  assert.ok(ease("snap", 0.2) > 0.6, "a decisive move is mostly done early");
  assert.ok(ease("slam", 0.5) < 0.25, "a drop is slow to start");
  const value = track([[0, 10], [1, 20, "linear"], [2, 40, "linear"]]);
  assert.deepEqual([value(-1), value(0.5), value(1), value(1.5), value(9)], [10, 15, 20, 30, 40]);
});

test("pressing the button: the picker's controls leave, the card is where it was, nothing is stamped yet", () => {
  const start = poseA(0);
  assert.equal(start.chrome, 1); assert.equal(start.ink.opacity, 0); assert.equal(start.paper.opacity, 0); assert.equal(start.table, 0);
  assert.equal(start.stamp.rx, 0, "seen from straight above: only the top face, which is the picker");
  assert.ok([start.stamp.lx, start.stamp.ly, start.stamp.lz].every(value => value === 0), "the die is on its own plane");
  assert.ok(Math.abs(start.stamp.cs - PICK_SCALE) < 1e-9);
  assert.ok(poseA(0.05).chrome < 0.6 && poseA(0.12).chrome < 0.01, "the controls are gone within about a tenth of a second");
  assert.deepEqual(poseAt("pick", 5), poseA(0), "the picker does not move while it is shown");
});

test("the card becomes a stamp: the paper comes up out of the blur and the camera tilts down onto it, and the stamp follows the same tilt", () => {
  assert.ok(poseA(0.13).paper.blur > poseA(0.34).paper.blur && poseA(0.5).paper.blur === 0, "the paper sharpens, and was only ever softened at the very start");
  assert.ok(poseA(0.13).paper.blur <= 8, "no heavy blur");
  assert.ok(poseA(0.2).paper.s > poseA(0.7).paper.s && poseA(1.2).paper.s < 0.62, "the camera pulls back");
  assert.ok(Math.abs(poseA(1.2).paper.rx - 44) < 0.7 && poseA(0.1).paper.rx === 0, "and tilts to about 44 degrees");
  for (const time of [0.3, 0.7, 1.0, 1.2]) assert.equal(poseA(time).stamp.rx, poseA(time).paper.rx, "the stamp's top face lies parallel to the paper");
  assert.ok(poseA(0.6).table > 0.9, "the grey table is under the paper by now");
  const tied = poseA(1.2);
  assert.ok(Math.abs(tied.stamp.cs - tied.paper.s) < 1e-9 && tied.stamp.cx === tied.paper.x && tied.stamp.cy === tied.paper.y, "from the tilt on the stamp is in the paper's own camera");
});

test("the drop is decisive: down onto the paper in a few hundredths of a second, held, then straight back up", () => {
  const before = poseA(1.2), landed = poseA(BEAT.contact + 0.03), held = poseA(1.36), after = poseA(1.46);
  assert.ok(before.stamp.lz > 140, "hovering above");
  assert.ok(landed.stamp.lz < 12, `the die is on the paper (${landed.stamp.lz})`);
  assert.ok(Math.abs(held.stamp.lz) < 0.5, "and rests on it");
  assert.ok(held.stamp.press > 0.9 && before.stamp.press === 0, "the handle sinks into the neck when it is pushed");
  assert.ok(Math.abs(held.stamp.lx - (MARK.x - 280)) < 1 && Math.abs(held.stamp.ly - (MARK.y - 395)) < 1, "exactly where the impression will be");
  assert.ok(after.stamp.lz > 60, "a tenth of a second later it is on its way up");
  const hover = poseA(CLIP_A);
  assert.ok(Math.abs(hover.stamp.lz - 150) < 1, "it rests high over the paper");
});

test("ink appears only when the stamp touches, wet and soft at first, then dry and sharp", () => {
  assert.equal(poseA(BEAT.contact).ink.opacity, 0);
  assert.equal(poseA(1.38).ink.opacity, 0, "not before it lands");
  assert.equal(poseA(BEAT.inked + 0.01).ink.opacity, 1);
  const wet = poseA(1.45).ink, drying = poseA(1.7).ink, dry = poseA(CLIP_A).ink;
  assert.ok(wet.halo > 0.5 && wet.blur > 1.5 && wet.blur <= 3, "a little wet ink, not a cloud");
  assert.ok(drying.halo < wet.halo && drying.blur < wet.blur);
  assert.ok(dry.halo === 0 && dry.blur === 0, "crisp once dry");
});

test("the toast comes up only once the stamp has settled", () => {
  assert.equal(poseA(BEAT.settled).toast, 0);
  assert.equal(poseA(BEAT.toast).toast, 0);
  assert.equal(poseA(2.07).toast, 1);
  assert.equal(poseB(0).toast, 1);
  assert.ok(poseB(0.27).toast === 0, "and goes before the stamp leaves");
});

test("after Done the stamp leaves upward, the paper lies flat and settles, and the buttons come up last", () => {
  assert.ok(poseB(0.45).stamp.lz > 300 && poseB(CLIP_B).stamp.visible === false, "the stamp rises out of the frame");
  const end = poseB(CLIP_B);
  assert.equal(end.paper.rx, 0);
  assert.ok(Math.abs(end.paper.s - 0.5) < 1e-6);
  assert.equal(end.table, 0);
  assert.equal(end.final, 1);
  assert.equal(end.ink.opacity, 1, "the impression stays");
  assert.ok(poseB(0.5).final === 0 && poseB(1.0).final === 0, "the buttons are not up while the paper is still moving");
});

test("the two clips join without a jump", () => {
  const a = poseA(CLIP_A), b = poseB(0);
  for (const key of ["x", "y", "s", "rx", "opacity", "blur"]) assert.ok(Math.abs(a.paper[key] - b.paper[key]) < 1e-6, `paper ${key}`);
  for (const key of ["cx", "cy", "cs", "rx", "lx", "ly", "lz"]) assert.ok(Math.abs(a.stamp[key] - b.stamp[key]) < 1e-6, `stamp ${key}`);
  assert.equal(a.table, b.table);
});

test("outside the slam and the lift, nothing jumps between two frames at 60 fps", () => {
  const limits = { paperS: 0.12, paperX: 40, paperY: 40, paperRx: 8, stampCam: 20, stampScale: 0.05, stampLocal: 30 };
  let last = poseA(0);
  for (let t = 1 / 60; t <= CLIP_A + 1e-9; t += 1 / 60) {
    const now = poseA(t), slam = t > BEAT.contact - 0.1 && t < BEAT.contact + 0.12 || t > BEAT.lift - 0.02 && t < 1.7;
    assert.ok(Math.abs(now.paper.s - last.paper.s) < limits.paperS * (t < 0.3 ? 5 : 1), `paper scale at ${t.toFixed(3)}`);
    assert.ok(Math.abs(now.paper.rx - last.paper.rx) < limits.paperRx, `tilt at ${t.toFixed(3)}`);
    assert.ok(Math.abs(now.paper.x - last.paper.x) < limits.paperX && Math.abs(now.paper.y - last.paper.y) < limits.paperY, `paper move at ${t.toFixed(3)}`);
    if (!slam) { assert.ok(Math.abs(now.stamp.cx - last.stamp.cx) < limits.stampCam && Math.abs(now.stamp.cy - last.stamp.cy) < limits.stampCam, `stamp camera at ${t.toFixed(3)}`); assert.ok(Math.abs(now.stamp.cs - last.stamp.cs) < limits.stampScale, `stamp size at ${t.toFixed(3)}`); assert.ok(Math.abs(now.stamp.lx - last.stamp.lx) < limits.stampLocal && Math.abs(now.stamp.ly - last.stamp.ly) < limits.stampLocal && Math.abs(now.stamp.lz - last.stamp.lz) < limits.stampLocal, `stamp place at ${t.toFixed(3)}`); }
    last = now;
  }
  last = poseB(0);
  for (let t = 1 / 60; t <= CLIP_B + 1e-9; t += 1 / 60) { const now = poseB(t); assert.ok(Math.abs(now.paper.s - last.paper.s) < 0.03 && Math.abs(now.paper.rx - last.paper.rx) < 8, `exit at ${t.toFixed(3)}`); last = now; }
});
