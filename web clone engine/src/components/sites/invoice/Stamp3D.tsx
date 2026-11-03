import type { CSSProperties, ReactNode } from "react";
import { DIE, HANDLE, SOLE } from "./stamp-geometry";

interface Part { w: number; h: number; z0: number; z1: number; radius: number }
/** The colours of the stamp's body (the site's grey tray, from its lowest slice to its highest) and of its rubber. */
const handleTone = (t: number) => `hsl(240 6% ${70 + t * 26}%)`;
const soleTone = (t: number) => `hsl(240 6% ${4 + t * 13}%)`;
const dieTone = () => "hsl(240 5% 9%)";

/**
 * A solid made of slices: each slice is the same rounded rectangle, set a little higher than the one below, so under the camera's perspective
 * the pile reads as one smooth extruded body with real sides. Only the top slice has a face of its own.
 */
function Slices({ part, count, tone }: { part: Part; count: number; tone: (t: number) => string }) {
  return <>{Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 1 : index / (count - 1), z = part.z0 + (part.z1 - part.z0) * t;
    const style: CSSProperties = { width: part.w, height: part.h, marginLeft: -part.w / 2, marginTop: -part.h / 2, borderRadius: part.radius, background: tone(t), transform: `translateZ(${z.toFixed(2)}px)` };
    return <i key={index} className="stp3d__slice" data-top={index === count - 1 ? "" : undefined} style={style} />;
  })}</>;
}

/**
 * The rubber stamp: a die that prints, a wide black rubber sole, and a housing whose top face is the date picker (`face`). It stands at the origin of
 * its own space (x right, y down the paper, z up from it); the scene places it in the paper's camera. `refFor` hands the stage the elements it
 * moves on every frame.
 */
export function Stamp3D({ refFor, face }: { refFor: (name: string) => (element: HTMLElement | null) => void; face: ReactNode }) {
  return <div className="stp3d" ref={refFor("stamp")}>
    <div className="stp3d__part" aria-hidden="true">
      <Slices part={DIE} count={2} tone={dieTone} />
      <Slices part={SOLE} count={6} tone={soleTone} />
    </div>
    <div className="stp3d__part" ref={refFor("handle")}>
      <div className="stp3d__part" aria-hidden="true"><Slices part={HANDLE} count={16} tone={handleTone} /></div>
      <div className="stp3d__top" style={{ width: HANDLE.w, height: HANDLE.h, marginLeft: -HANDLE.w / 2, marginTop: -HANDLE.h / 2, borderRadius: HANDLE.radius, transform: `translateZ(${HANDLE.z1 + 0.4}px)` }}>{face}</div>
    </div>
  </div>;
}
