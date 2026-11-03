/**
 * Page-to-page transition (cross-document View Transitions), rebuilt from the reference capture
 * (docs/zzzz.mp4, 1152×720, measured frame by frame; hd = half the viewport diagonal):
 *
 *  - disc     the incoming page is revealed through a disc that grows from the viewport centre at a
 *             constant 1.858 hd/s (fitted on two transitions, ≈20 px RMSE) with a soft edge (90→10 % over
 *             ≈60 px at 1152×720, then a faint tail ≈50 px further out); it reaches the corners after ≈0.6 s.
 *  - lens in  inside the disc the incoming page is seen through a magnifying lens:
 *             sample = p − k·(p − c)·(1 − ρ²), ρ = |p − c| / R, k = 0.85·(1 − τ/0.75 s)^1.4
 *             (≈2.9× at the centre while the disc is small, gone by 0.75 s), with chromatic aberration.
 *  - lens out the outgoing page is pushed out around the disc edge (0.16·R at the edge, decaying over
 *             0.45·R), with chromatic aberration, until the disc covers it.
 *  - text     text blocks in the first viewport are revealed line by line, top to bottom (first line at
 *             0.35 s, 55 ms apart, 170 ms each), leaning (skew) with colour fringes while they settle.
 *  - media    large images/canvases fade in from 0.48 s over 0.67 s.
 *  - header   the site header stays still.
 *
 * All reference timings are multiplied by TIME_SCALE (the motion is kept, only slowed down so it reads).
 *
 * The transition plays while the incoming document is still loading (parsing, styling, hydrating), so its
 * motion must not depend on that document's main thread: everything that moves is a `scale`, `transform`
 * or `opacity` animation of the transition pseudo-elements, which the compositor runs on its own.
 *  - The disc is a fixed soft-edged mask on a box scaled up from the disc centre; the snapshot inside is
 *    scaled back down by the same factor, so it stays in place while its mask grows (radius ∝ scale, so the
 *    soft edge grows with the disc and matches the reference at full size).
 *  - Both lenses are static SVG filters on those scaled boxes: their size and push follow the disc for free.
 *    Only the incoming lens strength k (its decay) is updated from the main thread, best effort.
 *  - The outgoing page is captured under its own name (pt-out, set on `pageswap`), so it is not inside the
 *    incoming page's mask.
 *  - Each text block wipes in with a translated mask (box and content move in opposite directions).
 * `window.__ptSettled` resolves once the transition is over (src/lib/pageSettled.ts), so page code can hold
 * heavy start-up work until then.
 *
 * Below 940px (the site's phone and tablet layouts) the lens and the colour fringes are left out: the SVG
 * displacement chain is ~10 full-screen passes a frame, which a phone GPU at 3× pixel density cannot keep up
 * with. The disc reveal, the line-by-line text and the lean stay, and they cost next to nothing.
 *
 * The function is serialised with `toString()` and inlined into <head> (it must register `pagereveal`
 * before the first render of the new document), so it must stay self-contained: no imports, no
 * references to module scope.
 */
export function pageTransitionRuntime(): void {
  // `__ptPlaying` is true and `__ptSettled` pending while a transition reveals this document; `pt-settled`
  // fires when it is over (src/lib/pageSettled.ts). Re-armed when the page goes into the back/forward cache,
  // so renderers resumed by its restore wait for that transition too.
  const w = window as Window & { __ptSettled?: Promise<void>; __ptPlaying?: boolean };
  let settle = () => {};
  const arm = () => {
    let open = true;
    const settled: Promise<void> = new Promise<void>((resolve) => {
      settle = () => {
        if (!open) return;
        open = false;
        resolve();
        // a transition that ends after the page was cached again does not end the restore's one
        if (w.__ptSettled !== settled) return;
        w.__ptPlaying = false;
        window.dispatchEvent(new Event("pt-settled"));
      };
    });
    w.__ptSettled = settled;
    w.__ptPlaying = true;
  };
  arm();
  if (!("onpagereveal" in window)) {
    settle();
    return;
  }

  const TIME_SCALE = 1.6;
  const DISC_SPEED = 1.858; // hd per second (reference)
  // soft edge: incoming alpha at R + x·hd, from the measured profile (0.9→0.1 over ≈60 px, then a long faint tail)
  const EDGE: [number, number][] = [[-0.088, 1], [-0.047, 0.9], [-0.024, 0.72], [0, 0.5], [0.021, 0.3], [0.041, 0.1], [0.074, 0.04], [0.118, 0]];
  const LENS_K0 = 0.85;
  const LENS_MS = 750;
  const LENS_POW = 1.4;
  const OUT_PUSH = 0.16; // × R at the edge
  const OUT_DECAY = 0.45; // × R beyond the edge
  const CA = [1.12, 1, 0.88];
  const TEXT_START = 350;
  const LINE_STAGGER = 55;
  const LINE_MS = 170;
  const LEAN = 9; // deg of skew at the start of a block's reveal
  const MEDIA_START = 480;
  const MEDIA_MS = 670;
  const MAX_TEXT = 6;
  const MAX_MEDIA = 4;
  const PAD = 48; // room around a text block, so its lean and magnification are not clipped
  const R_MIN = 0.04; // disc radius on the first frame, × hd
  const STEP = 1.04; // ratio between consecutive disc keyframes (keeps scale × 1/scale within 0.04 %)
  const MAP = 256;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const S = (ms: number) => ms * TIME_SCALE;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const compact = window.matchMedia("(max-width: 939px)");
  const root = document.documentElement;

  // the outgoing page is captured as pt-out (page-transition.css), apart from the incoming root
  window.addEventListener("pageswap", (e: PageSwapEvent) => {
    if (e.viewTransition) root.classList.add("pt-leaving");
  });
  window.addEventListener("pageshow", () => root.classList.remove("pt-leaving"));
  window.addEventListener("pagehide", (e: PageTransitionEvent) => {
    if (e.persisted) arm();
  });

  // Next.js <Link> navigations are client-side and would skip the cross-document transition:
  // let same-origin page links fall through to a normal (prerendered) navigation instead.
  window.addEventListener(
    "click",
    (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;
      const a = target ? target.closest("a[href]") : null;
      if (!(a instanceof HTMLAnchorElement)) return;
      if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      e.stopPropagation();
    },
    true,
  );

  const bezier = (p1x: number, p1y: number, p2x: number, p2y: number) => {
    const cx = 3 * p1x;
    const bx = 3 * (p2x - p1x) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * p1y;
    const by = 3 * (p2y - p1y) - cy;
    const ay = 1 - cy - by;
    const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
    const sy = (t: number) => ((ay * t + by) * t + cy) * t;
    const dsx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
    return (x: number) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const d = sx(t) - x;
        const dd = dsx(t);
        if (Math.abs(d) < 1e-5 || Math.abs(dd) < 1e-6) break;
        t -= d / dd;
      }
      return sy(Math.min(1, Math.max(0, t)));
    };
  };
  const outEase = bezier(0.22, 1, 0.36, 1);
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const smooth = (a: number, b: number, x: number) => {
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };

  /** Square displacement map over [-span, span]² as a PNG data URL (R/G = 0.5 ± vector). */
  const makeMap = (span: number, field: (ux: number, uy: number) => [number, number]) => {
    const c = document.createElement("canvas");
    c.width = c.height = MAP;
    const ctx = c.getContext("2d");
    if (!ctx) return "";
    const img = ctx.createImageData(MAP, MAP);
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        const [vx, vy] = field(((x + 0.5) / MAP - 0.5) * 2 * span, ((y + 0.5) / MAP - 0.5) * 2 * span);
        const i = (y * MAP + x) * 4;
        img.data[i] = Math.round(128 + 127 * Math.max(-1, Math.min(1, vx)));
        img.data[i + 1] = Math.round(128 + 127 * Math.max(-1, Math.min(1, vy)));
        img.data[i + 2] = 128;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  };

  // incoming lens: displacement −u(1 − |u|²) inside the unit disc, normalised by its maximum (2/(3√3))
  const LENS_MAX = 2 / (3 * Math.sqrt(3));
  const OUT_SPAN = 1 + 5 * OUT_DECAY;
  const maps = (() => {
    const key = "pt-maps-v2";
    try {
      const cached = sessionStorage.getItem(key);
      if (cached) return JSON.parse(cached) as { lens: string; push: string };
    } catch {}
    const lens = makeMap(1, (ux, uy) => {
      const u2 = ux * ux + uy * uy;
      if (u2 >= 1) return [0, 0];
      const f = (1 - u2) / LENS_MAX;
      return [-ux * f, -uy * f];
    });
    // outgoing push: sample toward the centre, peaking at the disc edge (|u| = 1)
    const push = makeMap(OUT_SPAN, (ux, uy) => {
      const u = Math.hypot(ux, uy) || 1e-6;
      const h = u < 1 ? smooth(0.5, 1, u) : Math.exp(-(u - 1) / OUT_DECAY);
      return [(-ux / u) * h, (-uy / u) * h];
    });
    const out = { lens, push };
    try {
      sessionStorage.setItem(key, JSON.stringify(out));
    } catch {}
    return out;
  })();

  /**
   * Displacement filter with one pass per colour channel (chromatic aberration), recombined; the map covers
   * the square (mx, my, size), the filter the region (x, y, w, h), all in the filtered box's own px.
   */
  const makeFilter = (svg: SVGSVGElement, id: string, region: number[], href: string, mx: number, my: number, size: number) => {
    const el = (name: string, attrs: Record<string, string | number>, parent: Element) => {
      const n = document.createElementNS(SVG_NS, name);
      for (const k in attrs) n.setAttribute(k, String(attrs[k]));
      parent.appendChild(n);
      return n;
    };
    const [x, y, w, h] = region.map((v) => v.toFixed(1));
    const f = el("filter", { id, x, y, width: w, height: h, filterUnits: "userSpaceOnUse", primitiveUnits: "userSpaceOnUse", "color-interpolation-filters": "sRGB" }, svg);
    el("feFlood", { "flood-color": "rgb(128,128,128)", result: "neutral" }, f);
    el("feImage", { href, x: mx.toFixed(1), y: my.toFixed(1), width: size.toFixed(1), height: size.toFixed(1), preserveAspectRatio: "none", result: "mapImg" }, f);
    el("feComposite", { in: "mapImg", in2: "neutral", operator: "over", result: "map" }, f);
    const passes: Element[] = [];
    const channels: [string, string][] = [
      ["dR", "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"],
      ["dG", "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"],
      ["dB", "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"],
    ];
    for (const [name, matrix] of channels) {
      passes.push(el("feDisplacementMap", { in: "SourceGraphic", in2: "map", scale: 0, xChannelSelector: "R", yChannelSelector: "G", result: name + "raw" }, f));
      el("feColorMatrix", { in: name + "raw", type: "matrix", values: matrix, result: name }, f);
    }
    // premultiplied sum: where the passes overlap the colour is whole, at the edges each channel shows alone
    el("feComposite", { in: "dR", in2: "dG", operator: "arithmetic", k1: 0, k2: 1, k3: 1, k4: 0, result: "rg" }, f);
    el("feComposite", { in: "rg", in2: "dB", operator: "arithmetic", k1: 0, k2: 1, k3: 1, k4: 0 }, f);
    let last = "";
    return (scale: number) => {
      const v = scale.toFixed(2);
      if (v === last) return;
      last = v;
      passes.forEach((p, i) => p.setAttribute("scale", (scale * CA[i]).toFixed(2)));
    };
  };

  /** Stable selector for an element (nth-child path from <body>). */
  const pathOf = (node: Element) => {
    const parts: string[] = [];
    let n: Element | null = node;
    while (n && n !== document.body) {
      const parent: Element | null = n.parentElement;
      if (!parent) return null;
      parts.unshift(`${n.tagName.toLowerCase()}:nth-child(${Array.prototype.indexOf.call(parent.children, n) + 1})`);
      n = parent;
    }
    return n ? "body > " + parts.join(" > ") : null;
  };

  /** Line boxes of an element's text, relative to its border box, tiling the whole block. */
  const linesOf = (el: Element) => {
    const box = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines: { top: number; bottom: number }[] = [];
    for (const r of Array.from(range.getClientRects())) {
      if (r.width < 1 || r.height < 1) continue;
      const top = r.top - box.top;
      const bottom = r.bottom - box.top;
      const line = lines.find((l) => Math.abs(l.top - top) < r.height * 0.5);
      if (line) {
        line.top = Math.min(line.top, top);
        line.bottom = Math.max(line.bottom, bottom);
      } else lines.push({ top, bottom });
    }
    lines.sort((a, b) => a.top - b.top);
    for (let i = 0; i < lines.length; i++) {
      lines[i].top = i === 0 ? 0 : lines[i - 1].bottom;
      if (i === lines.length - 1) lines[i].bottom = Math.max(lines[i].bottom, box.height);
    }
    return lines;
  };

  /** A separate snapshot would escape clipping by an ancestor: only take elements nothing clips. */
  const unclipped = (el: Element, r: DOMRect) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = window.getComputedStyle(a);
      if (cs.viewTransitionName && cs.viewTransitionName !== "none") return false;
      if (Number(cs.opacity) < 1 || (cs.transform && cs.transform !== "none" && el.tagName !== "IMG")) return false;
      if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
      const b = a.getBoundingClientRect();
      const rounded = parseFloat(cs.borderTopLeftRadius) > 0 || parseFloat(cs.borderBottomRightRadius) > 0;
      if (rounded || r.left < b.left - 1 || r.top < b.top - 1 || r.right > b.right + 1 || r.bottom > b.bottom + 1) return false;
    }
    return true;
  };

  const visible = (el: Element, r: DOMRect, W: number, H: number) => {
    if (r.width < 1 || r.height < 1 || r.bottom <= 0 || r.top >= H || r.right <= 0 || r.left >= W) return false;
    if (el.closest("header.navigation, footer")) return false;
    const cs = window.getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.display === "contents" || Number(cs.opacity) === 0) return false;
    return !cs.viewTransitionName || cs.viewTransitionName === "none";
  };

  const run = (vt: ViewTransition) => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const cx = W / 2;
    const cy = H / 2;
    const hd = Math.hypot(cx, cy);
    const rEnd = hd * (1 + EDGE[EDGE.length - 1][0]) + 4;
    const discMs = S((1000 * rEnd) / (DISC_SPEED * hd));
    const speed = rEnd / discMs; // px per ms
    const lensEnd = Math.max(discMs, S(LENS_MS));

    // Disc boxes are viewport-sized and scaled about the centre by s = r / R0; R0 is their mask radius,
    // small enough for the mask (with its tail) to fit in the box at any scale.
    const tail = EDGE[EDGE.length - 1][0] * hd;
    const R0 = Math.min(W, H) / 2 / (1 + tail / rEnd) - 2;
    const sMin = (R_MIN * hd) / R0;
    const stops = EDGE.map(([o, a]) => `rgb(0 0 0 / ${a}) ${((R0 * (rEnd + o * hd)) / rEnd).toFixed(1)}px`);
    const discMask = `mask-image:radial-gradient(circle at ${cx.toFixed(1)}px ${cy.toFixed(1)}px, ${stops.join(", ")});mask-repeat:no-repeat`;
    // keyframes at a constant scale ratio: the scale grows linearly in time (r = speed·t), and the inverse
    // scale of the content between two keyframes stays within 0.04 % of exact
    const disc: string[] = [];
    const undisc: string[] = [];
    for (let s = sMin, first = true; ; s = Math.min(s * STEP, rEnd / R0)) {
      const at = first ? 0 : (100 * s * R0) / speed / discMs;
      disc.push(`${at.toFixed(3)}%{scale:${s.toFixed(5)}}`);
      undisc.push(`${at.toFixed(3)}%{scale:${(1 / s).toFixed(5)}}`);
      if (first) {
        first = false;
        continue;
      }
      if (s >= rEnd / R0) break;
    }
    const discAnim = (name: string) => `animation:${name} ${discMs.toFixed(0)}ms linear both`;

    const LITE = compact.matches;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.position = "fixed";
    svg.style.pointerEvents = "none";
    // outgoing push, sized to the disc box: static (its size and strength both scale with the disc); its region
    // covers the whole snapshot, which is drawn up to 1/sMin times the box size around the centre
    const outSpan = OUT_SPAN * R0;
    const outRegion = [cx - (cx + 8) / sMin, cy - (cy + 8) / sMin, (W + 16) / sMin, (H + 16) / sMin];
    // incoming lens over the disc; its strength decays with k (set from the main thread)
    // (the mask hides everything beyond the disc and its soft tail, so the filter only covers that square)
    const reachBox = R0 * (1 + tail / rEnd) + 4;
    const x0 = Math.max(0, cx - reachBox);
    const y0 = Math.max(0, cy - reachBox);
    const lensScale = (k: number) => (k * R0 * LENS_MAX) / 0.498;
    let lensIn: (scale: number) => void = () => {};
    if (!LITE) {
      makeFilter(svg, "pt-lens-out", outRegion, maps.push, cx - outSpan, cy - outSpan, 2 * outSpan)((OUT_PUSH * R0) / 0.498);
      lensIn = makeFilter(svg, "pt-lens-in", [x0, y0, Math.min(W, cx + reachBox) - x0, Math.min(H, cy + reachBox) - y0], maps.lens, cx - R0, cy - R0, 2 * R0);
      lensIn(lensScale(LENS_K0));
    }

    const style = document.createElement("style");
    style.id = "pt-runtime-style";
    // pseudo-element rules are written as html::…: a rule without a type selector counts as universal, and
    // adding or removing its sheet would restyle every element of the page instead of the root alone
    let css = `@keyframes pt-disc{${disc.join("")}}@keyframes pt-undisc{${undisc.join("")}}`;
    css += `html::view-transition-image-pair(root){${discMask};${discAnim("pt-disc")}}`;
    css += `html::view-transition-new(root){${discAnim("pt-undisc")}}`;
    css += `html::view-transition-image-pair(pt-out){${discAnim("pt-disc")}}`;
    css += `html::view-transition-old(pt-out){${discAnim("pt-undisc")}}`;
    // once the disc covers the screen the outgoing page is not drawn any more
    css += `html::view-transition-group(pt-out){animation:pt-gone ${discMs.toFixed(0)}ms step-end both}@keyframes pt-gone{to{opacity:0}}`;
    // a named snapshot's group spans the viewport and carries the disc; its image-pair is placed on the element
    const namedDisc = (name: string, left: number, top: number, w: number, h: number, extra: string) =>
      `html::view-transition-group(${name}){width:${W}px;height:${H}px;transform:none;transform-origin:${cx.toFixed(1)}px ${cy.toFixed(1)}px;z-index:2;${discMask};${discAnim("pt-disc")}}` +
      `html::view-transition-image-pair(${name}){inset:auto;left:${left.toFixed(1)}px;top:${top.toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;` +
      `transform-origin:${(cx - left).toFixed(1)}px ${(cy - top).toFixed(1)}px;${extra}}`;

    const taken: Element[] = [];
    const inside = (el: Element) => taken.some((t) => t.contains(el) || el.contains(t));
    let globalLine = 0;
    let textEnd = 0;

    for (const el of Array.from(document.querySelectorAll("main h1, main h2, main h3, main h4, main p"))) {
      if (taken.length >= MAX_TEXT) break;
      if (!(el.textContent || "").trim() || inside(el)) continue;
      const r = el.getBoundingClientRect();
      if (!visible(el, r, W, H) || !unclipped(el, r)) continue;
      const sel = pathOf(el);
      const lines = sel ? linesOf(el) : [];
      if (!sel || !lines.length) continue;
      const name = `pt-text-${taken.length}`;
      taken.push(el);
      const starts = lines.map(() => S(TEXT_START + LINE_STAGGER * globalLine++));
      const end = starts[starts.length - 1] + S(LINE_MS) + S(120);
      textEnd = Math.max(textEnd, end);
      // The lines wipe in top to bottom: the box's lower edge sits at the revealed share of the block (each
      // line easing in over LINE_MS, LINE_STAGGER apart) while the content is held in place. The incoming
      // lens is reproduced on the block as the magnification it gets about the disc centre at its own
      // distance, m = 1 / (1 − k·(1 − ρ²)), with radial colour fringes of 12 % of that displacement (the
      // lens's chromatic aberration), and the block leans while it settles.
      const total = lines.reduce((s, l) => s + l.bottom - l.top, 0) || 1;
      const bx = r.left + r.width / 2 - cx;
      const by = r.top + r.height / 2 - cy;
      const dist = Math.hypot(bx, by) || 1;
      const steps = 40;
      const wipe: string[] = [];
      const lean: string[] = [];
      const fringe: string[] = [];
      for (let i = 0; i <= steps; i++) {
        const t = (end * i) / steps;
        const shown = lines.reduce((s, l, li) => s + (l.bottom - l.top) * outEase(clamp01((t - starts[li]) / S(LINE_MS))), 0) / total;
        const d = ((r.height + PAD) * (1 - shown)).toFixed(2);
        const settle = 1 - outEase(clamp01((t - starts[0]) / (end - starts[0])));
        // where the lens shows the block: content at q (lens radii from the centre) appears at ρ with
        // ρ − k·ρ·(1 − ρ²) = q, magnified ρ/q across and 1 / (1 − k·(1 − 3ρ²)) along the radius
        const k = !LITE && t < S(LENS_MS) ? LENS_K0 * Math.pow(1 - t / S(LENS_MS), LENS_POW) : 0;
        const R = Math.max(1, speed * t);
        const q = dist / R;
        let rho = q;
        if (k > 0 && q < 1) {
          for (let n = 0; n < 8; n++) rho -= (rho - k * rho * (1 - rho * rho) - q) / (1 - k * (1 - 3 * rho * rho));
          rho = Math.min(1, Math.max(q, rho));
        }
        const across = q > 0 ? rho / q : 1;
        const size = k > 0 && q < 1 ? Math.sqrt(across / (1 - k * (1 - 3 * rho * rho))) : 1;
        const tx = ((across - 1) * bx).toFixed(2);
        const ty = ((across - 1) * by).toFixed(2);
        const at = ((100 * i) / steps).toFixed(2);
        wipe.push(`${at}%{transform:translateY(-${d}px)}`);
        lean.push(`${at}%{transform:translateY(${d}px) translate(${tx}px, ${ty}px) scale(${size.toFixed(4)}) skewX(${(-LEAN * settle).toFixed(2)}deg)}`);
        if (!LITE) {
          const f = 0.12 * (rho - q) * R;
          const fx = (f * bx) / dist;
          const fy = (f * by) / dist;
          const a = (0.6 * Math.min(1, f / 1.5)).toFixed(3);
          const shadow = (x: number, y: number, rgb: string) => `drop-shadow(${x.toFixed(2)}px ${y.toFixed(2)}px rgb(${rgb} / ${a}))`;
          fringe.push(`${at}%{filter:${shadow(fx, fy, "255 190 0")} ${shadow(-fx, -fy, "0 120 255")}}`);
        }
      }
      const dur = `${end.toFixed(0)}ms linear both`;
      css += `${sel}{view-transition-name:${name};view-transition-class:pt-text}`;
      css += namedDisc(name, r.left - PAD, r.top - PAD, r.width + 2 * PAD, r.height + 2 * PAD, `mask-image:linear-gradient(#000,#000);mask-repeat:no-repeat;${discAnim("pt-undisc")},${name}-wipe ${dur}`);
      css += `html::view-transition-new(${name}){inset:auto;left:${PAD}px;top:${PAD}px;width:${r.width.toFixed(1)}px;height:${r.height.toFixed(1)}px;animation:${name}-lean ${dur}${LITE ? "" : `,${name}-fringe ${dur}`}}`;
      css += `@keyframes ${name}-wipe{${wipe.join("")}}@keyframes ${name}-lean{${lean.join("")}}${LITE ? "" : `@keyframes ${name}-fringe{${fringe.join("")}}`}`;
    }

    const mediaCandidates = Array.from(document.querySelectorAll("main img, main video, main canvas"))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ el, r }) => r.width * r.height >= 0.008 * W * H && visible(el, r, W, H) && !inside(el) && unclipped(el, r))
      .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
    let media = 0;
    for (const { el, r } of mediaCandidates) {
      if (media >= MAX_MEDIA) break;
      if (inside(el)) continue;
      const sel = pathOf(el);
      if (!sel) continue;
      const name = `pt-media-${media++}`;
      taken.push(el);
      css += `${sel}{view-transition-name:${name};view-transition-class:pt-media}`;
      css += namedDisc(name, r.left, r.top, r.width, r.height, discAnim("pt-undisc"));
      css += `html::view-transition-new(${name}){animation:pt-fade ${S(MEDIA_MS).toFixed(0)}ms cubic-bezier(0.25, 0.46, 0.45, 0.94) ${S(MEDIA_START).toFixed(0)}ms both}`;
    }
    if (media) css += "@keyframes pt-fade{from{opacity:0}to{opacity:1}}";

    style.textContent = css;
    document.head.appendChild(style);
    // the lens filters sit in their own sheet, disabled once the lens has settled
    const lensStyle = document.createElement("style");
    if (!LITE) {
      lensStyle.textContent = "html::view-transition-image-pair(root){filter:url(#pt-lens-in)}html::view-transition-image-pair(pt-out){filter:url(#pt-lens-out)}";
      document.head.appendChild(lensStyle);
      document.body.appendChild(svg);
    }

    // lens decay, on the transition's own clock (the disc animation); after a long main-thread task it
    // eases to the current strength instead of jumping
    let raf = 0;
    let clock: Animation | null = null;
    let shown = LENS_K0;
    let lastT = 0;
    const tick = () => {
      const t = clock ? Number(clock.currentTime) || 0 : 0;
      if (t >= lensEnd || (clock && clock.playState === "finished")) {
        lensStyle.disabled = true;
        return;
      }
      const target = t < S(LENS_MS) ? LENS_K0 * Math.pow(1 - t / S(LENS_MS), LENS_POW) : 0;
      shown = t - lastT > 40 ? shown + (target - shown) * 0.4 : target;
      lastT = t;
      lensIn(lensScale(shown));
      raf = requestAnimationFrame(tick);
    };

    vt.ready
      .then(() => {
        if (LITE) return;
        clock =
          document
            .getAnimations()
            .find((a) => (a as CSSAnimation).animationName === "pt-disc" && (a.effect as KeyframeEffect | null)?.pseudoElement === "::view-transition-image-pair(root)") || null;
        raf = requestAnimationFrame(tick);
      })
      .catch(() => {});

    vt.finished
      .finally(() => {
        cancelAnimationFrame(raf);
        svg.remove();
        style.remove();
        lensStyle.remove();
      })
      .catch(() => {});
  };

  window.addEventListener("pagereveal", (e: PageRevealEvent) => {
    root.classList.remove("pt-leaving");
    const vt = e.viewTransition;
    if (!vt) {
      settle();
      return;
    }
    const done = settle;
    vt.finished.finally(done).catch(() => {});
    if (reduced.matches) {
      vt.skipTransition();
      return;
    }
    // lets page motion that the transition already performs (hero word reveal) stand down. A stylesheet in
    // <head> rather than a class on <html>: React hydrates after this runs and reports any attribute it did
    // not render (a mismatch warning in development), but leaves unknown nodes in <head> alone.
    const arrived = document.createElement("style");
    arrived.id = "pt-arrived";
    arrived.textContent = ".sr-word{animation:none!important}";
    document.head.appendChild(arrived);
    run(vt);
  });
}
