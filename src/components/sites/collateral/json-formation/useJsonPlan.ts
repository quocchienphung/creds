"use client";

import { useEffect, useRef, useState } from "react";
import type { CollateralEngine } from "../useCollateralEngine";
import type { JsonPlan } from "./engine/json-session";
import { defaultReportOptions, type ReportMeta, type ReportOptions } from "./engine/report-options";

export const emptyMeta: ReportMeta = { KB001: "", KB002: "", KB003: "", KB004: "" };
/**
 * The state of the reporting JSON, re-checked (debounced) whenever the review or the form changes. The contact details live only in this
 * component's memory and in the worker: they are not stored and not copied from any file. Everything is tied to the open file, so another
 * file always starts from an empty form.
 */
export function useJsonPlan(engine: CollateralEngine, enabled: boolean) {
  const { jsonPlan, view, phase } = engine;
  const fileKey = engine.result?.fileHash ?? "";
  const ready = phase === "ready" && fileKey !== "" && enabled;
  const [metaBox, setMetaBox] = useState<{ key: string; meta: ReportMeta }>({ key: "", meta: emptyMeta });
  const [planBox, setPlanBox] = useState<{ key: string; plan: JsonPlan | null }>({ key: "", plan: null });
  const [options, setOptions] = useState<ReportOptions>(defaultReportOptions);
  const [checking, setChecking] = useState(false);
  const touchedDate = useRef<string>("");
  const meta = metaBox.key === fileKey ? metaBox.meta : emptyMeta;
  const plan = ready && planBox.key === fileKey ? planBox.plan : null;
  const setMeta = (next: ReportMeta) => { if (next.KB001 !== meta.KB001) touchedDate.current = fileKey; setMetaBox({ key: fileKey, meta: next }); };

  useEffect(() => {
    // No workbook, nothing to check (and no question to the worker, which would have nothing to answer with).
    if (!ready) return;
    let alive = true;
    const timer = setTimeout(() => {
      setChecking(true);
      void jsonPlan(meta, options).then(result => {
        if (!alive || !result) return;
        setPlanBox({ key: fileKey, plan: result.plan });
        // Offer the date the workbook itself carries, once, until the person types their own.
        if (touchedDate.current !== fileKey && result.plan.workbookDate && meta.KB001 === "") setMetaBox({ key: fileKey, meta: { ...meta, KB001: result.plan.workbookDate } });
      }).catch(() => { if (alive) setPlanBox({ key: fileKey, plan: null }); }).finally(() => { if (alive) setChecking(false); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [jsonPlan, meta, options, view, ready, fileKey]);

  return { meta, options, plan, checking, setOptions, setMeta };
}
export type JsonPlanState = ReturnType<typeof useJsonPlan>;
