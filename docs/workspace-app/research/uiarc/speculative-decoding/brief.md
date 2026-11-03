# UIArc Speculative decoding: page brief and how it is used here

Source: https://uiarc.dev/components/speculative-decoding (Pro: the registry item `/r/speculative-decoding.json` answers 404, so there is no source to copy).
Evidence is the rendered public preview in Edge at 1440px (`screens/uiarc-speculative-*.png`), the page's markdown and the earlier measurements recorded in
`engine/run-timeline.ts` (fitted to the preview: columns 66.7 ms apart, a sweep of 266.7 ms, 200 ms hold, 183.3 ms settle, flight spring `stiffness 300 damping 36`).

## Structure of the card (measured)

Card: 1px hairline `oklch(93.5% 0 0)`, radius 34px (`--radius-surface`), padding 24px, gap 20px, sections divided by hairlines.
Header (title, status line with a check, round 32px play and restart buttons) / two lanes (a 120px label column, then chips: a dashed draft chip over a
cell the target fills) / the output line, every token underlined in the colour of the model that wrote it / three stats with big tabular numerals / a draft
length slider and a compare switch. Phases: draft chips appear one by one (4px from the left), the target sweeps across and gives verdicts, accepted words fly into
the answer on a critically damped spring 20ms apart, the first miss is struck through and the target writes its own, rounds repeat until done.

## What already existed and what was added

`gallery/SpeculativeRun.tsx` (+ `speculative-run.css`, `engine/run-timeline.ts`) already reproduces the card for the **suggestions** of a damaged cell.
Added now, as a variant of the same component and with the same CSS: **`variant="confirmed"`** = the replay of a correction a person has just approved.

| Lane / part | Suggestion (existing) | Confirmed fix (new) |
|---|---|---|
| Lane 1 | "Draft" (frequency, fast) | "In the file" (before your fix) |
| Lane 2 | "Target" (context, careful) | "Confirmed" (what you approved) |
| Word that stays | draft equals target: accepted, check | the file already had it right: accepted, check |
| Word that changes | draft differs: struck through, target writes its own | the damaged word is struck through, the approved word is written |
| Output | "Output" | "Result" |
| Controls | draft length, compare with one word at a time | none (all words in one go), play/restart only |
| Stats | Checks made / Drafts accepted / Words per check | Checks / Words kept / Words per check |
| Closing line | "{n} words drafted, {m} agreed" | "{k} of {n} words stayed as they were" and "{c} words replaced by your fix" |

Flow: approving a fix in "Review and fix" (`IssueDetails.approveSingle`, or "apply to the whole asset") passes `{ before, after, sheet, cell }` up to `ReviewStep`,
which shows `gallery/AppliedChange.tsx` above the next issue: a bar (cell, sheet, **Undo**, dismiss) and the replay. `engine/applied-change.ts` turns
(before, after) into the words the replay plays; it reads text and decides nothing. Undo is the toolbar's Undo. Nothing about how a fix is found, approved, patched or
exported changed. Reduced motion jumps to the finished state (existing behaviour of the card).

Check in the browser: `screens/ours-change-applied.png` (finished), `ours-change-applied-mobile.png` (390px).
Not copied: the Pro-only source, the sample sentence, the "Faster" multiplier (it means nothing for a confirmation).
