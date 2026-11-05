# Preserve the correction workbench

The user explicitly asked to retain **Suggested corrections → Guess and check**. Keep it reachable in Excel formation → Review and fix for `QUESTION_MARK_IN_WORD` findings when predictions are available. Do not remove it or replace it with the auto-repair dialog or final preview unless the user explicitly requests that change.

- Preserve the Draft/Target passes, rejected-word replacement, output, statistics, Play/Pause/Restart, draft-length slider and comparison switch. Respect reduced motion.
- Preserve the replacement table, evidence, manual entry, Keep original and Use this reading. Suggestions fill a draft; only explicit approval saves it. Uncertain words stay unchanged until chosen.
- The replay advances through the cell and stops when complete; it does not continuously rewrite the workbook.
- Canonical app code is under root `src/`. `web clone engine/` is an older reference, not the running app.

Before changing this flow, run `npm run test:correction-ui` from the repository root. Keep the regression checks in CI; do not delete or weaken them to make a removal pass.

History and recovery references: `docs/workspace-app/collateral/09-correction-workbench.md`.
