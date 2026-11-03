"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import {
  colorCanvas, defaultColors, defaultSpeed, floorHeights, floorPath, gradientLine, gradientStops, lightCanvas, lightScale, stillSeconds,
  type FloorColors,
} from "./gradient-floor-model";
import "./gradient-floor.css";

export type GradientFloorProps = {
  /** Gradient from the crest down. */
  colors?: FloorColors;
  /** Seconds per morph loop; 0 keeps the shape still. */
  speed?: number;
  /** Content drawn above the floor. */
  children?: ReactNode;
  className?: string;
};

const startHeights = floorHeights(0);

/**
 * A blurred colour gradient that glows up from the bottom edge: two layers (colour, and a white plus-lighter one)
 * whose peaks and valleys rise and fall against each other while both drift sideways. It scales with the width of its
 * container and stays anchored to the bottom; give the root a height. The morph runs in one requestAnimationFrame loop
 * that pauses while the floor is off screen; with reduced motion, or speed 0, one still pose is held.
 */
export function GradientFloor({ colors = defaultColors, speed = defaultSpeed, children, className }: GradientFloorProps) {
  const root = useRef<HTMLDivElement>(null);
  const colorPath = useRef<SVGPathElement>(null);
  const lightPath = useRef<SVGPathElement>(null);
  const gradientId = `gf-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const paint = (seconds: number) => {
      const heights = floorHeights(seconds, speed > 0 ? speed : defaultSpeed);
      colorPath.current?.setAttribute("d", floorPath(heights));
      lightPath.current?.setAttribute("d", floorPath(heights, lightScale));
    };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let visible = true;
    let elapsed = 0; // seconds of morph shown so far, kept across pauses so the shape never jumps
    let resumedAt = 0;
    const stop = () => { cancelAnimationFrame(frame); frame = 0; };
    const tick = (now: number) => {
      elapsed += (now - resumedAt) / 1000;
      resumedAt = now;
      paint(elapsed);
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      stop();
      element.toggleAttribute("data-paused", !visible);
      if (reduced.matches || speed <= 0) { paint(stillSeconds); return; }
      if (!visible) return;
      resumedAt = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(entries => {
      visible = entries[entries.length - 1].isIntersecting;
      sync();
    });
    observer.observe(element);
    reduced.addEventListener("change", sync);
    sync();
    return () => { stop(); observer.disconnect(); reduced.removeEventListener("change", sync); };
  }, [speed]);

  return <div ref={root} className={className ? `gf ${className}` : "gf"}>
    <div className="gf-layer gf-layer--color" aria-hidden="true">
      <div className="gf-bleed">
        <svg viewBox={`0 0 ${colorCanvas.width} ${colorCanvas.height}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradientId} x1={gradientLine.x} y1={gradientLine.y1} x2={gradientLine.x} y2={gradientLine.y2} gradientUnits="userSpaceOnUse">
              {colors.map((color, index) => <stop key={index} offset={gradientStops[index]} stopColor={color} />)}
            </linearGradient>
          </defs>
          <path ref={colorPath} d={floorPath(startHeights)} fill={`url(#${gradientId})`} />
        </svg>
      </div>
    </div>
    <div className="gf-layer gf-layer--light" aria-hidden="true">
      <div className="gf-bleed">
        <svg viewBox={`0 0 ${lightCanvas.width} ${lightCanvas.height}`} preserveAspectRatio="none">
          <path ref={lightPath} d={floorPath(startHeights, lightScale)} fill="#fff" fillOpacity={0.8} />
        </svg>
      </div>
    </div>
    {children !== undefined && <div className="gf-content">{children}</div>}
  </div>;
}
