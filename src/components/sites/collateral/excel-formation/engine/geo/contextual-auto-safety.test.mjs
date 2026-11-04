// Phase 1: `contextual_auto` was applied by SAFE_AUTO although the words that receive exactly that status were right only 62.5% of the time
// (held-out, synthetic corruption). It is now applied only when the calibration says that population reached the target.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recoverAddressText, UNCALIBRATED } from "./address-recovery.ts";
import { knowledge } from "./geo-fixture.mjs";

const shipped = JSON.parse(readFileSync(new URL("../../../../../../../public/data/vn-geo/calibration.json", import.meta.url), "utf8"));
const text = "?u?ng Nguy?n Tr?i, Ph??ng Thanh Xu?n Trung, Qu?n Thanh Xu?n";
const statuses = (calibration, policy) => recoverAddressText(text, knowledge(), { policy, calibration }).segments.flatMap(s => s.tokens);

test("the shipped calibration keeps contextual_auto off, and every trust margin was measured on its own population", () => {
  assert.equal(shipped.contextualAuto, false);
  assert.ok(shipped.precisionAtHigh >= 0.99 && shipped.precisionAtContext >= 0.99, JSON.stringify(shipped));
  assert.ok(shipped.highMargin >= shipped.contextMargin);
});

test("without the switch no word is ever labelled contextual_auto, and SAFE_AUTO leaves such words as ?", () => {
  // contextMargin 0 is what was shipped: every name-backed word would have passed.
  const calibration = { ...UNCALIBRATED, highMargin: 1e9, contextMargin: 0 };
  for (const policy of ["SAFE_AUTO", "FORCE_NO_QUESTION_MARK"]) assert.ok(!statuses(calibration, policy).some(t => t.status === "contextual_auto"));
  const safe = recoverAddressText(text, knowledge(), { policy: "SAFE_AUTO", calibration });
  assert.ok(safe.segments.flatMap(s => s.tokens).filter(t => t.status === "forced_guess").every(t => !t.applied));
});

test("an explicit, calibrated switch still allows the status (the mechanism is not removed)", () => {
  const calibration = { ...UNCALIBRATED, highMargin: 1e9, contextMargin: 0, contextualAuto: true };
  assert.ok(statuses(calibration, "SAFE_AUTO").some(t => t.status === "contextual_auto" && t.applied));
});
