/** One continuous, distance-sampled brush pass. Cursor tips and paint share a path. */
import { PAINT_END } from "./studio-timeline";

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const range = (t: number, start: number, end: number) => clamp((t - start) / (end - start));
export interface PaintPoint { x: number; y: number }
export interface PainterFrame { points: PaintPoint[] }

function layer() {
  const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
  if (!context) throw new Error("The painting canvas could not be opened.");
  return { canvas, context };
}

// Short acceleration/deceleration ramps, with a steady speed through the painting.
function travel(p: number) {
  const ramp = .08;
  if (p < ramp) return p * p / (2 * ramp * (1 - ramp));
  if (p > 1 - ramp) return 1 - (1 - p) ** 2 / (2 * ramp * (1 - ramp));
  return (p - ramp / 2) / (1 - ramp);
}

export class StudioPainter {
  private context: CanvasRenderingContext2D;
  private imageLayer = layer();
  private mask = layer();
  private composite = layer();
  private paths: PaintPoint[][] = [];
  private width = 1;
  private height = 1;
  private last = -1;
  private maskProgress = 0;
  private ribbonA = new Float32Array(70);
  private ribbonB = new Float32Array(70);
  private sampleA = { x: 0, y: 0 };
  private sampleB = { x: 0, y: 0 };
  private glow = layer();
  private lastFrame: PainterFrame = { points: [] };

  constructor(private canvas: HTMLCanvasElement, private image: HTMLImageElement) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The painting canvas could not be opened.");
    this.context = context;
    // Rasterize this identical glow once, instead of creating four gradients every frame.
    this.glow.canvas.width = this.glow.canvas.height = 128;
    const glow = this.glow.context.createRadialGradient(64, 64, 0, 64, 64, 64);
    glow.addColorStop(0, "#fffef4e0"); glow.addColorStop(.15, "#ffe6a77a"); glow.addColorStop(1, "#ffe8ae00");
    this.glow.context.fillStyle = glow; this.glow.context.fillRect(0, 0, 128, 128);
  }

  resize(width: number, height: number) {
    const scale = Math.min(window.devicePixelRatio || 1, 1.5, 1920 / width, 1440 / height);
    const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
    if (w === this.width && h === this.height) return;
    this.width = w; this.height = h; this.canvas.width = w; this.canvas.height = h;
    for (const buffer of [this.imageLayer, this.mask, this.composite]) {
      buffer.canvas.width = w; buffer.canvas.height = h;
    }
    const fit = Math.min(w / this.image.width, h / this.image.height);
    this.imageLayer.context.drawImage(this.image, (w - this.image.width * fit) / 2, (h - this.image.height * fit) / 2, this.image.width * fit, this.image.height * fit);
    this.paths = Array.from({ length: 4 }, (_, index) => this.makePath(index));
    this.context.fillStyle="#fff";this.context.fillRect(0,0,w,h);
    this.last = -1; this.maskProgress = 0;
  }

  /** Resample by physical distance, removing the old sinusoid's speed spikes. */
  private makePath(index: number) {
    const points: PaintPoint[] = [], distances = [0];
    const col = index % 2, row = Math.floor(index / 2), direction = col ? -1 : 1;
    for (let n = 0; n <= 1800; n++) {
      const p = n / 1800;
      const baseX = (col + .5 - Math.cos(p * Math.PI * 10) * .43 * direction) / 2;
      const envelope = Math.sin(p * Math.PI) ** .65;
      const angle = p * Math.PI * 26 + index * 1.7;
      const orbit = Math.min(.052, Math.min(baseX, 1 - baseX) * .7) * envelope;
      // Nested orbits curl around the broad sweep, without clamping against a hard edge.
      const point = {
        x: baseX + Math.cos(angle) * orbit,
        y: (row + .02 + p * .96) / 2 + Math.sin(angle) * .055 * envelope + Math.sin(p * Math.PI * 6 + index) * .009 * envelope,
      };
      if (n) distances.push(distances[n - 1] + Math.hypot((point.x - points[n - 1].x) * this.width, (point.y - points[n - 1].y) * this.height));
      points.push(point);
    }
    const total = distances.at(-1) ?? 1, uniform: PaintPoint[] = [];
    let at = 1;
    for (let n = 0; n <= 1600; n++) {
      const target = n / 1600 * total;
      while (at < distances.length - 1 && distances[at] < target) at++;
      const fraction = (target - distances[at - 1]) / (distances[at] - distances[at - 1] || 1);
      uniform.push({ x: points[at - 1].x + (points[at].x - points[at - 1].x) * fraction, y: points[at - 1].y + (points[at].y - points[at - 1].y) * fraction });
    }
    return uniform;
  }

  private pointInto(index: number, progress: number, out: PaintPoint) {
    const p = clamp((progress - index * .025) / (1 - index * .025));
    const path = this.paths[index], at = p * (path.length - 1), a = Math.floor(at), b = Math.min(path.length - 1, a + 1);
    out.x = path[a].x + (path[b].x - path[a].x) * (at - a); out.y = path[a].y + (path[b].y - path[a].y) * (at - a);
    return out;
  }

  private point(index: number, progress: number) { return this.pointInto(index, progress, {x:0,y:0}); }

  private brushWidth() { return this.height * .105; }

  private paintMask(progress: number) {
    const ctx = this.mask.context;
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#fff";
    ctx.lineWidth = this.brushWidth(); ctx.shadowColor = "#fff"; ctx.shadowBlur = ctx.lineWidth * .16;
    const steps = Math.max(1, Math.ceil((progress - this.maskProgress) * 1800));

    for (let i = 0; i < 4; i++) {
      const start = this.point(i, this.maskProgress);
      ctx.beginPath(); ctx.moveTo(start.x*this.width,start.y*this.height);
      for (let n = 1; n <= steps; n++) {
        const p = this.point(i, this.maskProgress + (progress - this.maskProgress) * n / steps);
        ctx.lineTo(p.x*this.width,p.y*this.height);
      }
      ctx.stroke();

    }
    this.maskProgress = progress;
  }

  render(time: number): PainterFrame {
    if (time === this.last) return this.lastFrame;
    const progress = travel(range(time, 350, PAINT_END));
    if (time < this.last) { this.mask.context.clearRect(0,0,this.width,this.height); this.maskProgress=0; }
    this.last=time;
    if(progress>this.maskProgress)this.paintMask(progress);
    const ctx=this.context;
    ctx.fillStyle="#fff";ctx.fillRect(0,0,this.width,this.height);
    const composite=this.composite.context;
    composite.globalCompositeOperation="source-over";composite.clearRect(0,0,this.width,this.height);
    composite.drawImage(this.imageLayer.canvas,0,0);
    composite.globalCompositeOperation="destination-in";composite.drawImage(this.mask.canvas,0,0);
    ctx.drawImage(this.composite.canvas,0,0);
    if(time>PAINT_END-500){ctx.globalAlpha=range(time,PAINT_END-500,PAINT_END);ctx.drawImage(this.imageLayer.canvas,0,0);ctx.globalAlpha=1;}
    const points = Array.from({ length: 4 }, (_, i) => this.point(i, progress));
    if (time > 350 && time < PAINT_END) this.magic(points, time, progress);
    this.lastFrame = { points }; return this.lastFrame;
  }

  private magic(points: PaintPoint[], time: number, progress: number) {
    const ctx = this.context;
    ctx.save(); ctx.globalCompositeOperation = "screen";
    const fade = Math.min(range(time, 350, 530), 1 - range(time, PAINT_END - 600, PAINT_END));
    const colors = ["#8fcaff", "#c2a0ff", "#8be3d2", "#f3b2dc"];
    for (const [index, point] of points.entries()) {
      // Reuse the two geometric strands for all three passes; no hundreds of point allocations.
      for (let n = 0; n <= 34; n++) {
        const a = this.pointInto(index, Math.max(0, progress - (34 - n) * .0014), this.sampleA);
        const b = this.pointInto(index, Math.max(0, progress - (33 - n) * .0014), this.sampleB);
        const dx = (b.x - a.x) * this.width, dy = (b.y - a.y) * this.height, length = Math.hypot(dx, dy) || 1;
        const weave = Math.sin(n * .55 - time / 260) * Math.sin(n / 34 * Math.PI) * 3.8;
        const ox = dy / length * weave, oy = dx / length * weave;
        this.ribbonA[n*2] = a.x*this.width-ox; this.ribbonA[n*2+1] = a.y*this.height+oy;
        this.ribbonB[n*2] = a.x*this.width+ox; this.ribbonB[n*2+1] = a.y*this.height-oy;
      }
      for (let filament = 0; filament < 3; filament++) {
        const ribbon = filament === 1 ? this.ribbonB : this.ribbonA;
        ctx.beginPath();ctx.moveTo(ribbon[0],ribbon[1]);
        for(let n=1;n<=34;n++)ctx.lineTo(ribbon[n*2],ribbon[n*2+1]);
        ctx.globalAlpha = fade * (filament === 0 ? .22 : .78);
        ctx.strokeStyle = filament === 2 ? "#fff5d5" : colors[index];
        ctx.lineWidth = filament === 0 ? 9 : filament === 1 ? 2 : .8;
        ctx.lineCap = "round"; ctx.stroke();
      }
      const x = point.x * this.width, y = point.y * this.height, radius = this.brushWidth() * .6;
      ctx.globalAlpha = fade;
      ctx.drawImage(this.glow.canvas, x-radius, y-radius, radius*2, radius*2);
      ctx.globalAlpha = fade * .36; ctx.lineWidth = .8; ctx.strokeStyle = colors[index];
      ctx.beginPath(); ctx.ellipse(x, y, radius * .64, radius * .28, time / 1400 + index, -.4, Math.PI * 1.45); ctx.stroke();
      for (let n = 0; n < 16; n++) {
        const age = (time / 1150 + n / 16 + index * .17) % 1, angle = n * 2.4 + age * 3 + index;
        const origin = this.pointInto(index, Math.max(0, progress - age * .035), this.sampleA);
        const distance = Math.sin(age * Math.PI) * radius * .9, size = (1 - age) * 1.8;
        const sx = origin.x * this.width + Math.cos(angle) * distance, sy = origin.y * this.height + Math.sin(angle) * distance - age * radius * .3;
        ctx.globalAlpha = (1 - age) * .9 * fade; ctx.fillStyle = n % 3 ? "#fff7d5" : colors[index];
        ctx.beginPath(); ctx.arc(sx, sy, size, 0, Math.PI * 2); ctx.fill();
        if (n % 4 === 0) { ctx.fillRect(sx - size * 2.5, sy - .35, size * 5, .7); ctx.fillRect(sx - .35, sy - size * 2.5, .7, size * 5); }
      }
    }
    ctx.restore();
  }

  dispose() { for (const buffer of [this.imageLayer, this.mask, this.composite, this.glow]) { buffer.canvas.width = 0; buffer.canvas.height = 0; } }
}
