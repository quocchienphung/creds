// Run the local camera through a recorded scenario and compare the platform corners it would draw with the ones the public preview drew, frame by frame.
// Used by scripts/forensics/uiarc-terrain-sim.mjs (any recorded scenario) and by the unit tests (the committed fixtures).
import { DragGesture } from '../../../src/components/sites/skilled/terrain/terrain-pointer.ts';
import { TerrainCamera } from '../../../src/components/sites/skilled/terrain/terrain-camera.ts';
import { makeView, projectPoint, cellX, cellZ } from '../../../src/components/sites/skilled/terrain/terrain-math.ts';
import { PLATFORM_HALF_D, PLATFORM_HALF_W, flyPivotHeight } from '../../../src/components/sites/skilled/terrain/terrain-constants.ts';

const corners = [[-PLATFORM_HALF_W, -PLATFORM_HALF_D], [PLATFORM_HALF_W, -PLATFORM_HALF_D], [PLATFORM_HALF_W, PLATFORM_HALF_D], [-PLATFORM_HALF_W, PLATFORM_HALF_D]];

/** Where the previous scenario in the recording left the camera (they ran in one page), and which columns a fly goes to. */
export const STARTS = {
  'orbit-flick': { yaw: -80.4223 }, 'orbitv-up': { pitch: 71.8837, yaw: -31.984 }, 'orbitv-down-limit': { pitch: 11.1428, yaw: -32.0525 },
  'zoom-out-limit': { zoom: 2.8 }, 'kb-home-end': { yaw: -62.03, pitch: 38.86 }, 'kb-enter': { yaw: -62.03, pitch: 38.86 },
};
const FLY_ON = { 'peak-fly': { event: 'click', cell: 63 }, 'kb-enter': { event: 'keydown', cell: 95 } };

export function platformCorners(pose, size) {
  const view = makeView(pose, size), out = { x: 0, y: 0, depth: 0 };
  return corners.flatMap(([x, z]) => { projectPoint(view, x, 0, z, out); return [out.x, out.y]; });
}

/**
 * @param {{ name: string, size: {width:number,height:number}, series: {t:number, plat:number[]}[], events: any[], heights: Record<string, number[]> }} scenario
 * `heights.load` are the settled world heights of the sample metric; `heights[name]` / `heights.before` the ones of a metric change.
 */
export function simulateCamera({ name, size, series, events, heights, touch = false, tuning = {} }) {
  const cam = new TerrainCamera(size, tuning);
  cam.setHeights(heights.load); cam.snapToRest();
  const gesture = new DragGesture();
  const vertical = !touch;
  const cellOf = index => ({ x: cellX(index % 24), y: flyPivotHeight(heights.load[index]), z: cellZ(Math.floor(index / 24)) });
  const apply = event => {
    if (event.type === 'pointerdown') gesture.down(event.x, event.y, event.t);
    else if (event.type === 'pointermove') { const m = gesture.move(event.x, event.y, event.t); if (m?.began) cam.dragStart(); else if (m) cam.dragMove(m.dx, m.dy, vertical); }
    else if (event.type === 'pointerup') { const end = gesture.up(event.t); if (end?.moved) cam.dragEnd(end.vx, end.vy, vertical); }
    else if (event.type === 'wheel' && event.ctrl) cam.zoomBy(Math.exp(-event.dy * 0.01));
    else if (event.type === 'keydown') {
      if (event.key === '+') cam.zoomBy(1.25); else if (event.key === '-') cam.zoomBy(1 / 1.25);
      else if (event.shift && event.key?.startsWith('Arrow')) cam.keyOrbit(event.key === 'ArrowRight' ? -1 : event.key === 'ArrowLeft' ? 1 : 0, event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0);
    }
  };
  if (name === 'flatten-top') { cam.setMode('top'); }
  else if (name === 'flatten-perspective') { cam.setMode('top'); cam.snapToRest(); cam.setMode('perspective'); }
  else if (name === 'load' || name === 'load1920') { cam.startIntro(); cam.step(0.014); }
  else if (name.startsWith('metric-')) { cam.setHeights(heights.before); cam.snapToRest(); cam.setHeights(heights[name]); }
  if (STARTS[name]) cam.setView(STARTS[name]);
  if (name === 'peak-leave') { cam.flyTo(cellOf(63)); cam.snap(); }
  const ordered = events.slice().sort((a, b) => a.t - b.t);
  const clickTime = ordered.find(e => e.type === 'click' || e.type === 'keydown')?.t ?? 0;
  let index = 0, previous = null;
  const errors = [], rows = [];
  for (const frame of series) {
    let cursor = previous === null ? Math.min(0, clickTime) : previous;
    while (index < ordered.length && ordered[index].t <= frame.t) {
      const e = ordered[index++];
      if (e.t > cursor) { cam.step((e.t - cursor) / 1000); cursor = e.t; }
      if (FLY_ON[name] && e.type === FLY_ON[name].event) cam.flyTo(cellOf(FLY_ON[name].cell));
      if (name === 'peak-leave' && e.type === 'click') cam.flyTo(null);
      apply(e);
    }
    cam.step(Math.max(0, frame.t - cursor) / 1000);
    previous = frame.t;
    const mine = platformCorners(cam.pose, size);
    const error = Math.max(...mine.map((v, i) => Math.abs(v - frame.plat[i])));
    errors.push(error);
    rows.push({ t: frame.t, error, yaw: cam.pose.yaw, pitch: cam.pose.pitch, scale: cam.pose.scale });
  }
  const sorted = errors.slice().sort((a, b) => a - b);
  return { errors, rows, max: sorted[sorted.length - 1], mean: errors.reduce((a, b) => a + b, 0) / errors.length, p95: sorted[Math.floor(sorted.length * 0.95)] };
}
