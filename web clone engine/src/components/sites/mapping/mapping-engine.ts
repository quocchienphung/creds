import { formatDue, statusLabels, type MappingModel } from "./mapping-model";
import type { MappingCommand } from "./mapping-types";
import type { MapNode } from "./mapping-model";
import { clamp, lerp, MappingPainter, type Point, type Rect } from "./mapping-painter";

interface Hooks { path: (id: number) => void; hover: (id: number) => void; zoom: (zoomed: boolean) => void; tour: (active: boolean) => void; command: (command: MappingCommand) => void; announce: (message: string) => void; interact: () => void }
interface Flight { start: number; duration: number; bump: number; at: (t: number) => [number, number, number]; end: [number, number, number]; done?: () => void }
interface Drag { id: number; start: Point; center: Point; moved: boolean; caught: boolean; samples: (Point & { time: number })[] }
interface Move { id: number; start: Point; moved: boolean; pointerId: number }
interface Pinch { distance: number; scale: number; world: Point }
const rubber = (distance: number, dimension: number) => (1 - 1 / (.55 * distance / dimension + 1)) * dimension;
function cameraPath(from: [number, number, number], to: [number, number, number]) {
  const [x0, y0, w0] = from, [x1, y1, w1] = to, dx = x1 - x0, dy = y1 - y0, distance2 = dx * dx + dy * dy, rho = 1.35, rho2 = rho * rho;
  if (distance2 < (1e-4 * Math.min(w0, w1)) ** 2) { const length = Math.log(w1 / w0) / rho; return { length: Math.abs(length), at: (t: number): [number, number, number] => [lerp(x0, x1, t), lerp(y0, y1, t), w0 * Math.exp(rho * t * length)] }; }
  const distance = Math.sqrt(distance2), b0 = (w1 * w1 - w0 * w0 + rho2 * rho2 * distance2) / (2 * w0 * rho2 * distance), b1 = (w1 * w1 - w0 * w0 - rho2 * rho2 * distance2) / (2 * w1 * rho2 * distance), r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0), length = (Math.log(Math.sqrt(b1 * b1 + 1) - b1) - r0) / rho;
  return { length: Math.abs(length), at: (t: number): [number, number, number] => { const u = w0 / (rho2 * distance) * (Math.cosh(r0) * Math.tanh(rho * t * length + r0) - Math.sinh(r0)); return [x0 + u * dx, y0 + u * dy, w0 * Math.cosh(r0) / Math.cosh(rho * t * length + r0)]; } };
}
// Cubic-bezier(.65,0,.35,1), sampled by solving its x coordinate.
function ease(t: number) { let a = 0, b = 1, u = t; for (let i = 0; i < 14; i++) { const x = 3 * (1 - u) ** 2 * u * .65 + 3 * (1 - u) * u * u * .35 + u ** 3; if (x < t) a = u; else b = u; u = (a + b) / 2; } return 3 * (1 - u) * u * u + u ** 3; }

export class MappingEngine extends MappingPainter {
  frameId = 0; last = 0; visible = false; hidden = false; sized = false;
  targetZoom = Math.log(.5); zoomVelocity = 0; lastWheel = 0; anchor: Point | null = null;
  velocity: Point = { x: 0, y: 0 }; flight: Flight | null = null; drag: Drag | null = null; pinch: Pinch | null = null;
  pointers = new Map<number, Point>(); mouse: Point | null = null; panTarget: Point | null = null;
  touring = false; tourIndex = 0; tourTimer: ReturnType<typeof setTimeout> | null = null;
  zoomed = false; introDone = false;
  manualView = false;
  moveDrag: Move | null = null;
  constructor(canvas: HTMLCanvasElement, mini: HTMLCanvasElement, public stage: HTMLDivElement, model: MappingModel, public hooks: Hooks, public readout: HTMLSpanElement, public tooltip: HTMLDivElement) {
    super(canvas, mini, model); this.onAsset = () => this.wake();
    document.fonts.ready.then(() => { if (!this.dead) this.wake(); });
  }
  get insets() { return this.width < 560 ? { top: 56, bottom: 56, side: 12 } : { top: 64, bottom: 60, side: 24 }; }
  get fitScale() { const { top, bottom, side } = this.insets; return Math.min((this.width - side * 2) / this.model.world.w, (this.height - top - bottom) / this.model.world.h); }
  fitFor(id: number) { if (!id) return this.fitScale; const node = this.model.nodes[id], { top, bottom, side } = this.insets; return Math.min((this.width - 2 * side) / node.w, (this.height - top - bottom) / node.h) * (node.kind === "task" ? .96 : .97); }
  get maxScale() { const sample = this.model.tasks[0]?.node ?? this.model.projects[0]?.node ?? this.model.teams[0]?.node ?? 0; return Math.max(this.fitScale * 1.6, 1.7 * this.fitFor(sample)); }
  range(scale: number, axis: "x" | "y"): [number, number] {
    const { top, bottom, side } = this.insets;
    if (axis === "x") { const half = (this.width / 2 - side) / scale; const { w } = this.model.world; return half * 2 >= w ? [w / 2, w / 2] : [half, w - half]; }
    const { h: world } = this.model.world, low = (this.height / 2 - top) / scale, high = world - (this.height / 2 - bottom) / scale;
    if (low > high) { const middle = world / 2 - (top - bottom) / 2 / scale; return [middle, middle]; }
    return [low, high];
  }
  centerFor(id: number, scale: number): Point { const node = this.model.nodes[id], { top, bottom } = this.insets; return { x: clamp(node.x + node.w / 2, ...this.range(scale, "x")), y: clamp(node.y + node.h / 2 - (top - bottom) / 2 / scale, ...this.range(scale, "y")) }; }
  resize(width: number, height: number, dpr: number) {
    if (width < 2 || height < 2) return;
    const oldFit = this.sized ? this.fitScale : 0;
    this.width = width; this.height = height; this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
    this.mini.width = Math.round(this.mini.clientWidth * dpr); this.mini.height = Math.round(this.mini.clientHeight * dpr);
    if (!this.sized || this.view === 0) { this.scale = this.fitScale; const center = this.centerFor(0, this.scale); this.cx = center.x; this.cy = center.y; }
    else if (oldFit) this.scale = clamp(this.scale * this.fitScale / oldFit, this.fitScale, this.maxScale);
    this.targetZoom = Math.log(this.scale); this.flight = null; this.sized = true;
    this.maybeIntro(); this.wake();
  }
  maybeIntro() { if (this.introDone || !this.visible || !this.sized) return; this.introDone = true; if (!this.reduced) { this.introStart = performance.now(); this.scale = this.fitScale * .72; this.targetZoom = Math.log(this.scale); this.flyTo(0, undefined, 1500); } }
  setVisible(visible: boolean) { this.visible = visible; if (!visible) this.stopTour(); this.maybeIntro(); this.wake(); }
  setHidden(hidden: boolean) { this.hidden = hidden; if (hidden) this.stopTour(); this.wake(); }
  setReduced(reduced: boolean) { this.reduced = reduced; if (reduced && this.flight) this.finishFlight(); this.wake(); }
  destroy() { this.dead = true; cancelAnimationFrame(this.frameId); this.stopTour(); }
  wake() { if (!this.frameId && !this.dead && this.visible && !this.hidden && this.sized) this.frameId = requestAnimationFrame(this.frame); }
  frame = (now: number) => {
    this.frameId = 0;
    const delta = this.last && now - this.last < 100 ? (now - this.last) / 1000 : 1 / 60; this.last = now;
    let moving = false;
    if (this.flight) { const flight = this.flight, t = clamp((now - flight.start) / flight.duration, 0, 1); if (t >= 1) this.finishFlight(); else { const [x, y, width] = flight.at(ease(t)); this.cx = x; this.cy = y; this.scale = this.width / (width * Math.exp(flight.bump * Math.sin(Math.PI * t))); moving = true; } }
    else if (!this.drag && !this.pinch) {
      const low = Math.log(this.fitScale), high = Math.log(this.maxScale);
      if (now - this.lastWheel > 170) this.targetZoom = clamp(this.targetZoom, low, high);
      const target = this.targetZoom > high ? high + rubber(this.targetZoom - high, .35) : this.targetZoom < low ? low - rubber(low - this.targetZoom, .35) : this.targetZoom;
      const count = Math.max(1, Math.ceil(delta * 120)), dt = delta / count;
      for (let i = 0; i < count; i++) {
        const zoom = Math.log(this.scale);
        if (Math.abs(target - zoom) > .0001 || Math.abs(this.zoomVelocity) > .001) { this.zoomVelocity += (520 * (target - zoom) - 38 * this.zoomVelocity) * dt; this.applyZoom(this.reduced ? target : zoom + this.zoomVelocity * dt); moving = true; }
        else if (this.zoomVelocity !== 0 || zoom !== target) { this.applyZoom(target); this.zoomVelocity = 0; }
        for (const axis of ["x", "y"] as const) {
          const center = axis === "x" ? this.cx : this.cy, range = this.range(this.scale, axis), offset = center < range[0] ? center - range[0] : center > range[1] ? center - range[1] : 0;
          let next = center, velocity = this.velocity[axis];
          if (this.panTarget) { const difference = this.panTarget[axis] - center; next += difference * (1 - Math.exp(-12 * dt)); if (Math.abs(difference) * this.scale > .2) moving = true; }
          else if (offset !== 0) { if (this.reduced) { next = clamp(center, ...range); velocity = 0; } else { velocity += (340 * offset * this.scale - 34 * velocity) * dt; next -= velocity * dt / this.scale; if (Math.abs(offset * this.scale) < .25 && Math.abs(velocity) < 4) { next = clamp(next, ...range); velocity = 0; } moving = true; } }
          else if (velocity !== 0) { velocity *= Math.exp(-3.6 * dt); next -= velocity * dt / this.scale; if (Math.abs(velocity) < 3) velocity = 0; moving = true; }
          if (axis === "x") this.cx = next; else this.cy = next; this.velocity[axis] = velocity;
        }
      }
      if (this.panTarget && Math.hypot(this.cx - this.panTarget.x, this.cy - this.panTarget.y) * this.scale < .3) this.panTarget = null;
    }
    if (this.manualView && !this.flight) this.inferView();
    const zoomed = this.scale > this.fitScale * 1.06;
    if (zoomed !== this.zoomed) { this.zoomed = zoomed; this.hooks.zoom(zoomed); }
    moving = this.animate(delta) || moving || now - this.introStart < 2200;
    this.draw(now); this.placeTooltip();
    const ratio = this.scale / this.fitScale; this.readout.textContent = `${ratio < 9.95 ? ratio.toFixed(1) : Math.round(ratio)}×`;
    if (moving) this.wake();
  };
  setView(id: number) { if (this.view === id) return; this.view = id; this.cursor = -1; this.cursorItem = -1; this.hooks.path(id); const stats = this.model.stats(id); this.hooks.announce(`Now viewing ${this.model.nodes[id].name}, ${Math.round(stats.progress * 100)}% complete, ${stats.open} open this.model.tasks.`); }
  inferView() {
    if (this.scale <= this.fitScale * 1.06) { this.setView(0); return; }
    const { top, bottom, side } = this.insets, point = this.toWorld({ x: this.width / 2, y: (top + this.height - bottom) / 2 });
    let selected = 0;
    for (;;) { const child = this.model.nodes[selected].children.find(id => { const node = this.model.nodes[id]; return node.kind !== "person" && point.x >= node.x && point.x <= node.x + node.w && point.y >= node.y && point.y <= node.y + node.h && (node.w * this.scale >= .55 * (this.width - 2 * side) || node.h * this.scale >= .55 * (this.height - top - bottom)); }); if (child === undefined) break; selected = child; }
    this.setView(selected);
  }
  flyTo(id: number, done?: () => void, duration?: number) {
    if (!this.sized) return;
    const scale = clamp(this.fitFor(id), this.fitScale, this.maxScale), center = this.centerFor(id, scale), end: [number, number, number] = [center.x, center.y, this.width / scale], previousWidth = this.width / this.scale, path = cameraPath([this.cx, this.cy, previousWidth], end);
    this.halt(); this.manualView = false; this.setHover(-1, -1); this.setView(this.model.nodes[id].kind === "person" ? this.model.nodes[id].parent : id);
    this.flight = { start: performance.now(), duration: duration ?? clamp(420 + 400 * path.length, 560, 1500), bump: end[2] < .95 * previousWidth && duration === undefined ? .05 + .035 * Math.min(2, Math.log(previousWidth / end[2])) : 0, at: path.at, end, done };
    if (this.reduced) this.finishFlight(); this.wake();
  }
  finishFlight() { const flight = this.flight; if (!flight) return; this.flight = null; this.cx = flight.end[0]; this.cy = flight.end[1]; this.scale = this.width / flight.end[2]; this.targetZoom = Math.log(this.scale); this.zoomVelocity = 0; flight.done?.(); this.wake(); }
  halt() { this.flight = null; this.panTarget = null; this.anchor = null; this.velocity = { x: 0, y: 0 }; this.zoomVelocity = 0; this.targetZoom = Math.log(this.scale); }
  applyZoom(zoom: number) { const old = this.scale, next = Math.exp(zoom); if (this.anchor) { this.cx += (this.anchor.x - this.width / 2) * (1 / old - 1 / next); this.cy += (this.anchor.y - this.height / 2) * (1 / old - 1 / next); } this.scale = next; }
  interact() { this.stopTour(); this.hooks.interact(); }
  zoomBy(factor: number) { this.interact(); if (this.flight) this.halt(); this.manualView = true; const { top, bottom } = this.insets; this.anchor = { x: this.width / 2, y: (top + this.height - bottom) / 2 }; this.targetZoom = clamp(this.targetZoom + Math.log(factor), Math.log(this.fitScale) - .14, Math.log(this.maxScale) + .14); this.lastWheel = performance.now(); if (this.reduced) this.applyZoom(clamp(this.targetZoom, Math.log(this.fitScale), Math.log(this.maxScale))); this.inferView(); this.wake(); }
  fitAll() { this.interact(); this.flyTo(0); }
  goTo(id: number) { this.interact(); this.flyTo(id); }
  flyOut() { this.interact(); if (this.cursor >= 0 || this.cursorItem >= 0) { this.cursor = -1; this.cursorItem = -1; this.setHover(-1, -1); this.wake(); } else if (this.view > 0) this.flyTo(this.model.nodes[this.view].parent); }
  local(event: { clientX: number; clientY: number }): Point { const rect = this.canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  wheel = (event: WheelEvent) => {
    if ((event.target as Element).closest("[data-overlay],button")) return;
    event.preventDefault(); this.interact(); if (this.flight || this.panTarget) this.halt(); this.manualView = true;
    const point = this.local(event), unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1;
    if (!event.ctrlKey && Math.abs(event.deltaX) > Math.abs(event.deltaY)) { this.cx += event.deltaX * unit / this.scale; this.inferView(); this.wake(); return; }
    this.anchor = point; this.mouse = point; this.lastWheel = performance.now();
    this.targetZoom = clamp(this.targetZoom - event.deltaY * unit * (event.ctrlKey ? .012 : .0022), Math.log(this.fitScale) - .7, Math.log(this.maxScale) + .7);
    if (this.reduced) this.applyZoom(clamp(this.targetZoom, Math.log(this.fitScale), Math.log(this.maxScale)));
    // Resolve the hierarchy after the spring has reached the wheel's requested scale.
    this.setHover(-1, -1); this.wake();
  };
  pointerDown(event: PointerEvent) {
    this.interact(); const point = this.local(event); this.pointers.set(event.pointerId, point);
    if (this.pointers.size === 2) { this.cancelMove(); this.halt(); this.manualView = true; this.drag = null; delete this.stage.dataset.dragging; const [a, b] = [...this.pointers.values()]; this.pinch = { distance: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), scale: this.scale, world: this.toWorld({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }) }; this.setHover(-1, -1); return; }
    if (this.pointers.size > 2) return;
    if (this.grab(point, event.pointerId)) return;
    const caught = !!this.flight || Math.hypot(this.velocity.x, this.velocity.y) > 90; this.halt();
    this.drag = { id: event.pointerId, start: point, center: { x: this.cx, y: this.cy }, moved: false, caught, samples: [{ ...point, time: performance.now() }] };
  }
  pointerMove(event: PointerEvent) {
    const point = this.local(event); if (event.pointerType === "mouse") this.mouse = point;
    if (this.pointers.has(event.pointerId)) this.pointers.set(event.pointerId, point);
    if (this.moveDrag && this.moveDrag.pointerId === event.pointerId && !this.pinch) { this.dragMove(point); return; }
    if (this.pinch && this.pointers.size >= 2) { const [a, b] = [...this.pointers.values()], middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; this.scale = clamp(this.pinch.scale * Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.distance, this.fitScale * .85, this.maxScale * 1.15); this.cx = this.pinch.world.x - (middle.x - this.width / 2) / this.scale; this.cy = this.pinch.world.y - (middle.y - this.height / 2) / this.scale; this.inferView(); this.wake(); return; }
    const drag = this.drag;
    if (drag && drag.id === event.pointerId) {
      if (!drag.moved && Math.hypot(point.x - drag.start.x, point.y - drag.start.y) < 5) return;
      drag.moved = true; this.manualView = true; this.stage.dataset.dragging = "true"; this.setHover(-1, -1);
      for (const axis of ["x", "y"] as const) { const target = drag.center[axis] - (point[axis] - drag.start[axis]) / this.scale, range = this.range(this.scale, axis), dimension = axis === "x" ? this.width : this.height; const value = target < range[0] ? range[0] - rubber((range[0] - target) * this.scale, dimension) / this.scale : target > range[1] ? range[1] + rubber((target - range[1]) * this.scale, dimension) / this.scale : target; if (axis === "x") this.cx = value; else this.cy = value; }
      const time = performance.now(); drag.samples.push({ ...point, time }); while (drag.samples.length > 2 && time - drag.samples[0].time > 90) drag.samples.shift(); this.inferView(); this.wake();
    } else if (event.pointerType === "mouse" && !this.flight) this.pointerHover(point);
  }
  pointerUp(event: PointerEvent, cancelled = false) {
    this.pointers.delete(event.pointerId);
    if (this.moveDrag?.pointerId === event.pointerId) { this.dropMove(event, cancelled); return; }
    if (this.pinch) { if (this.pointers.size < 2) { this.pinch = null; this.targetZoom = clamp(Math.log(this.scale), Math.log(this.fitScale), Math.log(this.maxScale)); this.drag = null; } this.wake(); return; }
    const drag = this.drag; this.drag = null; delete this.stage.dataset.dragging;
    if (drag?.id === event.pointerId) {
      if (drag.moved && !this.reduced) { const first = drag.samples[0], last = drag.samples[drag.samples.length - 1]; if (last.time > first.time && performance.now() - last.time < 70) this.velocity = { x: clamp((last.x - first.x) * 1000 / (last.time - first.time), -5000, 5000), y: clamp((last.y - first.y) * 1000 / (last.time - first.time), -5000, 5000) }; }
      else if (!drag.caught && !cancelled) this.click(this.local(event));
    }
    this.wake();
  }
  setEditing(editing: boolean) { this.editing = editing; this.cancelMove(); this.wake(); }
  cancelMove() { this.moveDrag = null; this.ghost = null; this.drop = null; delete this.stage.dataset.dragging; }
  /** Start rearranging when editing and the pointer lands on a team (from the studio) or a project (from inside a team). */
  grab(point: Point, pointerId: number) {
    if (!this.editing || this.flight) return false;
    const hit = this.pick(point), allowed = this.draggable();
    if (hit.item >= 0 || hit.node < 0) return false;
    const id = this.model.nodePath(hit.node).find(candidate => allowed.includes(candidate));
    if (id === undefined) return false;
    this.moveDrag = { id, start: point, moved: false, pointerId };
    return true;
  }
  dragMove(point: Point) {
    const drag = this.moveDrag!;
    if (!drag.moved && Math.hypot(point.x - drag.start.x, point.y - drag.start.y) < 5) return;
    drag.moved = true; this.stage.dataset.dragging = "true"; this.setHover(-1, -1);
    const node = this.model.nodes[drag.id], rect = this.screenRect(node);
    this.ghost = { rect: { ...rect, x: rect.x + point.x - drag.start.x, y: rect.y + point.y - drag.start.y }, label: node.name };
    this.drop = this.dropTarget(drag.id, this.toWorld(point))?.marker ?? null;
    this.wake();
  }
  dropMove(event: PointerEvent, cancelled: boolean) {
    const drag = this.moveDrag!, point = this.local(event);
    const target = drag.moved && !cancelled ? this.dropTarget(drag.id, this.toWorld(point)) : null;
    this.cancelMove();
    if (target) this.hooks.command(target.command);
    else if (!drag.moved && !cancelled) this.click(point);
    this.wake();
  }
  /** Where the dragged team or project would land, as a command plus the card to highlight. Null when nothing changes. */
  dropTarget(id: number, world: Point): { command: MappingCommand; marker: { rect: Rect; label: string } } | null {
    const nodes = this.model.nodes, node = nodes[id];
    const inside = (other: MapNode) => world.x >= other.x && world.x <= other.x + other.w && world.y >= other.y && world.y <= other.y + other.h;
    const nearest = (ids: number[]) => ids.reduce((best, candidate) => { const a = nodes[candidate], b = nodes[best]; return Math.hypot(world.x - a.x - a.w / 2, world.y - a.y - a.h / 2) < Math.hypot(world.x - b.x - b.w / 2, world.y - b.y - b.h / 2) ? candidate : best; });
    const placement = (target: MapNode) => world.y > target.y + target.h || (world.y >= target.y && world.x > target.x + target.w / 2);
    if (node.kind === "team") {
      const all = nodes[0].children.filter(child => nodes[child].kind === "team"), others = all.filter(child => child !== id);
      if (!others.length) return null;
      const target = nodes[nearest(others)], after = placement(target), toIndex = others.indexOf(target.id) + (after ? 1 : 0);
      if (toIndex === all.indexOf(id)) return null;
      return { command: { type: "team.move", id: this.model.teams[node.ref].id, toIndex }, marker: { rect: target, label: `${after ? "After" : "Before"} ${target.name}` } };
    }
    if (node.kind !== "project") return null;
    const team = nodes[0].children.map(child => nodes[child]).find(inside) ?? nodes[node.parent];
    const others = team.children.filter(child => child !== id && nodes[child].kind === "project");
    const project = this.model.projects[node.ref], teamId = this.model.teams[team.ref].id;
    if (!others.length) return { command: { type: "project.move", id: project.id, toTeamId: teamId, toIndex: 0 }, marker: { rect: team, label: `Into ${team.name}` } };
    const target = nodes[nearest(others)], after = placement(target), toIndex = others.indexOf(target.id) + (after ? 1 : 0);
    if (team.id === node.parent && toIndex === team.children.filter(child => nodes[child].kind === "project").indexOf(id)) return null;
    return { command: { type: "project.move", id: project.id, toTeamId: teamId, toIndex }, marker: { rect: target, label: `${after ? "After" : "Before"} ${target.name}` } };
  }
  /** Adopt a rebuilt model after an edit. Keep the viewed card if it still exists, otherwise its nearest surviving ancestor. */
  setModel(model: MappingModel) {
    const old = this.model, keys = old.keyPath(this.view), before = old.nodes[this.view];
    super.setModel(model);
    let view = 0;
    for (const key of keys) { const found = model.byKey.get(key); if (found === undefined) break; view = found; }
    const node = model.nodes[view], moved = view !== this.view || before.key !== node.key || before.x !== node.x || before.y !== node.y || before.w !== node.w || before.h !== node.h;
    this.cancelMove(); this.cursor = -1; this.cursorItem = -1; this.hover = -1; this.hoverItem = -1; this.hooks.hover(-1);
    const changedView = this.view !== view; this.view = view; if (changedView) this.hooks.path(view);
    if (this.sized && moved) this.flyTo(view, undefined, 560);
    this.wake();
  }
  focusKey(key: string) { const id = this.model.byKey.get(key); if (id !== undefined) this.flyTo(id); }
  pointerLeave() { this.mouse = null; if (!this.drag && this.cursor < 0) this.setHover(-1, -1); }
  pointerHover(point: Point) { const hit = this.pick(point); this.cursor = -1; this.cursorItem = -1; this.setHover(hit.node === this.view && hit.item < 0 ? -1 : hit.node, hit.item); this.stage.dataset.clickable = String(hit.item >= 0 || hit.node >= 0 && hit.node !== this.view || hit.node < 0 && this.view > 0); }
  setHover(id: number, item: number) { if (id === this.hover && item === this.hoverItem) return; this.hover = id; this.hoverItem = item; this.hooks.hover(item < 0 ? id : -1); this.wake(); }
  click(point: Point) { const hit = this.pick(point); if (hit.item >= 0) this.toggle(this.model.nodes[hit.node].ref, hit.item); else if (hit.node >= 0) this.activate(hit.node); else if (this.view > 0) this.flyTo(this.model.nodes[this.view].parent); }
  activate(id: number) { const node = this.model.nodes[id]; if (node.kind === "person") { const order = ["progress", "review", "blocked", "todo", "done"], owned = this.model.projects[this.model.nodes[node.parent].ref].tasks.filter(task => this.model.tasks[task].assignee === node.ref).sort((a, b) => order.indexOf(this.model.status(a)) - order.indexOf(this.model.status(b))); this.flyTo(owned.length ? this.model.tasks[owned[0]].node : node.parent); } else if (id !== this.view) this.flyTo(id); }
  toggle(id: number, index: number) { const task = this.model.tasks[id], item = task.checklist[index]; if (!item) return; this.hooks.command({ type: "item.toggle", taskId: task.id, id: item.id }); this.hooks.announce(`${item.label} ${item.done ? "unchecked" : "checked"}. ${task.title}.`); this.wake(); }
  moveCursor(dx: number, dy: number) {
    this.interact(); const node = this.model.nodes[this.view];
    if (node.kind === "task") { this.cursorItem = this.cursorItem < 0 ? 0 : clamp(this.cursorItem + (dy || dx), 0, Math.max(0, this.model.tasks[node.ref].checklist.length - 1)); this.cursor = -1; this.setHover(node.id, this.cursorItem); const entry = this.model.tasks[node.ref].checklist[this.cursorItem]; if (entry) this.hooks.announce(`${entry.label}, ${entry.done ? "checked" : "not checked"}. Press Enter to toggle.`); return; }
    const children = node.children; if (!children.length) return;
    let selected = children[0];
    if (children.includes(this.cursor)) { const current = this.model.nodes[this.cursor]; let best = Infinity; selected = this.cursor; children.forEach(id => { if (id === this.cursor) return; const other = this.model.nodes[id], x = other.x + other.w / 2 - current.x - current.w / 2, y = other.y + other.h / 2 - current.y - current.h / 2, ahead = x * dx + y * dy, score = ahead + 2.5 * (Math.abs(x * dy) + Math.abs(y * dx)); if (ahead > 1 && score < best) { best = score; selected = id; } }); }
    this.cursor = selected; this.setHover(selected, -1); this.hooks.announce(`${this.model.nodes[selected].name}. Press Enter to zoom in.`);
  }
  activateCursor() { this.interact(); const node = this.model.nodes[this.view]; if (node.kind === "task" && this.cursorItem >= 0) this.toggle(node.ref, this.cursorItem); else if (this.cursor >= 0) { const id = this.cursor; this.cursor = -1; this.activate(id); } else this.moveCursor(1, 0); }
  miniPointer(event: PointerEvent) { this.interact(); this.halt(); this.manualView = true; const rect = this.mini.getBoundingClientRect(), { scale, ox, oy } = this.miniFrame(), { top, bottom } = this.insets; const target = { x: clamp((event.clientX - rect.left - ox) / scale, ...this.range(this.scale, "x")), y: clamp((event.clientY - rect.top - oy) / scale - (top - bottom) / 2 / this.scale, ...this.range(this.scale, "y")) }; if (this.reduced) { this.cx = target.x; this.cy = target.y; } else this.panTarget = target; this.inferView(); this.wake(); }
  placeTooltip() { if (this.hover < 0 || this.hoverItem >= 0) return; const card = this.tooltip, rect = this.screenRect(this.model.nodes[this.hover]), point = this.mouse && this.cursor < 0 ? this.mouse : { x: rect.x + rect.w, y: rect.y }, w = card.offsetWidth, h = card.offsetHeight; const x = point.x + 18 + w <= this.width - 8 ? point.x + 18 : point.x - 18 - w, y = point.y + 18 + h <= this.height - 8 ? point.y + 18 : point.y - 18 - h; card.style.transform = `translate3d(${clamp(x, 8, Math.max(8, this.width - w - 8))}px,${clamp(y, 60, Math.max(60, this.height - h - 8))}px,0)`; }
  toggleTour() { if (this.touring) this.stopTour(); else if (this.model.teams.length) { this.touring = true; this.tourIndex = 0; this.hooks.tour(true); this.hooks.interact(); this.nextStop(); } }
  tourStops() {
    const { teams, projects, tasks } = this.model, first = teams[0], second = teams[1], project = first && projects[first.projects[0]], other = second && projects[second.projects[0]];
    const stops = [first?.node, project?.node, project && tasks[project.tasks[0]]?.node, project && tasks[project.tasks[Math.min(6, project.tasks.length - 1)]]?.node, second?.node, other?.node, 0];
    return stops.filter((id, index): id is number => id !== undefined && id !== stops[index - 1]);
  }
  nextStop() { const stops = this.tourStops(); if (!this.touring) return; if (this.tourIndex >= stops.length) { this.stopTour(); return; } this.flyTo(stops[this.tourIndex++], () => { if (this.touring) this.tourTimer = setTimeout(() => this.nextStop(), this.tourIndex >= stops.length ? 0 : this.reduced ? 2400 : 1500); }); }
  stopTour() { if (this.tourTimer) clearTimeout(this.tourTimer); this.tourTimer = null; if (this.touring) { this.touring = false; this.hooks.tour(false); } }
  taskSummary(id: number) { const task = this.model.tasks[id]; return `${task.title}, ${statusLabels[this.model.status(id)]}, assigned to ${this.model.person(task.assignee).name}, due ${formatDue(task.due)}.`; }
}
