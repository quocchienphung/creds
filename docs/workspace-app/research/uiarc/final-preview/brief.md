# Final workbook preview

Source: https://uiarc.dev/components/floating-button-group
Destination: `/personalize?section=excel-formation`, step 4 **Preview & export**.

Uses the workflow in `web clone engine/.agents/skills/clone-website/SKILL.md`.

## Existing UI reused

- `gallery/IssueGallery.tsx`, `SheetViewer.tsx`, `WorkbookViewer.tsx`: real worker-backed worksheets, virtual rows, worksheet picker, cell selection and explicit fullscreen controls. Cell clicks and Enter on the gallery stage no longer open a dialog.
- `SpeculativeRun.tsx`: presentation-only before/after word animation. The new `preview` variant says it is awaiting approval; it does not imply engine verification or approval.
- `uiarc/motion-tokens.ts`: local motion presets; no additional package.

## Floating actions

`uiarc/floating-button-group/` implements the public documentation's shared highlight, hover/focus movement, initial highlight scale .94, pressed highlight scale .965, fade on leaving the tray, roving keyboard focus and reduced motion. Buttons and tray stay still. Existing morph token is a .42s, zero-bounce spring. Labels crossfade with a small rise and blur. Secondary actions use icons on narrow screens.

The source URL's direct web fetch failed and the browser connection was unavailable. The behavior and scale values came from public indexed documentation; timing uses existing local tokens and has not been fitted to a new browser recording. No gated source was downloaded. No pixel-accuracy claim.

## Approval and data flow

Auto-repair keeps its current policy selection and engine behavior, but its UI stops automatic Excel downloads and opens the final preview. The report/address audit remain accessible and are labeled as the original auto-repair run.

The UI adapter reads existing `progressSave` snapshots without marking work as downloaded. All patch originals and values, including patch-only cells and every worksheet, feed the preview. The original/edited toggle changes display only. Changed cells are green; unresolved cells retain warning tint.

Manual corrections use the existing `edit` request and its formula safeguards. Drafts survive changing selection and filters, block export/step changes until saved or discarded, and warn before unloading. Undo/Redo use the existing history. Approval is tied to the exact review-view revision and resets after edits or history changes. The export action always calls the current `exportXlsx`, checks its round-trip result and downloads only after explicit approval; no cached auto-repair blob is downloaded.

No recovery, geographic, ranking, patching, worker protocol or export engine implementation was changed.

## Checks

Persistent tests: `preview-model.test.mjs` covers duplicate issues, original/edited values, patch-only cells, multiple sheets, introduced issues, exceptions and undo. Existing gallery, word-comparison and translation tests are run alongside it. TypeScript, ESLint and production build are checked separately.

Rendered desktop/mobile comparison and real-browser interaction tests remain unverified while the browser host is unavailable.
