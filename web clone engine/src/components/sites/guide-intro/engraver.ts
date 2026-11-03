import { frameStyle, frameAttribute } from "./frame-style";
import { ENGRAVE_START, ENGRAVE_END, progressBetween } from "./studio-timeline";

interface LetterRoute { path: SVGPathElement; start: number; length: number; transit: number; from: DOMPoint; first: DOMPoint; end: DOMPoint; samples: Float32Array }

/** Shares the intro clock: no CSS timers, no work continues while a comment pauses it. */
export class SignatureEngraver {
  private routes: LetterRoute[] = [];
  private length = 0;
  private transform: DOMMatrix | null = null;
  private head: SVGGElement | null;
  private sparks: SVGLineElement[];
  private last = -1;
  private smoke: SVGGElement | null;
  private activeTrace: SVGPathElement | null;
  private activeImage: SVGImageElement | null;
  private completedClip: SVGPathElement | null;
  private completedImage: SVGImageElement | null;
  private rectangles: string[] = [];
  private letterIndex = -1;

  constructor(private element: HTMLElement) {
    const paths = Array.from(element.querySelectorAll<SVGPathElement>("[data-laser-trace]"));
    let previous: DOMPoint | undefined;
    for (const path of paths) {
      const box = path.getBBox();
      this.rectangles.push(`M${box.x-2} ${box.y-2}h${box.width+4}v${box.height+4}h${-box.width-4}Z`);
      const length = path.getTotalLength(), first = path.getPointAtLength(0);
      const from = previous ?? first;
      const transit = Math.hypot(first.x - from.x, first.y - from.y) * .7;
      // Geometry reads belong to setup. Sampling every half SVG unit keeps the
      // contact within a fraction of a screen pixel without synchronous SVG work per frame.
      const steps = Math.max(1, Math.ceil(length * 2));
      const samples = new Float32Array((steps + 1) * 2);
      for (let i = 0; i <= steps; i++) {
        const point = path.getPointAtLength(i / steps * length);
        samples[i * 2] = point.x; samples[i * 2 + 1] = point.y;
      }
      this.length += transit;
      this.routes.push({ path, length, start: this.length, transit, from, first, end: path.getPointAtLength(length), samples });
      this.length += length; previous = path.getPointAtLength(length);
      frameStyle(path, "stroke-dasharray", String(length));
    }
    this.smoke = element.querySelector("[data-laser-smoke]");
    this.activeTrace = element.querySelector("[data-laser-active-trace]");
    this.activeImage = element.querySelector("[data-signature-active]");
    this.completedClip = element.querySelector("[data-laser-completed]");
    this.completedImage = element.querySelector("[data-signature-texture]");
    this.head = element.querySelector("[data-laser-head]");
    this.sparks = Array.from(element.querySelectorAll("[data-laser-spark]"));
  }

  measure(outer: DOMRect) {
    this.transform = this.element.querySelector<SVGSVGElement>("svg")?.getScreenCTM() ?? null;
    if (this.transform) { this.transform.e -= outer.left; this.transform.f -= outer.top; }
    this.last = -1;
  }

  render(time: number, reduced: boolean) {
    const progress = reduced ? 1 : progressBetween(time, ENGRAVE_START, ENGRAVE_END);
    const distance = progress * this.length;
    const route = this.routes.find(item => distance < item.start + item.length) ?? this.routes[this.routes.length - 1];
    const local = Math.max(0, Math.min(route.length, distance - route.start));
    const burning = distance >= route.start && progress > 0 && progress < 1;
    const at = local / route.length * (route.samples.length / 2 - 1);
    const a = Math.floor(at) * 2, b = Math.min(route.samples.length - 2, a + 2);
    // A glyph can jump between disconnected contours; never interpolate across that gap.
    const continuous = Math.hypot(route.samples[b] - route.samples[a], route.samples[b + 1] - route.samples[a + 1]) < 2;
    const blend = continuous ? at - Math.floor(at) : 0;
    let point = new DOMPoint(route.samples[a] + (route.samples[b] - route.samples[a]) * blend, route.samples[a + 1] + (route.samples[b + 1] - route.samples[a + 1]) * blend);
    if (distance < route.start && route.transit) {
      const travel = progressBetween(distance, route.start - route.transit, route.start);
      const blend = travel * travel * (3 - 2 * travel);
      point = new DOMPoint(route.from.x + (route.first.x - route.from.x) * blend, route.from.y + (route.first.y - route.from.y) * blend);
    }
    if (time !== this.last || reduced) {
      this.last = time;
      const arrival = reduced ? 1 : progressBetween(time, ENGRAVE_START - 500, ENGRAVE_START - 360);
      frameStyle(this.element, "opacity", String(arrival));
      frameStyle(this.element, "transform", "translateX(-50%)");
      frameAttribute(this.element, "aria-hidden", String(arrival === 0));
      frameAttribute(this.element, "data-engraving-progress", progress.toFixed(4));
      frameAttribute(this.element, "data-laser-active", String(burning));
      const index = this.routes.indexOf(route);
      if (this.letterIndex !== index) {
        this.letterIndex = index;
        if(this.activeTrace)frameAttribute(this.activeTrace,"d",route.path.getAttribute("d") ?? "M0 0");
        if(this.completedClip)frameAttribute(this.completedClip,"d",this.rectangles.slice(0,index).join(" ") || "M0 0");
      }
      if(this.completedImage)frameAttribute(this.completedImage,"clip-path",progress >= 1 ? "none" : "url(#signature-completed)");
      if(this.activeImage)frameAttribute(this.activeImage,"opacity",burning && !reduced ? "1" : "0");
      if(this.activeTrace) {
        frameStyle(this.activeTrace,"stroke-dasharray",String(route.length));
        frameStyle(this.activeTrace,"stroke-dashoffset",String(route.length-local));
      }
      for (const item of this.routes) {
        const p = progressBetween(distance, item.start, item.start + item.length);
        frameStyle(item.path, "opacity", p > 0 ? "1" : "0");
        frameStyle(item.path, "stroke-dasharray", p >= 1 ? "none" : String(item.length));
        frameStyle(item.path, "stroke-dashoffset", String((1 - p) * item.length));
      }
      if (this.head) {
        frameAttribute(this.head, "transform", `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`);
        frameAttribute(this.head, "opacity", burning && !reduced ? "1" : "0");
      }
      if (burning && !reduced) for (const [i, spark] of this.sparks.entries()) {
        const age = (time / 430 + i / this.sparks.length) % 1, angle = -Math.PI * (.12 + (i * .137) % .76);
        const speed = 14 + i % 4 * 6;
        const at = (a: number) => ({ x: Math.cos(angle) * speed * a * 1.7, y: Math.sin(angle) * speed * a + a * a * 25 });
        const a = at(Math.max(0, age - .05)), b = at(age);
        frameAttribute(spark, "x1", a.x.toFixed(2)); frameAttribute(spark, "y1", a.y.toFixed(2));
        frameAttribute(spark, "x2", b.x.toFixed(2)); frameAttribute(spark, "y2", b.y.toFixed(2));
        frameAttribute(spark, "opacity", String((1 - age) ** 1.7));
      }
      if (burning && !reduced && this.smoke) frameAttribute(this.smoke, "transform", `rotate(${Math.sin(time / 420) * 13}) scale(${.75 + Math.sin(time / 700) * .12})`);
    }
    const tool = new DOMPoint(point.x - 18, point.y - 28).matrixTransform(this.transform ?? new DOMMatrix());
    return { x: tool.x, y: tool.y, progress };
  }
}
