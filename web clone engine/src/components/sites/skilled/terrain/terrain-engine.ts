import { CELLS, HOURS, OMEGA, PANEL_ABOVE_GAP, PANEL_BOTTOM_ROOM, PANEL_EDGE, PANEL_GAP, PANEL_HEIGHT, PANEL_LIFT, PANEL_WIDTH, COMPACT_WIDTH, flyPivotHeight } from "./terrain-constants.ts";
import { TerrainCamera, type Mode } from "./terrain-camera.ts";
import { Columns, type Rise } from "./terrain-columns.ts";
import type { Tone } from "./terrain-colors.ts";
import { moveCell } from "./terrain-data.ts";
import { createScene, darkTheme, drawTerrain, lightTheme, pick, type Paint, type TerrainTheme } from "./terrain-draw.ts";
import { Spring, cellX, cellZ, clamp } from "./terrain-math.ts";
import { DragGesture } from "./terrain-pointer.ts";

export type HighlightSource = "pointer" | "keyboard" | "fly";
export interface EngineHandlers {
  /** The highlighted column changed (null: none). */
  onHighlight(index: number | null, source: HighlightSource): void;
  /** The camera flew to a column, or back to the whole week. */
  onFly(index: number | null): void;
  /** The whole-week view was asked for from the keyboard. */
  onAnnounce(message: string): void;
}
/** Columns outside a focused group recede 70 % of the way to the platform; the fade runs on the split bar's own spring (14.5 rad/s) so the two move together. */
const FOCUS_AMOUNT = 0.7, FOCUS_OMEGA = 14.5;
export interface EngineOptions { canvas: HTMLCanvasElement; plot: HTMLElement; panel: HTMLElement | null; handlers: EngineHandlers }

/**
 * Draws the activity terrain on a 2D canvas and runs everything the visitor can do to it: orbit with drag (and momentum), zoom with keys / ctrl+wheel /
 * pinch, hover a column for its details, click or press Enter to fly to it, flatten to a heatmap. The loop only runs while something moves; it pauses
 * offscreen and in a hidden tab, and with reduced motion every change simply lands.
 */
export class TerrainEngine {
  private localize = (text: string) => text;
  setLocalize(localize: (text: string) => string) { this.localize = localize; this.invalidate(); }
  private readonly canvas: HTMLCanvasElement; private readonly plot: HTMLElement; private readonly panel: HTMLElement | null; private readonly handlers: EngineHandlers;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly camera = new TerrainCamera({ width: 640, height: 292 });
  private readonly columns = new Columns();
  private readonly scene = createScene();
  private readonly gesture = new DragGesture();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private theme: TerrainTheme = lightTheme;
  private tone: Tone = "neutral";
  private values: readonly number[] = [];
  private mode: Mode = "perspective";
  private highlightIndex: number | null = null;
  private highlightSource: HighlightSource | null = null;
  private flyIndex: number | null = null;
  private peak: number | null = null;
  private hover: number | null = null;
  private pinch: number | null = null;
  private dragPointer: number | null = null;
  private touchDrag = false;
  private width = 0; private height = 0; private dpr = 1;
  private frameId = 0; private last = 0; private wake = 0;
  private onScreen = true; private disposed = false; private reduced = false;
  private pendingData: { values: readonly number[]; tone: Tone; rise: Rise } | null = null;
  private panelX = new Spring(0, OMEGA.panel); private panelY = new Spring(0, OMEGA.panel);
  private panelOn = false;
  private readonly focusMask = new Uint8Array(CELLS); private focus = new Spring(0, FOCUS_OMEGA);
  private cleanups: (() => void)[] = [];

  constructor(options: EngineOptions) {
    this.canvas = options.canvas; this.plot = options.plot; this.panel = options.panel; this.handlers = options.handlers;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available.");
    this.ctx = ctx;
    this.attach();
    this.resize();
  }

  // ---- public ---------------------------------------------------------------------------------------------------------------------------

  /** New numbers for the shown metric. `rise` is how the change travels: "intro" on first show, "metric" when the metric or the data changes. */
  setData(values: readonly number[], tone: Tone, rise: Rise) {
    if (this.width === 0) { this.pendingData = { values, tone, rise }; return; }
    this.values = values; this.tone = tone;
    const flat = this.mode === "top";
    this.columns.setValues(values, rise, flat, this.reduced);
    this.camera.setHeights(this.columns.targets);
    if (rise === "intro" && !this.reduced) this.camera.startIntro();
    else if (this.reduced) { this.camera.snapToRest(); this.camera.snap(); }
    if (this.flyIndex !== null) this.refly(this.flyIndex);
    this.invalidate();
  }
  setMode(mode: Mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === "top" && this.flyIndex !== null) { this.flyIndex = null; this.handlers.onFly(null); }
    this.camera.setMode(mode);
    this.columns.setFlat(mode === "top", this.reduced);
    if (this.reduced) this.camera.snap();
    this.invalidate();
  }
  /** Light up a group of hours (the split bar's highlighted part): every other column fades back; `null` brings them all back. */
  setFocus(cells: readonly number[] | null) {
    if (cells) { this.focusMask.fill(0); for (const cell of cells) if (cell >= 0 && cell < CELLS) this.focusMask[cell] = 1; }
    this.focus.target = cells ? 1 : 0;
    if (this.reduced) this.focus.snap();
    this.invalidate();
  }
  /** The busiest hour: where keyboard focus starts. */
  setPeak(index: number | null) { this.peak = index; }
  highlightCell(index: number | null, source: HighlightSource) { this.setHighlight(index, source); }
  flyTo(index: number | null) {
    if (index === null) { this.exitFly(); return; }
    if (this.mode === "top") return;
    this.flyIndex = index;
    this.refly(index);
    this.setHighlight(index, "fly");
    this.handlers.onFly(index);
    this.invalidate();
  }
  exitFly() {
    if (this.flyIndex === null) return;
    this.flyIndex = null; this.camera.flyTo(null); this.camera.resetZoom();
    if (this.reduced) this.camera.snap();
    this.handlers.onFly(null);
    this.invalidate();
  }
  /** Back to the whole week from wherever the visitor took the camera. */
  resetView() { this.exitFly(); }
  get flying() { return this.flyIndex !== null; }

  destroy() {
    this.disposed = true; cancelAnimationFrame(this.frameId);
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
  }

  // ---- layout, theme, motion preference ---------------------------------------------------------------------------------------------

  private attach() {
    const on = <T extends EventTarget>(target: T, type: string, handler: (event: never) => void, options?: AddEventListenerOptions) => {
      target.addEventListener(type, handler as EventListener, options);
      this.cleanups.push(() => target.removeEventListener(type, handler as EventListener, options));
    };
    on(this.plot, "pointerdown", this.onPointerDown); on(this.plot, "pointermove", this.onPointerMove); on(this.plot, "pointerup", this.onPointerUp);
    on(this.plot, "pointercancel", this.onPointerCancel); on(this.plot, "pointerleave", this.onPointerLeave);
    on(this.plot, "keydown", this.onKeyDown); on(this.plot, "focus", this.onFocus); on(this.plot, "blur", this.onBlur);
    on(this.plot, "wheel", this.onWheel, { passive: false });
    const resize = new ResizeObserver(() => this.resize()); resize.observe(this.plot); this.cleanups.push(() => resize.disconnect());
    const intersect = new IntersectionObserver(entries => { this.onScreen = entries[entries.length - 1]?.isIntersecting ?? true; if (this.onScreen) { this.last = 0; this.invalidate(); } });
    intersect.observe(this.plot); this.cleanups.push(() => intersect.disconnect());
    // the workspace sets its theme on its own page element (and a host page may on <html>): watch every ancestor
    const theme = new MutationObserver(() => { this.readTheme(); this.invalidate(); });
    for (let ancestor: Element | null = this.plot; ancestor; ancestor = ancestor.parentElement) theme.observe(ancestor, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    this.cleanups.push(() => theme.disconnect());
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motionChanged = () => { this.reduced = motion.matches; this.camera.reduced = this.reduced; if (this.reduced) { this.columns.snap(); this.camera.snap(); this.focus.snap(); } this.invalidate(); };
    motion.addEventListener("change", motionChanged); this.cleanups.push(() => motion.removeEventListener("change", motionChanged));
    this.reduced = motion.matches; this.camera.reduced = this.reduced;
    on(document, "visibilitychange", () => { if (!document.hidden) { this.last = 0; this.invalidate(); } });
    this.readTheme();
  }

  private readTheme() {
    const style = getComputedStyle(this.plot), get = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    const dark = get("--terrain-dark", "0") === "1", base = dark ? darkTheme : lightTheme;
    const ink = get("--terrain-ink", base.ink.join(" ")).split(/\s+/).map(Number);
    this.theme = { ...base, dark, platform: get("--terrain-platform", base.platform), label: get("--terrain-label", base.label), surface: get("--terrain-surface", base.surface), ink: [ink[0] ?? base.ink[0], ink[1] ?? base.ink[1], ink[2] ?? base.ink[2]] };
  }

  private resize() {
    if (this.disposed) return;
    const width = this.plot.clientWidth, height = this.plot.clientHeight;
    if (width < 2 || height < 2) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const first = this.width === 0;
    if (width === this.width && height === this.height && dpr === this.dpr) return;
    this.width = width; this.height = height; this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
    this.camera.setSize({ width, height });
    if (first) {
      const pending = this.pendingData; this.pendingData = null;
      this.camera.snapToRest();
      if (pending) this.setData(pending.values, pending.tone, pending.rise);
    } else this.camera.snap();
    this.invalidate();
  }

  // ---- the loop ---------------------------------------------------------------------------------------------------------------------------

  private invalidate() {
    if (this.frameId || this.disposed || !this.onScreen || document.hidden || this.width === 0) return;
    if (!this.last) this.wake = performance.now();    // idle until now: motion counts from this input, not from the frame that happens to follow
    this.frameId = requestAnimationFrame(this.frame);
  }
  private frame = (now: number) => {
    this.frameId = 0;
    if (this.disposed) return;
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : Math.min(0.034, Math.max(0, (now - this.wake) / 1000));
    this.last = now;
    this.camera.step(dt); this.columns.step(dt); this.focus.step(dt);
    // at rest to well under a pixel: land exactly on the targets, draw that last frame and sleep
    const done = this.settled();
    if (done) { this.camera.snap(); this.columns.snap(); this.focus.snap(); }
    this.paint(dt);
    if (done) this.last = 0; else this.invalidate();
  };
  private settled() {
    return this.camera.settled && this.columns.settled && this.panelX.rests(0.05) && this.panelY.rests(0.05) && this.focus.rests(0.004);
  }
  private paint(dt: number) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawTerrain(ctx as unknown as Paint, {
      localize: this.localize,
      pose: this.camera.pose, size: { width: this.width, height: this.height }, theme: this.theme, tone: this.tone,
      heights: this.columns.shown, shares: this.columns.shares, highlight: this.highlightIndex, flight: this.camera.progress, compact: this.width < COMPACT_WIDTH,
      dim: this.focus.value > 0.002 ? { mask: this.focusMask, amount: this.focus.value * FOCUS_AMOUNT } : null,
    }, this.scene);
    this.placePanel(dt);
  }

  /** The panel sits beside the highlighted column, flips to its other side near the right edge, and follows it with a spring while it moves. */
  private placePanel(dt: number) {
    const panel = this.panel, hl = this.scene.highlight;
    if (!panel) return;
    if (!hl || this.highlightIndex === null) { this.panelOn = false; return; }
    const height = panel.offsetHeight || PANEL_HEIGHT;
    let x = hl.x + PANEL_GAP;
    if (x + PANEL_WIDTH > this.width - PANEL_EDGE) x = hl.x - PANEL_GAP - PANEL_WIDTH;
    x = clamp(x, PANEL_EDGE, Math.max(PANEL_EDGE, this.width - PANEL_WIDTH - PANEL_EDGE));
    // beside the column, a little above its middle; a column low in the plot gets the panel above its top
    const beside = hl.y - PANEL_LIFT, y = clamp(beside + height > this.height - PANEL_BOTTOM_ROOM ? hl.top - PANEL_ABOVE_GAP - height : beside, PANEL_EDGE, Math.max(PANEL_EDGE, this.height - height - PANEL_EDGE));
    this.panelX.target = x; this.panelY.target = y;
    if (!this.panelOn || this.reduced) { this.panelX.snap(x); this.panelY.snap(y); this.panelOn = true; }
    else { this.panelX.step(dt); this.panelY.step(dt); }
    panel.style.transform = `translate3d(${this.panelX.value.toFixed(2)}px, ${this.panelY.value.toFixed(2)}px, 0)`;
  }

  // ---- highlight and fly --------------------------------------------------------------------------------------------------------------------

  private setHighlight(index: number | null, source: HighlightSource | null) {
    if (index === this.highlightIndex && source === this.highlightSource) return;
    const changed = index !== this.highlightIndex;
    this.highlightIndex = index; this.highlightSource = index === null ? null : source;
    if (changed || source) this.handlers.onHighlight(index, source ?? "pointer");
    this.invalidate();
  }
  private refly(index: number) {
    this.camera.flyTo({ x: cellX(index % HOURS), y: flyPivotHeight(this.columns.targets[index]), z: cellZ(Math.floor(index / HOURS)) });
    if (this.reduced) this.camera.snap();
  }

  // ---- pointer ------------------------------------------------------------------------------------------------------------------------------

  private local(event: PointerEvent) { const rect = this.canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  private setOver(over: boolean) { if (over) this.plot.setAttribute("data-over", ""); else this.plot.removeAttribute("data-over"); }

  private onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // controls laid over the plot (the empty-state button) keep their own clicks
    if (event.target instanceof Element && event.target.closest("button, a, input, select")) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { this.plot.setPointerCapture(event.pointerId); } catch { /* released already */ }
    if (this.pointers.size === 2) { this.gesture.cancel(); this.camera.dragEnd(0, 0); this.plot.removeAttribute("data-dragging"); this.pinch = this.pinchDistance(); return; }
    if (this.pointers.size > 2) return;
    this.dragPointer = event.pointerId; this.touchDrag = event.pointerType !== "mouse";
    this.gesture.down(event.clientX, event.clientY, event.timeStamp);
  };
  private pinchDistance() { const [a, b] = [...this.pointers.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null; }

  private onPointerMove = (event: PointerEvent) => {
    if (this.pointers.has(event.pointerId)) this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 2 && this.pinch !== null) {
      const distance = this.pinchDistance();
      if (distance && distance > 0) { this.camera.zoomBy(distance / this.pinch); this.pinch = distance; this.invalidate(); }
      return;
    }
    if (event.pointerId === this.dragPointer && this.gesture.active) {
      const move = this.gesture.move(event.clientX, event.clientY, event.timeStamp);
      if (move?.began) { this.camera.dragStart(); this.plot.setAttribute("data-dragging", ""); this.setOver(false); }
      else if (move) { this.camera.dragMove(move.dx, move.dy, !this.touchDrag); this.invalidate(); }
      if (this.gesture.moved) return;
    }
    if (event.pointerType === "touch") return;
    const point = this.local(event), index = pick(this.scene, point.x, point.y);
    this.hover = index; this.setOver(index !== null);
    if (index !== null) this.setHighlight(index, "pointer");
    else if (this.highlightSource === "pointer") this.setHighlight(this.flyIndex, this.flyIndex === null ? null : "fly");
  };

  private onPointerUp = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
    try { this.plot.releasePointerCapture(event.pointerId); } catch { /* not captured */ }
    if (this.pinch !== null) { if (this.pointers.size < 2) this.pinch = null; return; }
    if (event.pointerId !== this.dragPointer) return;
    this.dragPointer = null;
    const end = this.gesture.up(event.timeStamp);
    this.plot.removeAttribute("data-dragging");
    if (!end) return;
    if (end.moved) { this.camera.dragEnd(end.vx, end.vy, !this.touchDrag); this.invalidate(); return; }
    const point = this.local(event), index = pick(this.scene, point.x, point.y);
    if (index !== null) this.flyTo(index);
  };
  private onPointerCancel = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
    if (event.pointerId === this.dragPointer) { this.dragPointer = null; if (this.gesture.moved) this.camera.dragEnd(0, 0, !this.touchDrag); this.gesture.cancel(); this.plot.removeAttribute("data-dragging"); }
    if (this.pointers.size < 2) this.pinch = null;
    this.invalidate();
  };
  private onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    this.hover = null; this.setOver(false);
    if (this.highlightSource === "pointer" && !this.gesture.active) this.setHighlight(this.flyIndex, this.flyIndex === null ? null : "fly");
  };

  private onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return;     // plain scrolling belongs to the page; ctrl + wheel is a trackpad pinch
    event.preventDefault();
    this.camera.zoomBy(Math.exp(-clamp(event.deltaY, -100, 100) * 0.01));
    this.invalidate();
  };

  // ---- keyboard ---------------------------------------------------------------------------------------------------------------------------

  private onFocus = () => {
    if (!this.plot.matches(":focus-visible") || this.highlightIndex !== null) return;
    if (this.peak !== null) this.setHighlight(this.peak, "keyboard");
  };
  private onBlur = () => { if (this.highlightSource === "keyboard" && this.flyIndex === null) this.setHighlight(null, null); };

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key;
    if (key.startsWith("Arrow") && event.shiftKey) {
      event.preventDefault();
      this.camera.keyOrbit(key === "ArrowRight" ? -1 : key === "ArrowLeft" ? 1 : 0, key === "ArrowUp" ? 1 : key === "ArrowDown" ? -1 : 0);
      this.invalidate(); return;
    }
    if (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown" || key === "Home" || key === "End") {
      event.preventDefault();
      const from = this.highlightIndex ?? this.peak ?? 0, next = moveCell(from, key);
      this.setHighlight(next, "keyboard");
      if (this.flyIndex !== null && next !== this.flyIndex) { this.flyIndex = next; this.refly(next); this.handlers.onFly(next); }
      return;
    }
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      const target = this.highlightIndex ?? this.peak;
      if (target !== null) this.flyTo(target);
      return;
    }
    if (key === "Escape") {
      if (this.flyIndex !== null) { event.preventDefault(); this.exitFly(); this.handlers.onAnnounce("Returned to the whole week."); }
      else if (this.highlightIndex !== null) { event.preventDefault(); this.setHighlight(null, null); this.handlers.onAnnounce(""); }
      return;
    }
    if (key === "+" || key === "=") { event.preventDefault(); this.camera.zoomBy(1.25); this.invalidate(); return; }
    if (key === "-" || key === "_") { event.preventDefault(); this.camera.zoomBy(1 / 1.25); this.invalidate(); }
  };
}

