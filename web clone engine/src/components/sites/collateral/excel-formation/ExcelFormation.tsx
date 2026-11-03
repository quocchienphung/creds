"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useCollateral } from "../CollateralProvider";
import { SectionHeader, FileChip } from "../shell";
import { Stepper, type StepSpec } from "../Stepper";
import { ImportStep } from "./steps/ImportStep";
import { CollateralBoundary } from "../CollateralBoundary";
import { OverviewStep } from "./steps/OverviewStep";
import { ReviewStep } from "./steps/ReviewStep";
import { ExportStep } from "./steps/ExportStep";
import { defaultFilters } from "./review-filters";
import { AutoRepairAction } from "./AutoRepairAction";
import "../../affectui-settings/settings-reference.css";
import "../../affectui-settings/settings-overrides.css";
import "../../storage/storage-dropzone.css";
import "../collateral.css";

type Step = "import" | "overview" | "review" | "export";
const LABEL: Record<Step, string> = { import: "Import", overview: "Overview", review: "Review and fix", export: "Export" };

/** Collateral › Excel formation: open a workbook, find its character and data errors, repair them by hand, export the corrected copy. */
export function ExcelFormation({ notify }: { workspaceId: string; notify: (message: string) => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const reduce = useReducedMotion();
  const { engine, filters, setFilters } = useCollateral();
  const [chosen, setStep] = useState<Step>("import");
  const ready = engine.phase === "ready" && !!engine.result && !!engine.view;
  const step: Step = ready ? chosen : "import";
  const available = (value: Step) => value === "import" || ready;

  // Import keeps the measured unfurl preview visible until the person continues.

  const review = (patch: Partial<typeof filters>) => { setFilters({ ...defaultFilters, ...(Object.keys(patch).length ? patch : { status: filters.status }) }); setStep("review"); };
  const steps: StepSpec<Step>[] = (Object.keys(LABEL) as Step[]).map(id => ({ id, label: LABEL[id], badge: id === "review" && ready && engine.view!.summary.blocking > 0 ? <span className="cr-badge" aria-label={uiText("{0} serious issues", [engine.view!.summary.blocking])}>{engine.view!.summary.blocking}</span> : undefined }));
  const size = engine.result ? (engine.result.size < 1048576 ? `${Math.max(1, Math.round(engine.result.size / 1024))} KB` : `${(engine.result.size / 1048576).toFixed(1)} MB`) : "";
  return <LayoutGroup id="excel-formation"><div className="ui-sb collateral cr-excel" data-upload-only={!ready}>
    <SectionHeader trail={["Collateral", "Excel formation", LABEL[step]]} title="Excel formation" file={ready && engine.result ? <><AutoRepairAction key={engine.result.fileHash} engine={engine} /><FileChip name={engine.result.fileName} detail={size} onClose={engine.close} /></> : undefined} />
    <AnimatePresence>{ready && <Stepper steps={steps} current={step} onChange={setStep} available={available} group="excel" reveal />}</AnimatePresence>
    {engine.failure && engine.phase === "ready" && <div className="cr-alert" role="alert"><span>{uiText(engine.failure.message)}</span><button type="button" className="ui-button" data-variant="ghost" data-size="sm" onClick={engine.clearFailure}><span className="ui-button__label">{uiText("Dismiss")}</span></button></div>}
    <AnimatePresence mode="wait" initial={false}><motion.div className="ui-sb__body" id="excel-panel" role={ready ? "tabpanel" : undefined} aria-labelledby={ready ? `excel-tab-${step}` : undefined} key={step} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: reduce ? 0 : 0.16 }}>
      <CollateralBoundary resetKey={step}>
      {step === "import" && <ImportStep engine={engine} onReview={() => setStep("overview")} />}
      {ready && step === "overview" && <OverviewStep engine={engine} onReview={review} />}
      {ready && step === "review" && <ReviewStep engine={engine} filters={filters} onFilters={setFilters} notify={notify} />}
      {ready && step === "export" && <ExportStep engine={engine} notify={notify} />}
      </CollateralBoundary>
    </motion.div></AnimatePresence>
  </div></LayoutGroup>;
}
