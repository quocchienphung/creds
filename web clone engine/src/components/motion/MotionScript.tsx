import { scrollRevealRuntime } from "./scrollRevealRuntime";

/** Inlined so section blocks below the fold are prepared before the visitor scrolls to them. */
export function MotionScript() {
  return <script dangerouslySetInnerHTML={{ __html: `(${scrollRevealRuntime.toString()})();` }} />;
}
