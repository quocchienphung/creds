import { HANDLE, SOLE } from "./stamp-geometry";
import { PAPER, paperTransform, stampTransform } from "./stamp-timeline";
import type { Pose } from "./stamp-timeline";

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * Writes a pose to the elements of the scene. Plain DOM work, outside React, because it runs on every frame. `mark` is the impression's tilt and ink.
 * Nothing here is cached as a bitmap: no `will-change`, so the browser draws the paper and the stamp at the size they are on the screen each frame.
 */
export function paintScene(el: Record<string, HTMLElement | null>, pose: Pose, now: number, bob: boolean, mark: { tilt: number; color: string }) {
  const set = (name: string, apply: (node: HTMLElement) => void) => { const node = el[name]; if (node) apply(node); };
  const stamp = pose.stamp, float = bob && stamp.lz > 100 ? Math.sin(now / 520) * 1.6 : 0, lz = stamp.lz + float;
  set("table", node => { node.style.opacity = String(pose.table); });
  set("paper", node => {
    node.style.transform = paperTransform(pose.paper);
    node.style.opacity = String(pose.paper.opacity);
    node.style.filter = pose.paper.blur > 0.05 ? `blur(${pose.paper.blur.toFixed(2)}px)` : "none";
  });
  // What the stamp does to the light on the paper: a wide soft shadow of the handle while it is high, a tight dark one of the die as it comes down
  const gate = clamp((pose.paper.rx - 8) / 20, 0, 1) * (stamp.visible ? 1 : 0), near = 1 - clamp(lz / 170, 0, 1);
  set("shadeHandle", node => {
    node.style.opacity = String((0.03 + 0.1 * near) * gate);
    node.style.filter = `blur(${(6 + lz * 0.12).toFixed(1)}px)`;
    node.style.transform = `translate(${(PAPER.w / 2 + stamp.lx + lz * 0.3 - HANDLE.w / 2).toFixed(1)}px, ${(PAPER.h / 2 + stamp.ly + lz * 0.36 - HANDLE.h / 2).toFixed(1)}px) scale(${(1 + lz / 800).toFixed(3)})`;
  });
  set("shadeDie", node => {
    node.style.opacity = String(0.55 * clamp(1 - lz / 45, 0, 1) ** 1.5 * gate);
    node.style.filter = `blur(${(0.6 + lz * 0.03).toFixed(1)}px)`;
    node.style.transform = `translate(${(PAPER.w / 2 + stamp.lx + lz * 0.13 - SOLE.w / 2).toFixed(1)}px, ${(PAPER.h / 2 + stamp.ly + lz * 0.17 - SOLE.h / 2).toFixed(1)}px)`;
  });
  set("mark", node => {
    const { opacity, blur, halo, swell } = pose.ink;
    node.style.opacity = String(opacity);
    node.style.transform = `rotate(${mark.tilt}deg) scale(${swell.toFixed(3)})`;
    node.style.filter = blur > 0.05 || halo > 0.01 ? `blur(${blur.toFixed(2)}px) drop-shadow(0 0 ${(halo * 6).toFixed(1)}px color-mix(in srgb, ${mark.color} ${(halo * 60).toFixed(0)}%, transparent))` : "none";
  });
  set("stamp", node => {
    node.style.transform = stampTransform({ ...stamp, lz });
    node.style.visibility = stamp.visible ? "visible" : "hidden";
  });
  // the handle sinks a little into the neck when the die is pushed on the paper
  set("handle", node => { node.style.transform = `translateZ(${(-stamp.press * 3.5).toFixed(2)}px)`; });
  set("chrome", node => {
    node.style.opacity = String(pose.chrome);
    node.style.filter = pose.chromeBlur > 0.05 ? `blur(${pose.chromeBlur.toFixed(1)}px)` : "none";
    node.style.pointerEvents = pose.chrome > 0.5 ? "auto" : "none";
    node.style.visibility = pose.chrome <= 0.001 ? "hidden" : "visible";
  });
  set("toast", node => { node.style.opacity = String(pose.toast); node.style.transform = `translate(-50%, ${((1 - pose.toast) * 8).toFixed(1)}px)`; node.style.pointerEvents = pose.toast > 0.6 ? "auto" : "none"; node.style.visibility = pose.toast <= 0.001 ? "hidden" : "visible"; });
  set("final", node => { node.style.opacity = String(pose.final); node.style.transform = `translate(-50%, ${((1 - pose.final) * 10).toFixed(1)}px)`; node.style.pointerEvents = pose.final > 0.6 ? "auto" : "none"; node.style.visibility = pose.final <= 0.001 ? "hidden" : "visible"; });
}
