"use client";

import { useEffect } from "react";
import { COVER, gridFor, loadingCell, origins, presets, revealCell, revealDuration, type Origin, type Preset, type Wave } from "./glyph-field";

/** The region the cover sits over: the workspace's content panel. */
export const REGION_SELECTOR = ".ui-as-main";

/** Where the person last pressed or moved the pointer; the wave of a reveal starts there (clamped into the region). */
const pointer = { x: -1, y: -1 };
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", event => { pointer.x = event.clientX; pointer.y = event.clientY; }, { capture: true, passive: true });
}

/** What the page's own settings say about the effect: the look, and whether any movement is wanted at all. */
export function effectSettings(): { preset: Preset; enabled: boolean } {
  if (typeof document === "undefined") return { preset: "decode", enabled: false };
  const host = document.querySelector<HTMLElement>(".crm-page");
  const chosen = host?.dataset.asciiPreset;
  const off = chosen === "off" || host?.dataset.uiMotion === "off" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return { preset: (presets as readonly string[]).includes(chosen ?? "") ? chosen as Preset : "decode", enabled: !off };
}

function paintOf(region: HTMLElement) {
  let node: HTMLElement | null = region, background = "";
  while (node && !background) {
    const value = getComputedStyle(node).backgroundColor;
    if (value && !/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)|transparent/.test(value)) background = value;
    node = node.parentElement;
  }
  background ||= "rgb(255, 255, 255)";
  const ink = getComputedStyle(region).color || "rgb(30, 30, 30)";
  const [r, g, b] = (background.match(/[\d.]+/g) ?? [255, 255, 255]).map(Number);
  const dark = (0.2126 * r + 0.7152 * g + 0.0722 * b) < 128;
  return { background, ink, accent: dark ? "#8aa8ff" : "#3b64e8", dark };
}

export interface CoverOptions { mode: "loading" | "reveal"; speed?: number; limitMs?: number; onDone?: () => void }

/**
 * Puts the canvas that covers the region on the page and returns the function that takes it off (null if there is nothing to cover or the
 * person has switched the effect off). `loading` keeps the field moving until it is taken off (or `limitMs`); `reveal` plays the dissolve
 * once and calls `onDone`. The canvas is not part of the accessibility tree and never takes pointer events, so it cannot trap a click or
 * hide the page from a screen reader. It draws nothing from the page and makes no network request.
 */
export function mountCover({ mode, speed = 1, limitMs, onDone }: CoverOptions): (() => void) | null {
  const region = document.querySelector<HTMLElement>(REGION_SELECTOR);
  const { preset, enabled } = effectSettings();
  // One loading field at a time (several skeletons can be on screen while a page boots).
  if (!region || !enabled || (mode === "loading" && document.querySelector('[data-ascii-cover="loading"]'))) return null;

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.setAttribute("data-ascii-cover", mode);
  canvas.setAttribute("data-ascii-preset", preset);
  Object.assign(canvas.style, { position: "fixed", zIndex: "30", pointerEvents: "none", userSelect: "none" });
  const context = canvas.getContext("2d");
  if (!context) return null;
  document.body.appendChild(canvas);

  const paint = paintOf(region);
  let width = 0, height = 0, grid = gridFor(1, 1), wave: Wave = { origin: "center", width: 1, height: 1 };
  const origin: Origin = pointer.x >= 0 ? "cursor" : "center";
  const place = () => {
    const box = region.getBoundingClientRect();
    width = Math.max(1, Math.round(box.width)); height = Math.max(1, Math.round(box.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    Object.assign(canvas.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${width}px`, height: `${height}px`, borderRadius: getComputedStyle(region).borderRadius });
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    grid = gridFor(width, height);
    wave = { origin, width, height, x: pointer.x - box.left, y: pointer.y - box.top };
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.font = `${Math.round(grid.cellH * 0.78)}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    context.textAlign = "center"; context.textBaseline = "middle";
  };
  place();
  const observer = new ResizeObserver(place);
  observer.observe(region);

  const total = mode === "reveal" ? revealDuration(speed) : Infinity;
  const limit = limitMs ?? (mode === "loading" ? 12000 : total);
  let begin = 0, last = -1000, frame = 0, finished = false;
  const remove = () => { finished = true; cancelAnimationFrame(frame); observer.disconnect(); canvas.remove(); };
  const finish = () => { if (finished) return; remove(); onDone?.(); };

  const draw = (now: number) => {
    if (finished) return;
    begin ||= now;
    const t = now - begin;
    if (t >= limit || t >= total) { finish(); return; }
    frame = requestAnimationFrame(draw);
    // A hidden tab, or a field that only breathes, does not need every frame.
    if (document.hidden || (mode === "loading" && now - last < 33)) return;
    last = now;
    context.clearRect(0, 0, width, height);
    const { cols, rows, cellW, cellH } = grid;
    if (mode === "loading") { context.globalAlpha = COVER; context.fillStyle = paint.background; context.fillRect(0, 0, width, height); }
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = mode === "loading" ? loadingCell(preset, col, row, grid, wave, t) : revealCell(preset, col, row, grid, wave, speed, t);
        if (mode === "reveal" && cell.cover > 0.004) { context.globalAlpha = cell.cover; context.fillStyle = paint.background; context.fillRect(col * cellW, row * cellH, cellW + 0.6, cellH + 0.6); }
        if (cell.glyph && cell.ink > 0.01) {
          context.globalAlpha = cell.ink * 0.6; context.fillStyle = cell.accent ? paint.accent : paint.ink;
          context.fillText(cell.glyph, col * cellW + cellW / 2, row * cellH + cellH / 2);
        }
      }
    }
    context.globalAlpha = 1;
  };
  frame = requestAnimationFrame(draw);
  return remove;
}

/** The cover as an element of the tree: it is on the page while this is mounted. */
export function GlyphCover(options: CoverOptions) {
  const { mode, speed, limitMs, onDone } = options;
  useEffect(() => {
    const remove = mountCover({ mode, speed, limitMs, onDone });
    if (!remove) onDone?.();
    return remove ?? undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, speed, limitMs]);
  return null;
}

export { origins };
