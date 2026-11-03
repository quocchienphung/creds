# 09 · Review workbench: stacked layout and contextual correction

2026-11-02. This revision supersedes the review layout and Speculative decoding presentation in `07-operating-guide.md` and `08-whole-file-viewer-and-guessing.md`. It is a product redesign requested by the user, rather than an emulation of another public preview.

## Interaction

The normal review page has two full-width blocks: a shallow workbook preview above the correction workbench. The preview is 220px high on desktop and 240px on narrow containers, with the issue rail below the sheet. Three numbered headings lead through locating the cell, reviewing the correction and confirming the final text.

The original cell text is readable and its damaged characters are marked. The replacement table shows matching words, their actual occurrence counts and the evidence used. It has no model playback, simulated performance figures, draft-length slider or animated token display. The optional evidence disclosure explains what counts mean.

- Strongly supported candidates are selected for the proposed reading; ambiguous candidates are not.
- `Keep original` is an explicit choice. `Type another word` allows a manual replacement even when the file has no match.
- Choosing candidates does not overwrite an existing draft. `Use this reading` copies supported candidates and explicit choices into the final-value editor; unresolved words stay unchanged.
- Only `Approve value` (or Ctrl/Cmd+Enter after editing) sends edits to the worker. An unresolved `?` remains a finding after approval and still blocks export under the existing rules.
- The identical MOTABD/MOTABDS twin can be changed together. `Review later` changes selection without resolving the issue, and an existing draft survives returning to it. Undo follows the existing history.
- The fullscreen viewer keeps the same live editor, including drafts, exceptions and choices. Because the shallow preview has a different aspect ratio, it opens with a restrained entrance rather than stretching a tall sheet from the preview's width. Escape and focus return remain supported.

Source: `excel-formation/gallery/IssueGallery.tsx`, `gallery/gallery.css`, `gallery/SpeculativePanel.tsx`, `gallery/speculative.css`, `IssueDetails.tsx`, `steps/ReviewStep.tsx`. All new labels have Vietnamese translations in `i18n/vi-credit.ts`.

## Predictor

`engine/predict.ts` still uses only this workbook, inside its Web Worker. No dependency, remote service, dictionary, storage or telemetry was added.

Previously, words were selected greedily from left to right and a cell containing any `?` was excluded from training. The revised model learns intact fragments of damaged cells, without learning the damaged word or joining a pair across that gap. A forward/backward phrase decoder considers adjacent damaged words together and uses later clean words as anchors. Candidate sets are bounded at 32 per word. A wide score margin alone is insufficient: a candidate also needs at least three occurrences; a pruned candidate set always requires review. These rules are heuristics, not calibrated confidence probabilities.

The existing `draft` field and standalone simulation modules remain for offline evaluation and historical tests; the production workbench does not run or show that simulation. `applyReviewChoices` is the shared rule for leaving ambiguous words unchanged.

The assumption remains one missing character per `?`, with a preference for vowels and `d`. Unknown words, names with sparse evidence, damaged word boundaries and missing/multiple characters cannot be guaranteed. Manual input is the fallback. Approved corrections are not silently added as training examples.

## Evaluation

Local reference workbook; only aggregate counts/rates were printed, with no source-cell text or real workbook screenshots. These are masked-character tests, not labelled outcomes for actual corrupted cells and not a universal accuracy claim.

| Scenario | Held-out cells / masked words | Best candidate correct | Correct candidate in top 3 |
| --- | --- | --- | --- |
| Previous predictor, 90/10 row split, up to 3 separated eligible words | 3,888 / 10,166 | 98.8% | 99.7% |
| Revised predictor, identical split/masks | 3,888 / 10,166 | 98.9% | 99.7% |
| Revised, up to 6 adjacent eligible words, row split | 3,888 / 19,616 | 98.6% | 99.7% |
| Revised, up to 6 eligible words; split by normalized description so identical descriptions cannot cross the split | 3,982 / 19,835 | 97.8% | 99.6% |

The stricter split is a better indication of unseen phrases than a row split containing repeated descriptions. The displayed UI has no accuracy percentage. Reproduce using `node --experimental-strip-types scripts/qa/collateral-predict-eval.mjs`, optionally `--adjacent` and `--unique`.

## Verification

- Production build and targeted ESLint passed.
- Collateral unit suite: 99/99, including adjacent broken words, rare evidence, unknown words, bounded candidate sets, preservation of punctuation/case and explicit/manual choices.
- `scripts/qa/collateral-correction-workbench.mjs`: 42 checks at 320/390/1024/1440px, including touch/reduced motion, keyboard issue navigation, ambiguous-word preservation, manual correction, draft preservation through Review later, twin approval and Undo; no external requests or page errors. Synthetic screenshots/results in `docs/research/collateral/workbench-qa/`.
- Full Excel/JSON end-to-end suite: 86/86, including corrected workbook verification, progress save/resume, JSON export, dark theme and responsive review.
- Existing viewer/review suite: 35 checks across those widths, including retained editor identity, exception reason, focus containment, lens edges and readable-column visibility.

This is browser automation and visual inspection, not usability research with recruited users or physical-phone testing.

## Update: the replay returns inside this layout

The sentence above that the table has "no model playback, simulated performance figures, draft-length slider or animated token display" describes the first redesign. The product owner then asked for the Speculative decoding interaction back, built 1:1 from the public preview, **inside this layout** (same stacked blocks, same table, same rules for ambiguous words).

- `gallery/SpeculativeRun.tsx` (+ `speculative-run.css`, `RollingNumber.tsx`, `linked-words.ts`, `engine/run-timeline.ts`) sits between the header of the suggestion card and the table. It replays the real draft and target of the words of the cell; the timings are the ones measured on the preview (`docs/research/speculative-decoding/README.md`). It never changes a value: choosing and approving still go through the table and the existing buttons. It can be folded with its title.
- The figures describe the replay, not correctness, and say so next to the numbers. Ambiguous or unknown words stay as in the file, in amber, in the output line until chosen; a draft/target agreement on a word the file cannot confirm gets a question mark, not a tick.
- Table interactions added on top: word hover/focus lights the same word in the output and the other way round, a click on an output word jumps to its row, `1`-`4` choose a candidate, the arrows move between rows, a chosen word flies from its chip into the output with the preview's spring; evidence text shows how often the chosen spelling was seen next to its neighbours.
- QA: `node scripts/qa/collateral-speculative-run.mjs <base-url>` (50 checks, timings compared with the recording); frame pacing: `node scripts/forensics/speculative-run-fps.mjs <base-url>`. In the correction workbench QA nothing changed. The assertion in `collateral.mjs` that forbade playback controls was replaced by "the table is actionable at once and the replay makes no accuracy claim".
