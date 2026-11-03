import { formatDue, healthLabels, statusLabels, UNASSIGNED, type MapNode, type MappingModel, type TaskStatus } from "./mapping-model";

export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
export const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;
export function smooth(low: number, high: number, value: number) { const t = clamp((value - low) / (high - low), 0, 1); return t * t * (3 - 2 * t); }
export interface Point { x: number; y: number }
export interface Rect extends Point { w: number; h: number }
export interface Palette { surface: string; muted: string; fg: string; secondary: string; faint: string; border: string; subtle: string; strong: string; accent: string; success: string; warning: string; danger: string }
export const lightPalette: Palette = { surface: "#fff", muted: "oklch(97.8% 0 0)", fg: "oklch(15% 0 0)", secondary: "oklch(46% 0 0)", faint: "oklch(59% 0 0)", border: "oklch(93.5% 0 0)", subtle: "oklch(96.5% 0 0)", strong: "oklch(82% 0 0)", accent: "oklch(33% 0 0)", success: "oklch(49% .19 150)", warning: "oklch(58% .18 75)", danger: "oklch(54% .21 25)" };
export class MappingPainter {
  localize = (text: string, values?: readonly unknown[]): string => values ? text.replace(/\{(\d+)\}/g, (_, index: string) => String(values[Number(index)] ?? '')) : text;
  ctx: CanvasRenderingContext2D;
  miniCtx: CanvasRenderingContext2D;
  width = 0; height = 0; dpr = 1; cx = 824; cy = 455; scale = .5;
  view = 0; hover = -1; hoverItem = -1; cursor = -1; cursorItem = -1;
  palette = lightPalette;
  dims = new Map<string, number>();
  highlights = new Map<string, number>();
  progress = new Map<string, number>();
  faces = new Map<string, HTMLCanvasElement>();
  loading = new Set<string>();
  editing = false;
  /** Drag-to-rearrange feedback while editing: the dragged card's screen rect and the slot it would drop into (world rect). */
  ghost: { rect: Rect; label: string } | null = null;
  drop: { rect: Rect; label: string } | null = null;
  items: (Rect & { task: number; item: number })[] = [];
  introStart = -Infinity;
  reduced = false;
  dead = false;
  onAsset: () => void = () => {};
  constructor(public canvas: HTMLCanvasElement, public mini: HTMLCanvasElement, public model: MappingModel) {
    this.ctx = canvas.getContext("2d")!;
    this.miniCtx = mini.getContext("2d")!;
    this.syncModel();
  }
  /** Re-point the painter at a rebuilt model. Animated values are keyed by entity, so unchanged cards keep their state. */
  setModel(model: MappingModel) { this.model = model; this.syncModel(); }
  syncModel() {
    const live = new Set(this.model.nodes.map(node => node.key));
    for (const map of [this.dims, this.highlights, this.progress]) for (const key of [...map.keys()]) if (!live.has(key)) map.delete(key);
    this.model.nodes.forEach(node => { if (node.kind !== "task" && node.kind !== "person" && !this.progress.has(node.key)) this.progress.set(node.key, this.model.stats(node.id).progress); });
  }
  dim(node: MapNode) { return this.dims.get(node.key) ?? 1; }
  /** Load a person's avatar image once, the first time it is drawn at a size where it matters. */
  face(person: number) {
    const view = this.model.person(person);
    if (!view.avatarUrl || this.faces.has(view.id)) return this.faces.get(view.id) ?? null;
    if (!this.loading.has(view.id)) {
      this.loading.add(view.id);
      const image = new Image();
      image.onload = () => {
        if (this.dead) return;
        const face = document.createElement("canvas"); face.width = face.height = 160;
        const context = face.getContext("2d")!, crop = Math.min(image.naturalWidth, image.naturalHeight);
        context.beginPath(); context.arc(80, 80, 80, 0, Math.PI * 2); context.clip();
        context.drawImage(image, (image.naturalWidth - crop) / 2, (image.naturalHeight - crop) / 2, crop, crop, 0, 0, 160, 160);
        this.faces.set(view.id, face); this.onAsset();
      };
      image.src = view.avatarUrl;
    }
    return null;
  }
  toWorld(point: Point): Point { return { x: this.cx + (point.x - this.width / 2) / this.scale, y: this.cy + (point.y - this.height / 2) / this.scale }; }
  screenRect(node: MapNode): Rect { return { x: this.width / 2 + (node.x - this.cx) * this.scale, y: this.height / 2 + (node.y - this.cy) * this.scale, w: node.w * this.scale, h: node.h * this.scale }; }
  font(size: number, weight = 400, display = false) { this.ctx.font = `${weight} ${size.toFixed(2)}px ${display ? "Mapping Geist" : "Mapping Inter"}, sans-serif`; this.ctx.letterSpacing = `${(display ? -.03 : -.01) * size}px`; }
  measure(text: string, size: number, weight = 400) { this.font(size, weight); return this.ctx.measureText(text).width; }
  fit(text: string, size: number, weight: number, width: number) {
    if (width <= 0) return "";
    if (this.measure(text, size, weight) <= width) return text;
    let low = 0, high = text.length;
    while (low < high) { const middle = Math.ceil((low + high) / 2); if (this.measure(text.slice(0, middle) + "…", size, weight) <= width) low = middle; else high = middle - 1; }
    return low ? text.slice(0, low).trimEnd() + "…" : "";
  }
  wrap(text: string, size: number, weight: number, width: number, limit: number) {
    const words = text.split(" "), lines: string[] = [];
    let line = "";
    for (let index = 0; index < words.length; index++) {
      const next = line ? `${line} ${words[index]}` : words[index];
      if (!line || this.measure(next, size, weight) <= width) { line = next; continue; }
      if (lines.length === limit - 1) { lines.push(this.fit(`${line} ${words.slice(index).join(" ")}`, size, weight, width)); return lines; }
      lines.push(line); line = words[index];
    }
    if (line) lines.push(this.fit(line, size, weight, width));
    return lines;
  }
  text(text: string, x: number, y: number, size: number, weight: number, color: string, align: CanvasTextAlign = "left") { if (!text) return; this.font(size, weight); this.ctx.fillStyle = color; this.ctx.textAlign = align; this.ctx.fillText(text, x, y + 1.01 * size); }
  round(x: number, y: number, w: number, h: number, radius: number) { this.ctx.beginPath(); this.ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.max(0, Math.min(radius, w / 2, h / 2))); }
  circle(x: number, y: number, radius: number) { this.ctx.beginPath(); this.ctx.arc(x, y, Math.max(0, radius), 0, Math.PI * 2); }
  avatar(person: number, x: number, y: number, size: number, alpha: number, ring = 0) {
    const ctx = this.ctx, p = this.palette, view = this.model.person(person), face = size >= 7 ? this.face(person) : null;
    ctx.globalAlpha = alpha;
    if (ring) { this.circle(x + size / 2, y + size / 2, size / 2 + ring); ctx.fillStyle = p.surface; ctx.fill(); }
    if (face) ctx.drawImage(face, x, y, size, size);
    else { this.circle(x + size / 2, y + size / 2, size / 2); ctx.fillStyle = size < 10 ? p.strong : p.muted; ctx.fill(); if (size >= 10) { ctx.lineWidth = 1; ctx.strokeStyle = p.border; ctx.stroke(); } if (size >= 16) this.text(view.initials, x + size / 2, y + size / 2 - .26 * size, .4 * size, 500, view === UNASSIGNED ? p.faint : p.secondary, "center"); }
  }
  glyph(status: TaskStatus, x: number, y: number, size: number, alpha: number) {
    const ctx = this.ctx, p = this.palette, r = size / 2, stroke = Math.max(1, size * .12);
    ctx.globalAlpha = alpha;
    this.circle(x, y, r - (status === "done" || status === "blocked" ? 0 : stroke / 2));
    if (status === "done" || status === "blocked") {
      ctx.fillStyle = status === "done" ? p.success : p.danger; ctx.fill(); ctx.beginPath(); ctx.strokeStyle = p.surface; ctx.lineWidth = 1.15 * stroke; ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (status === "done") { ctx.moveTo(x - .4 * r, y + .02 * r); ctx.lineTo(x - .1 * r, y + .32 * r); ctx.lineTo(x + .42 * r, y - .28 * r); }
      else { ctx.moveTo(x - .42 * r, y); ctx.lineTo(x + .42 * r, y); } ctx.stroke();
    } else {
      ctx.strokeStyle = status === "todo" ? p.strong : p.accent; ctx.lineWidth = stroke; ctx.stroke();
      if (status !== "todo") { ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, .5 * r, -Math.PI / 2, -Math.PI / 2 + Math.PI * (status === "review" ? 1.5 : 1)); ctx.closePath(); ctx.fillStyle = p.accent; ctx.fill(); }
    }
  }
  animate(delta: number) {
    const amount = this.reduced ? 1 : 1 - Math.exp(-delta * 11), path = this.model.nodePath(this.view);
    let moving = false;
    this.model.nodes.forEach(node => {
      if (node.kind === "person") return;
      const depth = this.model.nodePath(node.id).length - 1;
      const target = path[depth - 1] === node.parent && path.length > depth && path[depth] !== node.id ? node.kind === "team" ? .42 : .5 : 1;
      const dim = this.dim(node);
      if (Math.abs(dim - target) > .003) { this.dims.set(node.key, lerp(dim, target, amount * .7)); moving = true; } else this.dims.set(node.key, target);
      const highlight = this.highlights.get(node.key) || 0, desired = Number(node.id === this.hover || node.id === this.cursor);
      if (Math.abs(highlight - desired) > .004) { this.highlights.set(node.key, lerp(highlight, desired, amount)); moving = true; } else if (desired) this.highlights.set(node.key, 1); else this.highlights.delete(node.key);
      if (node.kind !== "task") {
        const shown = this.progress.get(node.key) ?? this.model.stats(node.id).progress, actual = this.model.stats(node.id).progress;
        if (Math.abs(shown - actual) > .0005) { this.progress.set(node.key, this.reduced ? actual : lerp(shown, actual, 1 - Math.exp(-6 * delta))); moving = true; } else this.progress.set(node.key, actual);
      }
    });
    return moving;
  }
  intro(delay: number, now: number) { return this.reduced ? 1 : 1 - Math.pow(1 - clamp((now - this.introStart - delay) / 520, 0, 1), 3); }
  draw(now: number) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, this.width, this.height); ctx.textBaseline = "alphabetic";
    this.items = [];
    this.drawGrid();
    this.model.teams.forEach((team, index) => this.drawTeam(this.model.nodes[team.node], index, now));
    this.drawEditing();
    ctx.globalAlpha = 1;
    this.drawMini();
  }
  screenOf(rect: Rect): Rect { return { x: this.width / 2 + (rect.x - this.cx) * this.scale, y: this.height / 2 + (rect.y - this.cy) * this.scale, w: rect.w * this.scale, h: rect.h * this.scale }; }
  /** The nodes that can be dragged at the current zoom level: teams from the studio, projects from inside a team. */
  draggable() {
    const node = this.model.nodes[this.view];
    return node.kind === "company" ? node.children.filter(id => this.model.nodes[id].kind === "team") : node.kind === "team" ? node.children.filter(id => this.model.nodes[id].kind === "project") : [];
  }
  drawEditing() {
    if (!this.editing) return;
    const ctx = this.ctx, p = this.palette;
    ctx.save(); ctx.setLineDash([5, 4]); ctx.lineWidth = 1; ctx.strokeStyle = p.strong; ctx.globalAlpha = .9;
    this.draggable().forEach(id => { const rect = this.screenRect(this.model.nodes[id]); if (this.outside(rect)) return; this.round(rect.x - 3, rect.y - 3, rect.w + 6, rect.h + 6, clamp(18 * this.scale, 6, 30) + 3); ctx.stroke(); });
    ctx.restore();
    if (this.drop) {
      const rect = this.screenOf(this.drop.rect);
      ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.strokeStyle = p.accent; this.round(rect.x - 3, rect.y - 3, rect.w + 6, rect.h + 6, 12); ctx.stroke();
      this.text(this.drop.label, rect.x + 8, rect.y - 22, 12, 500, p.accent);
    }
    if (this.ghost) {
      const { x, y, w, h } = this.ghost.rect;
      ctx.globalAlpha = .9; this.round(x, y, w, h, clamp(14 * this.scale, 6, 24)); ctx.fillStyle = p.surface; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = p.accent; ctx.stroke();
      ctx.globalAlpha = 1; this.text(this.fit(this.ghost.label, 14, 500, Math.max(10, w - 20)), x + 10, y + 10, 14, 500, p.fg);
    }
  }
  drawGrid() {
    const ctx = this.ctx, ox = this.width / 2 - this.cx * this.scale, oy = this.height / 2 - this.cy * this.scale;
    ctx.fillStyle = this.palette.strong;
    [8, 32, 128, 512].forEach(step => {
      const spacing = step * this.scale;
      if (spacing < 14 || spacing > 420) return;
      const opacity = smooth(14, 30, spacing) * (1 - smooth(140, 420, spacing)) * .55;
      if (opacity < .01) return;
      ctx.globalAlpha = opacity; ctx.beginPath();
      for (let x = (ox % spacing + spacing) % spacing; x < this.width; x += spacing) for (let y = (oy % spacing + spacing) % spacing; y < this.height; y += spacing) ctx.rect(x - .75, y - .75, 1.5, 1.5);
      ctx.fill();
    });
  }
  outside(rect: Rect) { return rect.x > this.width || rect.y > this.height || rect.x + rect.w < 0 || rect.y + rect.h < 0; }
  drawTeam(node: MapNode, index: number, now: number) {
    const p = this.palette, ctx = this.ctx, s = this.scale, intro = this.intro(70 * index, now), rect = this.screenRect(node);
    if (intro <= 0 || this.outside(rect)) return;
    rect.y += (1 - intro) * 18;
    const { x, y, w, h } = rect, alpha = intro * this.dim(node), team = this.model.teams[node.ref], inset = clamp(20 * s, 8, 28), title = clamp(28 * s, 11, 22), top = y + clamp(14 * s, 2, 36), small = clamp(20 * s, 11, 15);
    ctx.globalAlpha = alpha; this.round(x, y, w, h, clamp(18 * s, 6, 30)); ctx.fillStyle = p.muted; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = this.highlights.get(node.key) ? p.strong : p.border; ctx.stroke();
    this.text(this.fit(team.name, title, 500, w - 2 * inset - 44), x + inset, top, title, 500, p.fg);
    this.text(`${Math.round(100 * (this.progress.get(node.key) || 0))}%`, x + w - inset, top + (title - small) * 1.01, small, 500, p.secondary, "right");
    const reveal = smooth(8.5, 10.5, 20 * s);
    if (reveal > .01) { const font = clamp(20 * s, 11, 13), baseline = Math.max(top + 1.3 * title, y + 50 * s), face = 1.45 * font, stats = this.model.stats(node.id); this.avatar(team.lead, x + inset, baseline + (1.3 * font - face) / 2, face, alpha * reveal); ctx.globalAlpha = alpha * reveal; this.text(this.fit(`${this.model.person(team.lead).name} · ${stats.projects} projects · ${stats.open} open tasks`, font, 400, w - 2 * inset - face - 6), x + inset + face + 6, baseline, font, 400, p.secondary); }
    if (!team.projects.length) { const hint = smooth(8.8, 11, 12 * s); if (hint > .01) { ctx.globalAlpha = alpha * hint; this.text(this.localize("No projects yet"), x + inset, y + 84 * s, clamp(13 * s, 11, 14), 400, p.faint); } }
    node.children.forEach((id, projectIndex) => this.drawProject(this.model.nodes[id], alpha * Math.min(1, 1.5 * intro), index, projectIndex, now, (1 - intro) * 18));
  }
  drawProject(node: MapNode, parentAlpha: number, teamIndex: number, projectIndex: number, now: number, offset: number) {
    const rect = this.screenRect(node); rect.y += offset;
    if (this.outside(rect) || rect.w < 2) return;
    const { x, y, w, h } = rect, ctx = this.ctx, p = this.palette, s = this.scale, project = this.model.projects[node.ref], alpha = parentAlpha * this.dim(node), inset = 12 * s, inner = w - 2 * inset, titleReveal = smooth(9.6, 12, 13 * s), metaReveal = smooth(8.8, 11, 9.5 * s), small = clamp(9.5 * s, 11, 13), progress = this.progress.get(node.key) || 0, percent = Math.round(progress * 100);
    ctx.globalAlpha = alpha; this.round(x, y, w, h, clamp(12 * s, 2.5, 26)); ctx.fillStyle = p.surface; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = this.highlights.get(node.key) ? p.strong : p.border; ctx.stroke();
    if (titleReveal > .01) { const title = clamp(13 * s, 12, 20); ctx.globalAlpha = alpha * titleReveal; this.text(this.fit(project.name, title, 500, inner - (metaReveal > .01 ? this.measure(`${percent}%`, small, 500) + 10 : 0)), x + inset, y + 11 * s, title, 500, p.fg); }
    if (metaReveal > .01) { const dot = small / 2; ctx.globalAlpha = alpha * metaReveal; this.circle(x + inset + dot / 2, y + 31 * s + .65 * small, dot / 2); ctx.fillStyle = project.health === "on-track" ? p.success : project.health === "at-risk" ? p.warning : p.danger; ctx.fill(); this.text(`${percent}%`, x + w - inset, y + 11 * s + (clamp(13 * s, 12, 20) - small) * 1.01, small, 500, p.secondary, "right"); this.text(this.fit(`${healthLabels[project.health]} · Due ${formatDue(project.due)}`, small, 400, inner - dot - 6), x + inset + dot + 6, y + 31 * s, small, 400, p.secondary); }
    const track = clamp(3 * s, 1.5, 6); ctx.globalAlpha = alpha; this.round(x + inset, y + 50 * s, inner, track, track / 2); ctx.fillStyle = p.subtle; ctx.fill(); this.round(x + inset, y + 50 * s, Math.max(track, inner * progress), track, track / 2); ctx.fillStyle = p.accent; ctx.fill();
    if (!project.tasks.length && metaReveal > .01) { ctx.globalAlpha = alpha * metaReveal; this.text(this.localize("No tasks yet"), x + inset, y + 66 * s, small, 400, p.faint); }
    project.tasks.forEach((id, index) => { const intro = this.intro(teamIndex * 70 + 180 + 45 * projectIndex + index * 16, now); if (intro > 0) this.drawTask(this.model.nodes[this.model.tasks[id].node], alpha * intro, intro, offset); });
    const faceSize = 16 * s;
    if (faceSize >= 3 && project.people.length > 0 && y + (node.h - 28) * s <= this.height && y + (node.h - 12) * s >= 0) {
      const avatarNodes = node.children.filter(id => this.model.nodes[id].kind === "person");
      for (let index = project.people.length - 1; index >= 0; index--) { const left = x + (12 + index * 19) * s; this.avatar(project.people[index], left, y + (node.h - 28) * s, faceSize, alpha, clamp(.09 * faceSize, .6, 2.5)); if (this.hover === avatarNodes[index] || this.cursor === avatarNodes[index]) { ctx.globalAlpha = alpha; this.circle(left + faceSize / 2, y + (node.h - 28) * s + faceSize / 2, faceSize / 2 + 1); ctx.strokeStyle = p.fg; ctx.lineWidth = 1.5; ctx.stroke(); } }
      const reveal = smooth(8.8, 11, 9 * s);
      if (reveal > .01) { const font = clamp(9 * s, 11, 13), left = x + (12 + (project.people.length - 1) * 19 + 22) * s; ctx.globalAlpha = alpha * reveal; this.text(this.fit(`${this.model.person(project.people[0]).name}${project.people.length > 1 ? ` and ${project.people.length - 1} others` : ""}`, font, 400, x + w - 12 * s - left), left, y + (node.h - 28) * s + (faceSize - 1.3 * font) / 2, font, 400, p.secondary); }
    }
  }
  drawTask(node: MapNode, parentAlpha: number, intro: number, offset: number) {
    const rect = this.screenRect(node); rect.y += offset;
    if (this.outside(rect) || rect.w < 1) return;
    if (intro < 1) { const ratio = .55 + .45 * intro; rect.x += rect.w * (1 - ratio) / 2; rect.y += rect.h * (1 - ratio) / 2; rect.w *= ratio; rect.h *= ratio; }
    const { x, y, w, h } = rect, p = this.palette, ctx = this.ctx, task = this.model.tasks[node.ref], status = this.model.status(node.ref), s = this.scale;
    const person = this.hover >= 0 && this.model.nodes[this.hover].kind === "person" ? this.model.nodes[this.hover] : null;
    const alpha = parentAlpha * this.dim(node) * (person?.parent === node.parent && person.ref !== task.assignee ? .3 : 1), blocks = 1 - smooth(34, 64, w), radius = clamp(4 * s, 1.5, 20);
    this.round(x, y, w, h, radius);
    if (blocks > 0) { const [color, opacity] = status === "done" ? [p.success, .8] as const : status === "progress" ? [p.accent, .85] as const : status === "review" ? [p.accent, .42] as const : status === "blocked" ? [p.danger, .85] as const : [p.strong, .6] as const; ctx.globalAlpha = alpha * blocks * opacity; ctx.fillStyle = color; ctx.fill(); }
    if (blocks < 1) { ctx.globalAlpha = alpha * (1 - blocks); ctx.fillStyle = p.muted; ctx.fill(); }
    if (this.highlights.get(node.key)) { ctx.globalAlpha = alpha * this.highlights.get(node.key)!; ctx.lineWidth = 1; ctx.strokeStyle = p.strong; ctx.stroke(); }
    if (w < 70) return;
    const reveal = smooth(70, 100, w), detail = smooth(300, 420, w), inset = lerp(clamp(.07 * w, 6, 12), clamp(.045 * w, 14, 32), detail), font = lerp(clamp(4.6 * s, 11, 14), clamp(.034 * w, 16, 28), detail), line = 1.28 * font, glyph = clamp(.92 * font, 10, 14), titleOffset = (glyph + 6) * (1 - detail), titleY = y + inset + 26 * detail, avatarSize = clamp(1.35 * font, 14, 20), footerY = y + h - inset - avatarSize;
    const lines = this.wrap(task.title, font, 500, w - 2 * inset - titleOffset, detail > .5 ? 2 : clamp(Math.floor((footerY - 3 - titleY) / line), 1, 2));
    if (detail > .01) { ctx.save(); this.round(x, y, w, h, radius); ctx.clip(); }
    if (detail < .99) this.glyph(status, x + inset + glyph / 2, titleY + line / 2, glyph, alpha * reveal * (1 - detail));
    ctx.globalAlpha = alpha * reveal; lines.forEach((text, index) => this.text(text, x + inset + titleOffset, titleY + index * line, font, 500, status === "done" ? p.secondary : p.fg));
    const footerAlpha = reveal * (1 - detail) * smooth(52, 70, h);
    if (footerAlpha > .01) { this.avatar(task.assignee, x + inset, footerY, avatarSize, alpha * footerAlpha); const small = clamp(.88 * font, 11, 12.5); ctx.globalAlpha = alpha * footerAlpha; this.text(status === "blocked" ? "Blocked" : `${this.model.done(node.ref)}/${task.checklist.length} · ${formatDue(task.due)}`, x + w - inset, footerY + (avatarSize - 1.3 * small) / 2, small, status === "blocked" ? 500 : 400, status === "blocked" ? p.danger : p.faint, "right"); }
    if (detail > .01) { this.drawDetail(node.ref, rect, inset, titleY + lines.length * line, alpha * detail); ctx.restore(); }
  }
  drawDetail(id: number, rect: Rect, inset: number, afterTitle: number, alpha: number) {
    const { x, y, w, h } = rect, ctx = this.ctx, p = this.palette, task = this.model.tasks[id], project = this.model.projects[task.project], status = this.model.status(id), available = (bottom: number) => smooth(-4, 18, y + h - .7 * inset - bottom);
    this.glyph(status, x + inset + 7, y + inset + 8.45, 14, alpha); ctx.globalAlpha = alpha;
    this.text(this.localize(statusLabels[status]), x + inset + 22, y + inset, 13, 500, status === "blocked" ? p.danger : p.fg);
    this.text(`· Due ${formatDue(task.due)} · ${task.points} ${task.points === 1 ? "point" : "points"}`, x + inset + 28 + this.measure(statusLabels[status], 13, 500), y + inset, 13, 400, p.secondary);
    this.text(`${task.comments} ${task.comments === 1 ? "comment" : "comments"}`, x + w - inset, y + inset, 13, 400, p.faint, "right");
    let row = afterTitle + 8;
    const font = clamp(.019 * w, 13, 15), line = 1.5 * font, description = this.wrap(this.model.describe(id), font, 400, Math.min(w - 2 * inset, 620), 3);
    description.forEach((text, index) => { ctx.globalAlpha = alpha * available(row + (index + 1) * line); this.text(text, x + inset, row + index * line, font, 400, p.secondary); });
    row += description.length * line + 14;
    const personAlpha = alpha * available(row + 58);
    if (personAlpha > .01) {
      ctx.globalAlpha = personAlpha; ctx.fillStyle = p.border; ctx.fillRect(x + inset, row, w - 2 * inset, 1); row += 14;
      this.avatar(task.assignee, x + inset, row, 36, personAlpha); ctx.globalAlpha = personAlpha;
      this.text(this.model.person(task.assignee).name, x + inset + 46, row + 1, 14, 500, p.fg); this.text(this.model.person(task.assignee).role, x + inset + 46, row + 19, 13, 400, p.faint);
      this.text(this.fit(`${project.name} · ${this.model.teams[project.team].name}`, 13, 400, w - 2 * inset - 220), x + w - inset, row + 10, 13, 400, p.faint, "right"); row += 52;
    } else row += 66;
    ctx.globalAlpha = alpha * available(row + 20);
    this.text("Checklist", x + inset, row, 13, 500, p.fg); this.text(task.checklist.length ? `${this.model.done(id)} of ${task.checklist.length}` : "No steps yet", x + inset + this.measure("Checklist", 13, 500) + 8, row, 13, 400, p.faint);
    const track = Math.min(160, .22 * w), left = x + w - inset - track;
    this.round(left, row + 7, track, 4, 2); ctx.fillStyle = p.subtle; ctx.fill(); this.round(left, row + 7, Math.max(4, track * this.model.done(id) / Math.max(1, task.checklist.length)), 4, 2); ctx.fillStyle = task.checklist.length && this.model.done(id) === task.checklist.length ? p.success : p.accent; ctx.fill(); row += 26;
    task.checklist.forEach((entry, index) => {
      const opacity = alpha * available(row + 26), checked = entry.done;
      if (opacity > .01) {
        const hit = { task: id, item: index, x: x + inset - 8, y: row - 2, w: Math.min(w - 2 * inset + 16, 420), h: 28 };
        ctx.globalAlpha = opacity;
        if (this.hover === task.node && this.hoverItem === index || this.view === task.node && this.cursorItem === index) { this.round(hit.x, hit.y, hit.w, hit.h, 9); ctx.fillStyle = p.muted; ctx.fill(); }
        this.round(x + inset, row + 4, 16, 16, 5);
        if (checked) { ctx.fillStyle = p.fg; ctx.fill(); ctx.beginPath(); ctx.moveTo(x + inset + 4.2, row + 12.4); ctx.lineTo(x + inset + 7, row + 15.2); ctx.lineTo(x + inset + 12, row + 9.4); ctx.strokeStyle = p.surface; ctx.lineWidth = 1.8; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke(); }
        else { ctx.lineWidth = 1.25; ctx.strokeStyle = p.strong; ctx.stroke(); }
        this.text(this.fit(entry.label, 14, 400, Math.min(w - 2 * inset - 30, 400)), x + inset + 26, row + 3, 14, 400, checked ? p.faint : p.fg);
        if (opacity > .5 && alpha > .6) this.items.push(hit);
      }
      row += 28;
    });
  }
  miniFrame() { const width = this.mini.clientWidth, height = this.mini.clientHeight, scale = Math.min((width - 12) / this.model.world.w, (height - 12) / this.model.world.h); return { width, height, scale, ox: (width - this.model.world.w * scale) / 2, oy: (height - this.model.world.h * scale) / 2 }; }
  drawMini() {
    const ctx = this.miniCtx, p = this.palette, { width, height, scale, ox, oy } = this.miniFrame();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, width, height);
    this.model.teams.forEach(team => { const node = this.model.nodes[team.node]; ctx.globalAlpha = .4 + .6 * this.dim(node); ctx.beginPath(); ctx.roundRect(ox + node.x * scale, oy + node.y * scale, node.w * scale, node.h * scale, 3); ctx.fillStyle = p.muted; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = p.border; ctx.stroke(); node.children.forEach(id => { const child = this.model.nodes[id]; ctx.fillStyle = p.strong; ctx.fillRect(ox + child.x * scale, oy + child.y * scale, child.w * scale, child.h * scale * .7); }); });
    const w = Math.max(6, this.width / this.scale * scale), h = Math.max(6, this.height / this.scale * scale), x = ox + this.cx * scale - w / 2, y = oy + this.cy * scale - h / 2, left = clamp(x, 1, width - 1), top = clamp(y, 1, height - 1);
    ctx.beginPath(); ctx.roundRect(left, top, Math.max(2, clamp(x + w, 1, width - 1) - left), Math.max(2, clamp(y + h, 1, height - 1) - top), 2.5); ctx.globalAlpha = .14; ctx.fillStyle = p.accent; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = p.accent; ctx.lineWidth = 1.5; ctx.stroke();
  }
  pick(point: Point): { node: number; item: number } {
    const contains = (rect: Rect, target: Point) => target.x >= rect.x && target.x <= rect.x + rect.w && target.y >= rect.y && target.y <= rect.y + rect.h;
    for (const item of this.items) if (contains(item, point)) return { node: this.model.tasks[item.task].node, item: item.item };
    const world = this.toWorld(point), team = this.model.teams.find(team => contains(this.model.nodes[team.node], world));
    if (!team) return { node: -1, item: -1 };
    const project = team.projects.map(id => this.model.projects[id]).find(project => contains(this.model.nodes[project.node], world));
    if (!project || !(this.model.nodes[project.node].w * this.scale >= 150 || this.view === team.node)) return { node: team.node, item: -1 };
    for (const id of this.model.nodes[project.node].children) { const node = this.model.nodes[id]; if (node.kind === "person") { const r = node.w / 2; if (node.w * this.scale >= 18 && Math.hypot(world.x - node.x - r, world.y - node.y - r) <= r) return { node: id, item: -1 }; } else if (contains(node, world) && (node.w * this.scale >= 90 || this.view === project.node)) return { node: id, item: -1 }; }
    return { node: project.node, item: -1 };
  }
}
