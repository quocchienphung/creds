# Final workbook preview

Destination: `/personalize?section=excel-formation`, step 4 **Preview & export**. Workflow: `web clone engine/.agents/skills/clone-website/SKILL.md`.

## What was cloned, and what was not

Source of truth is the open-source (MIT) registry JSON that uiarc.dev serves for free items (`https://uiarc.dev/r/<name>.json`), not a rendering:

| ported | files |
|---|---|
| Floating button group (`/r/floating-button-group.json`) | `uiarc/floating-button-group/FloatingButtonGroup.tsx`, `.module.css` — measured shared highlight on motion values (spring `morph`), `.94` entry scale, `.965` press, labels reserved by invisible ghosts so a label change never resizes the tray, roving keyboard focus, `variant="floating"` raised tray. Tooltip dependency (`@radix-ui/react-tooltip`) dropped: icon-only items use `title`. Added a `primary` action. |
| Segmented control (`/r/segmented-control.json`) | `uiarc/segmented-control/SegmentedControl.tsx`, `.module.css` — gliding selection (`layoutId`), fading scroll edges, tab-list keys. |

| Expanding button group, Icon morph | `uiarc/expanding-button-group/`, `uiarc/icon-morph/` — used by the inspector's Restore / Discard / Save group (Save confirms in place) and the replay toggle (play ↔ pause). |

Repeatable: `node scripts/uiarc/port.mjs <name>` fetches a free registry item, renames and re-tokens it for this repo, and reports sibling imports, missing packages and missing tokens it cannot decide. Pro items return 404 and are refused.

Not cloned: **Selection toolbar, AI side panel, Prompt studio, AI feature launch are Arc Pro** (token-gated, paid; `llms.txt` says never to reconstruct a Pro item without access). Their registry URLs return 404 without a Pro token. The preview's contextual surface (docked inspector, tray, Next-to-review) is our own design built from the free parts above, not a copy of those blocks. Expanding button group and Icon morph are free and were fetched (`/r/expanding-button-group.json`, `/r/icon-morph.json`) but are not used yet.

## Layout

Header → three stat tiles (values crossfade with rise + blur) → `Original file | Edited preview` and `All | Changed | Needs review` segmented controls with counts → **sheet + inspector side by side** → approval card → sticky floating tray.

- The sheet is the real worker-backed `SheetViewer` (virtual rows, worksheet picker). Green = changed, red = needs review. `Original file` shows the pre-repair values of the same cells.
- The inspector (right, sticky; stacked under the sheet below 1020px) follows the selected cell: original with removed words struck, an editable edited value with added words marked, Restore original / Discard draft / Save cell, prev/next with a crossfading `n / total`, and an optional replay (`SpeculativeRun`, preview variant) that opens with a spring height.
- Blocks enter with a stagger (`opacity 0, y 14, blur 4` → rest, `.52s` enter ease); the tray rises after them on the `smooth` spring. Reduced motion: opacity only.
- Tray: Undo, Redo | Next to review, Review remaining issues, **Approve and export**. Approve is enabled only after the approval box is ticked for the exact revision shown.

## Data and safety (unchanged)

All values come from `previewChanges` / `progressSave` snapshots; manual edits use the existing `edit` request; export always calls `exportXlsx`, checks its round trip and downloads only after approval. A cell counts as **needs review** only while its issue is open or its edited value still holds a `?`; an edit that left no `?` is a change (green).

## Also fixed

- Auto-repair dialog: the policy radios overlapped their labels and the button (unstyled fieldset). Now two cards with one selection ring that glides between them.
- `arc-tokens.css`: dark values were declared with `:where(...)`, which has zero specificity and lost to the light `:root` values, so UIArc parts never went dark. Now `[data-theme="dark"], .dark`.

## Checks

TypeScript, ESLint, `npm run test:app` (343/345; the 2 failures need `docs/research/uiarc-*` fixtures that are not in the repo and failed before this work), `word-diff.test.mjs`, `preview-model.test.mjs`. Rendered in Edge at 1440×900 light and dark and 390×844, driving the real flow (open file → auto repair → preview → filter → next → edit → save → original toggle → replay → approve). The real export was downloaded from this UI after a manual cell edit and read back with the independent Python reader: the manual edit and the auto repairs are in the file, no address cell holds a `?`, a real question stays. Not verified: other browsers, and timing against a recording of uiarc.dev (values come from the source files, not from measuring their page).
