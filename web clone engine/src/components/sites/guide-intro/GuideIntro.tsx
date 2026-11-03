"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AgentCursor, AgentPresence } from "../affectui-agent-cursors/AgentCursor";
import { frameStyle, frameAttribute } from "./frame-style";
import { notesLayoutKey } from "./ArtworkNotes";
import { ArtworkNotes } from "./ArtworkNotes";
import { AgentComments } from "./AgentComments";
import { FrameCraft } from "./FrameCraft";
import { LaserSignature } from "./LaserSignature";
import { SignatureEngraver } from "./engraver";
import { prepareStudioMaterials } from "./studio-materials";
import { StudioPainter } from "./painter";
import { ARTWORK_SRC, artistAgents, doingAt, phaseAt, STUDIO_DURATION, WORKSPACE_HREF, PAINT_END, FRAME_START, FRAME_END, ENGRAVE_START, ENGRAVE_END, progressBetween } from "./studio-timeline";
import "../affectui-fonts.css";
import "./guide-intro.css";

const StudioCursor = memo(AgentCursor);
const StudioPresence = memo(AgentPresence);
const StaticFrame = memo(FrameCraft);

function positionWriters(page: HTMLElement) {
  const bounds = page.getBoundingClientRect();
  const contentRight = page.querySelector(".guide-intro__document")?.getBoundingClientRect().right ?? bounds.right;
  // Read both carets before writing cursor styles: no read/write/read layout flushes.
  const targets = ([['left', 'writer'], ['right', 'researcher']] as const).map(([side, id]) => ({
    side,
    node: page.querySelector<HTMLElement>(`[data-agent="${id}"]`),
    at: page.querySelector(`[data-writing-anchor="${side}"]`)?.getBoundingClientRect(),
  }));
  for (const {side, node, at} of targets) {
    if (!node || !at) continue;
    const x = at.left - bounds.left, y = at.top - bounds.top + 3;
    frameAttribute(node, "data-target-x", String(x)); frameAttribute(node, "data-target-y", String(y));
    frameAttribute(node, "data-edge", x > contentRight - bounds.left - 150 ? "right" : "left");
    frameAttribute(node, "data-bottom", String((bounds.width < 520 && side === "left") || y > bounds.height - 70));
  }
}

export function GuideIntro() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [following, setFollowing] = useState<string | null>(null);
  const [materials, setMaterials] = useState<{frame: string; signature: string}>();
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const clock = useRef({ elapsed: 0, paused: false, reduced: false, interacting: false });
  const phase = phaseAt(elapsed).id;
  const holdForComment = useCallback((active: boolean) => { clock.current.interacting = active; }, []);


  const textLayout = notesLayoutKey("left", elapsed) + notesLayoutKey("right", elapsed);
  // Measure only after actual text/caret changes, never for each animation frame.
  useLayoutEffect(() => {
    if (root.current) positionWriters(root.current);
  }, [textLayout]);

  useEffect(() => {
    const art = new Image();
    const preparedMaterials = prepareStudioMaterials();
    void preparedMaterials.catch(() => {}); // The load handler below reports preparation failures with Retry.
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motionChange = () => { setReduced(preference.matches); clock.current.reduced = preference.matches; };
    preference.addEventListener("change", motionChange);
    let painter: StudioPainter | undefined, frame = 0, previous = 0, disposed = false;
    let published = -100, resizeNeeded = true, viewportWidth = 1, prefetched = false;
    let artBounds = { left: 0, top: 0, width: 1, height: 1 };
    let frameTransform: DOMMatrix | null = null, frameLength = 1, frameScreenLength = 1;
    let frameRoute: { local: number; screen: number; x: number; y: number }[] = [];
    const allNodes = Array.from(root.current?.querySelectorAll<HTMLElement>(".artist-cursor") ?? []);
    const pointerNodes = allNodes.map(node => node.querySelector<SVGElement>(".artist-cursor__pointer"));
    const nodes = allNodes.slice(0, 4), writers = allNodes.slice(4, 6), framer = allNodes[6];
    const engraverNode = allNodes[7];
    const signature = root.current?.querySelector<HTMLElement>(".laser-signature");
    const engraving = signature ? new SignatureEngraver(signature) : undefined;
    const strokes = Array.from(root.current?.querySelectorAll<SVGPathElement>("[data-frame-stroke]") ?? []);
    const frameClip = root.current?.querySelector<SVGPathElement>("[data-frame-clip]");
    const frameTexture = root.current?.querySelector<SVGImageElement>("[data-frame-texture]");
    const writerPoints = writers.map(() => ({ x: Number.NaN, y: Number.NaN }));
    const resize = new ResizeObserver(() => {
      resizeNeeded = true;
      if (root.current) positionWriters(root.current);
    });
    if (root.current) resize.observe(root.current);
    if (canvas.current) resize.observe(canvas.current);
    const documentPanel = root.current?.querySelector(".guide-intro__document");
    const cursorLayer = root.current?.querySelector<HTMLElement>(".guide-intro__cursors");
    const cursorPlane = root.current?.querySelector<HTMLElement>(".guide-intro__cursor-plane");
    const scrolled = () => { resizeNeeded = true; if (root.current) positionWriters(root.current); };
    documentPanel?.addEventListener("scroll", scrolled, { passive: true });
    const visibility = () => { previous = 0; };
    document.addEventListener("visibilitychange", visibility);

    function measure() {
      if (!root.current || !canvas.current || !painter) return;
      const outer = root.current.getBoundingClientRect(), inner = canvas.current.getBoundingClientRect();
      viewportWidth = outer.width;
      artBounds = { left: inner.left - outer.left, top: inner.top - outer.top, width: inner.width, height: inner.height };
      painter.resize(inner.width, inner.height);
      engraving?.measure(outer);
      frameTransform = strokes[0]?.getScreenCTM() ?? null;
      if (frameTransform) { frameTransform.e -= outer.left; frameTransform.f -= outer.top; }
      if (frameTransform) {
        frameLength = strokes[0].getTotalLength();
        const first = strokes[0].getPointAtLength(0);
        frameRoute = [{ local: 0, screen: 0, x: first.x, y: first.y }];
        let previousPoint = first.matrixTransform(frameTransform);
        let distance = 0;
        for (let i = 1; i <= 720; i++) {
          const local = i / 720 * frameLength;
          const original = strokes[0].getPointAtLength(local);
          const point = original.matrixTransform(frameTransform);
          distance += Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y);
          frameRoute.push({ local, screen: distance, x: original.x, y: original.y }); previousPoint = point;
        }
        frameScreenLength = distance;
        for (const stroke of strokes) frameStyle(stroke, "stroke-dasharray", String(frameLength));
      }
      const visible = documentPanel?.getBoundingClientRect();
      if (visible && cursorLayer && cursorPlane) {
        frameStyle(cursorLayer,"left",`${visible.left-outer.left}px`);
        frameStyle(cursorLayer,"top",`${visible.top-outer.top}px`);
        frameStyle(cursorLayer,"width",`${visible.width}px`);
        frameStyle(cursorLayer,"height",`${visible.height}px`);
        frameStyle(cursorPlane,"left",`${outer.left-visible.left}px`);
        frameStyle(cursorPlane,"top",`${outer.top-visible.top}px`);
      }
      resizeNeeded = false;
    }

    function tick(now: number) {
      if (disposed || !painter || !root.current) return;
      const delta = previous ? Math.min(64, now - previous) : 16;
      if (previous && !clock.current.paused && !clock.current.interacting && !document.hidden) clock.current.elapsed += now - previous;
      previous = now;
      if (resizeNeeded) measure();
      const t = Math.min(STUDIO_DURATION, clock.current.elapsed);
      if (!prefetched && t >= 14000) { prefetched = true; router.prefetch(WORKSPACE_HREF); }
      clock.current.reduced = preference.matches;
      const rendered = painter.render(preference.matches ? PAINT_END : Math.min(t, PAINT_END));
      const engraved = engraving?.render(t, preference.matches);
      if (t - published >= 32 || t >= STUDIO_DURATION) {
        published = t;
        setElapsed(preference.matches ? PAINT_END : t);
      }
      frameAttribute(root.current, "data-elapsed", String(Math.round(t)));
      frameAttribute(root.current, "data-reduced", String(preference.matches));
      frameAttribute(root.current, "data-leaving", String(t >= 14700));
      frameAttribute(root.current, "data-interacting", String(clock.current.interacting));
      const frameTime = preference.matches ? 1 : progressBetween(t, FRAME_START, FRAME_END);
      // Gentle launch and landing; the rounded path carries momentum through each corner.
      const frameProgress = frameTime * frameTime * (3 - 2 * frameTime);
      const distance = frameProgress * frameScreenLength;
      const routeIndex = Math.max(1, frameRoute.findIndex(point => point.screen >= distance));
      const from = frameRoute[routeIndex - 1], to = frameRoute[routeIndex];
      const localDistance = from && to ? from.local + (to.local - from.local) * (distance - from.screen) / Math.max(.001, to.screen - from.screen) : 0;
      const fraction = from && to ? (distance - from.screen) / Math.max(.001, to.screen - from.screen) : 0;
      const frameHead = from && to ? new DOMPoint(from.x + (to.x - from.x) * fraction, from.y + (to.y - from.y) * fraction) : undefined;
      if (frameClip && frameTexture && frameHead) {
        frameAttribute(frameTexture, "clip-path", frameProgress >= 1 ? "none" : "url(#studio-frame-reveal)");
        if (frameProgress > 0 && frameProgress < 1) {
          const dx = frameHead.x - 500, dy = frameHead.y - 400;
          let angle = Math.atan2(dy, dx) + Math.PI / 2;
          if (angle < 0) angle += Math.PI * 2;
          const corners = [[1000,0],[1000,800],[0,800],[0,0]].filter(([x,y]) => {
            let at = Math.atan2(y-400,x-500)+Math.PI/2;
            if(at<0)at+=Math.PI*2;
            return at <= angle;
          });
          const reach = Math.min(500/Math.max(.001,Math.abs(dx)),400/Math.max(.001,Math.abs(dy)));
          frameAttribute(frameClip,"d",`M500 400L500 0${corners.map(([x,y])=>`L${x} ${y}`).join("")}L${(500+dx*reach).toFixed(2)} ${(400+dy*reach).toFixed(2)}Z`);
        } else if (frameProgress === 0) frameAttribute(frameClip,"d","M0 0");
      }
      frameAttribute(root.current, "data-frame-progress", frameProgress.toFixed(4));
      for (const stroke of strokes) {
        frameStyle(stroke, "opacity", frameProgress > 0 ? "1" : "0");
        frameStyle(stroke, "stroke-dashoffset", String(frameLength - localDistance));
        // A solid closed mask seals every joint, including the start/end join.
        frameStyle(stroke, "stroke-dasharray", frameProgress >= 1 ? "none" : String(frameLength));
      }
      for (const [i, node] of nodes.entries()) {
        const point = rendered.points[i];
        const arrival = progressBetween(t, 120 + i * 70, 330 + i * 70);
        const remaining = (1 - arrival) ** 3;
        const x = artBounds.left + point.x * artBounds.width + remaining * (i % 2 ? .18 : -.18) * artBounds.width;
        const y = artBounds.top + point.y * artBounds.height - remaining * artBounds.height * .14 - Math.sin(arrival * Math.PI) * artBounds.height * .025;
        frameStyle(node, "transform", `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`);
        frameStyle(node, "--arrival", String(arrival));
        if (pointerNodes[i]) frameStyle(pointerNodes[i], "transform", `rotate(${(Math.sin(t / 550 + i) * 12 + Math.cos(t / 2100 + i) * 6).toFixed(2)}deg) scale(${(.9 + arrival * .1).toFixed(3)})`);
        frameAttribute(node, "data-x", String(point.x)); frameAttribute(node, "data-y", String(point.y));
        frameAttribute(node, "data-edge", x < 120 ? "left" : x > viewportWidth - 120 || i % 2 === 0 ? "right" : "left");
        frameAttribute(node, "data-bottom", "false");
        frameStyle(node, "opacity", String(preference.matches ? 0 : Math.min(progressBetween(t, 120 + i * 70, 200 + i * 70), Math.max(0, (13900 - t) / 650))));
      }
      for (const [i, node] of writers.entries()) {
        const start = i === 0 ? 775 : 1240;
        frameStyle(node, "opacity", String(preference.matches ? 0 : Math.min(progressBetween(t, start, start + 85), Math.max(0, (13700 - t) / 650))));
        frameStyle(node, "--arrival", String(progressBetween(t, start, start + 150)));
        const x = Number(node.dataset.targetX), y = Number(node.dataset.targetY);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const point = writerPoints[i], blend = 1 - Math.exp(-delta / 25);
        point.x = Number.isFinite(point.x) ? point.x + (x - point.x) * blend : x - 32;
        point.y = Number.isFinite(point.y) ? point.y + (y - point.y) * blend : y - 18;
        frameStyle(node, "transform", `translate3d(${point.x.toFixed(2)}px,${point.y.toFixed(2)}px,0)`);
      }
      if (framer && frameTransform && strokes[0]) {
        const point = (frameHead ?? strokes[0].getPointAtLength(localDistance)).matrixTransform(frameTransform);
        const arrival = progressBetween(t, FRAME_START - 180, FRAME_START);
        const x = point.x - (1 - arrival) ** 3 * 40, y = point.y - (1 - arrival) ** 3 * 28;
        frameStyle(framer, "transform", `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`);
        frameStyle(framer, "--arrival", String(arrival));
        if (pointerNodes[6]) frameStyle(pointerNodes[6], "transform", `rotate(${(Math.sin(t / 580) * 5 * Math.sin(frameTime * Math.PI)).toFixed(2)}deg)`);
        frameStyle(framer, "opacity", String(preference.matches ? 0 : Math.min(progressBetween(t, FRAME_START - 180, FRAME_START - 100), 1 - progressBetween(t, FRAME_END, 13900))));
        frameAttribute(framer, "data-edge", x > viewportWidth - 160 ? "right" : "left");
        frameAttribute(framer, "data-bottom", "false");
      }
      if (engraverNode && engraved) {
        const arrival = progressBetween(t, ENGRAVE_START - 320, ENGRAVE_START - 100);
        const x = engraved.x - (1 - arrival) ** 3 * 64, y = engraved.y + (1 - arrival) ** 3 * 24;
        frameStyle(engraverNode, "transform", `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`);
        frameStyle(engraverNode, "--arrival", String(arrival));
        frameStyle(engraverNode, "opacity", String(preference.matches ? 0 : Math.min(progressBetween(t, ENGRAVE_START - 320, ENGRAVE_START - 240), 1 - progressBetween(t, ENGRAVE_END, 14200))));
        frameAttribute(engraverNode, "data-edge", x > viewportWidth - 140 ? "right" : "left");
      }
      if (t >= STUDIO_DURATION && !clock.current.paused && !clock.current.interacting) { router.replace(WORKSPACE_HREF); return; }
      frame = requestAnimationFrame(tick);
    }

    art.onload = async () => {
      if (disposed || !canvas.current || !root.current) return;
      try {
        const textures = await preparedMaterials;
        if (disposed) return;
        setMaterials(textures);
        clock.current.elapsed = 0;
        motionChange();
        painter = new StudioPainter(canvas.current, art);
        measure(); painter.render(preference.matches ? PAINT_END : 0);
        setStatus("ready"); frame = requestAnimationFrame(tick);
      } catch { setStatus("error"); }
    };
    art.onerror = () => { if (!disposed) setStatus("error"); };
    art.src = ARTWORK_SRC;
    return () => { disposed = true; cancelAnimationFrame(frame); resize.disconnect(); documentPanel?.removeEventListener("scroll", scrolled); document.removeEventListener("visibilitychange", visibility); preference.removeEventListener("change", motionChange); painter?.dispose(); art.onload = null; art.onerror = null; };
  }, [attempt, router]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.code === "Escape") router.replace(WORKSPACE_HREF);
      if (event.code === "Space" && event.target === document.body) {
        event.preventDefault(); clock.current.paused = !clock.current.paused; setPaused(clock.current.paused);
      }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); };
  }, [router]);

  return <main ref={root} className="guide-intro" data-ready={status === "ready"} data-phase={phase} data-paused={paused} aria-label="Agents painting The Starry Night and writing its story">
    <div className="guide-intro__sheet">
      <header className="guide-intro__bar">
        <div className="guide-intro__bar-left">
          <Link href={WORKSPACE_HREF} replace className="guide-intro__mark" aria-label="Skip intro and open the workspace" title="Skip intro">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>
          </Link>
          <Link href="/" replace prefetch={false} className="guide-intro__home" aria-label="Back to homepage"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg><span>Back to homepage</span></Link>
        </div>
        <StudioPresence agents={artistAgents} following={following} onFollow={setFollowing} done={elapsed >= ENGRAVE_END || reduced} />
      </header>
      <div className="guide-intro__document">
        <ArtworkNotes side="left" elapsed={elapsed} complete={elapsed >= STUDIO_DURATION} />
        <div className="guide-intro__artwork-stage">
        <figure className="guide-intro__artwork" data-painting-frame>
          <div className="guide-intro__paper">
            <canvas ref={canvas} className="guide-intro__canvas" role="img" aria-label="The Starry Night by Vincent van Gogh, progressively painted by four collaborating agents." />
          </div>
          <StaticFrame texture={materials?.frame} />
        </figure>
        <LaserSignature texture={materials?.signature} />
        </div>
        <ArtworkNotes side="right" elapsed={elapsed} complete={elapsed >= STUDIO_DURATION} />
        <div className="guide-intro__comment-space" data-comment-space="mobile" aria-hidden="true" />
        <AgentComments elapsed={elapsed} reduced={reduced} onInteractionChange={holdForComment} />
      </div>
    </div>
    <div className="guide-intro__cursors" aria-hidden="true"><div className="guide-intro__cursor-plane">{artistAgents.map(agent => <StudioCursor key={agent.id} agent={agent} doing={doingAt(agent.id, phase)} dimmed={Boolean(following && following !== agent.id)} typing={agent.id === "writer" || agent.id === "researcher"} />)}</div></div>
    <Link href={WORKSPACE_HREF} replace className="guide-intro__skip">Skip intro</Link>
    {status === "error" && <div className="guide-intro__error" role="alert"><p>The artwork couldn’t load.</p><button type="button" onClick={() => { setStatus("loading"); setAttempt(value => value + 1); }}>Retry artwork</button><Link href={WORKSPACE_HREF} replace>Continue to workspace</Link></div>}
    <p className="guide-intro__sr" role="status">{status === "loading" ? "Preparing artwork." : paused ? "Intro paused. Press Space to resume or Escape to skip." : "A fifteen-second painting intro. Eight agents paint, write, craft a gilded frame and laser engrave its signature. Hover or focus a comment to pause and reply. Press Space to pause or Escape to skip."}</p>
  </main>;
}
