import type { CSSProperties, ReactNode } from "react";
import "./shimmer-loader.css";

/**
 * Skeleton blocks that share one soft light sweep, plus shimmering text for "Thinking…" states. Rebuilt from the public preview of
 * affectUI's Shimmer Loader (docs/research/shimmer-loader): the highlight is pinned to the viewport, so every block on the page shows
 * the same sweep traveling across them together. Skeletons are decoration (aria-hidden): put `aria-busy="true"` on the container that
 * is loading. With reduced motion they are static.
 */
export interface SkeletonProps {
  /** Numbers are px, strings any CSS length. Default "100%". */
  width?: number | string;
  /** Numbers are px. Default 12. */
  height?: number | string;
  /** Default 6. */
  radius?: number | string;
  /** A round shape that uses `width` for both sides, for example an avatar. */
  circle?: boolean;
  className?: string;
  style?: CSSProperties;
}

const length = (value: number | string) => typeof value === "number" ? `${value}px` : value;

export function Skeleton({ width = "100%", height = 12, radius = 6, circle = false, className, style }: SkeletonProps) {
  const size = circle ? length(width) : undefined;
  return <span className={`shm${className ? ` ${className}` : ""}`} aria-hidden="true" style={{
    width: length(width), height: size ?? length(height), borderRadius: circle ? "50%" : length(radius), ...style,
  }} />;
}

export interface ShimmerTextProps {
  children: ReactNode;
  /** Seconds for one pass of the highlight. Default 2. */
  duration?: number;
  className?: string;
}

/** A label the highlight runs through. It stays real text, so screen readers read it normally. */
export function ShimmerText({ children, duration = 2, className }: ShimmerTextProps) {
  return <span className={`shm-text${className ? ` ${className}` : ""}`} style={{ "--shm-text-dur": `${duration}s` } as CSSProperties}>{children}</span>;
}
