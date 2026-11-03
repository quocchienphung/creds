"use client";
import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";

/**
 * A compact trend line: the stroke draws in, the area beneath fades in, and the latest point is marked. The drawing replays when the values
 * change. Reduced motion shows it at rest (the stylesheet turns the animation off). With no activity it shows a flat baseline.
 */
export function Sparkline({ values, label }: { values: readonly number[]; label: string }) {
  const { t: uiText } = useWorkspaceI18n();
  const max = Math.max(...values, 0), flat = max === 0 || values.length < 2;
  const points = values.map((value, index) => ({ x: values.length < 2 ? 0 : (index / (values.length - 1)) * 100, y: flat ? 26 : 26 - (value / max) * 22 }));
  const line = points.length ? `M${points.map(point => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" L")}` : "M0 26 L100 26";
  const last = points.at(-1) ?? { x: 100, y: 26 };
  return <div className="sk-spark" data-flat={flat || undefined} role="img" aria-label={uiText("{0}: {1}", [label, values.join(", ") || "no data"])} key={values.join(",")}>
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      {!flat && <path className="sk-spark__area" d={`${line} L100 30 L0 30 Z`} />}
      <path className="sk-spark__line" d={line} pathLength={1} />
    </svg>
    {!flat && <span className="sk-spark__dot" style={{ left: `${last.x}%`, top: `${(last.y / 30) * 100}%` }} />}
  </div>;
}
