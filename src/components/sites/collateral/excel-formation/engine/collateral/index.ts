import { Lexicon } from "./lexicon.ts";
import { loadConcepts, ONTOLOGY_VERSION } from "./ontology.ts";
import { CALIBRATION } from "./calibration.ts";
import type { CollateralCalibration } from "./recover.ts";

export { recoverCollateralText, NON_ASSERTIVE, type CollateralRecovery, type CollateralToken, type CollateralStatus } from "./recover.ts";
export { completeRemaining } from "./complete.ts";
export { Lexicon } from "./lexicon.ts";

/** The production lexicon is the ontology alone: composing wording from the templates did not improve held-out accuracy (docs/collateral-recovery-v2/06). */
export const COLLATERAL_VERSION = ONTOLOGY_VERSION;
let shared: Lexicon | undefined;
/** The lexicon of a repair run: every ontology concept. Built once per worker. */
export const collateralLexicon = (): Lexicon => shared ??= new Lexicon(loadConcepts());
export const collateralCalibration = (): CollateralCalibration => CALIBRATION;
