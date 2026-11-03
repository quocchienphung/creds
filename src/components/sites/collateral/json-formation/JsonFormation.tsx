"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useCollateral } from "../CollateralProvider";
import { SectionHeader, FileChip } from "../shell";
import { Stepper, type StepSpec } from "../Stepper";
import { CollateralBoundary } from "../CollateralBoundary";
import { NeedWorkbook } from "../NeedWorkbook";
import { MappingStep } from "./steps/MappingStep";
import { GroupedPreview } from "./steps/GroupedPreview";
import { JsonPanel } from "./steps/JsonPanel";
import "../../affectui-settings/settings-reference.css";
import "../../affectui-settings/settings-overrides.css";
import "../collateral.css";

type Step = "mapping" | "preview" | "export";
const LABEL: Record<Step, string> = { mapping: "Mapping", preview: "Preview", export: "Export" };

/** Collateral › JSON formation: check the column mapping, look at the grouped result, then export the reporting JSON once every check holds. */
export function JsonFormation({ notify }: { workspaceId: string; notify: (message: string) => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const reduce = useReducedMotion();
  const { engine, json, setJsonActive } = useCollateral();
  const [step, setStep] = useState<Step>("mapping");
  const ready = engine.phase === "ready" && !!engine.result && !!engine.view;
  useEffect(() => { setJsonActive(true); return () => setJsonActive(false); }, [setJsonActive]);
  const steps: StepSpec<Step>[] = (Object.keys(LABEL) as Step[]).map(id => ({ id, label: LABEL[id], badge: id === "export" && json.plan?.ready ? <span className="cr-badge cr-badge--ok" aria-label={uiText("Ready")}>✓</span> : undefined }));
  const size = engine.result ? (engine.result.size < 1048576 ? `${Math.max(1, Math.round(engine.result.size / 1024))} KB` : `${(engine.result.size / 1048576).toFixed(1)} MB`) : "";
  return <LayoutGroup id="json-formation"><div className="ui-sb collateral">
    <SectionHeader trail={["Collateral", "JSON formation", LABEL[step]]} title="JSON formation" file={ready && engine.result ? <FileChip name={engine.result.fileName} detail={size} onClose={engine.close} /> : undefined} />
    {!ready ? <NeedWorkbook /> : <>
      <Stepper steps={steps} current={step} onChange={setStep} available={() => true} group="json" />
      <AnimatePresence mode="wait" initial={false}><motion.div className="ui-sb__body" id="json-panel" role="tabpanel" aria-labelledby={`json-tab-${step}`} key={step} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: reduce ? 0 : 0.16 }}>
        <CollateralBoundary resetKey={step}>
        {step === "mapping" && <MappingStep engine={engine} />}
        {step === "preview" && (json.plan ? <GroupedPreview plan={json.plan} engine={engine} notify={notify} /> : <p className="ui-sb-muted" role="status">{uiText("Building the preview…")}</p>)}
        {step === "export" && <JsonPanel engine={engine} state={json} notify={notify} />}
        </CollateralBoundary>
      </motion.div></AnimatePresence>
    </>}
  </div></LayoutGroup>;
}
