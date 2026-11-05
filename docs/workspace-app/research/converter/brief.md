# Converter: Excel to CSV

Destination: `/personalize?section=converter` (new sidebar item, after the Collateral folder). Workflow reference: `web clone engine/.agents/skills/clone-website/SKILL.md`.

## What was asked, and what was not done

Asked: clone UIArc **Ghost text**, **Generation stats** and **AI translate** and combine them into an Excel to CSV page.
All three are **Arc Pro** (token-gated, paid): `https://uiarc.dev/r/<name>.json` returns 404 and `/r/pro/<name>.json` returns 401 without a token. UIArc's `llms.txt` says never to reconstruct a Pro item without access, and the earlier UIArc port in this repo ([final-preview brief](../uiarc/final-preview/brief.md)) skipped Pro items for the same reason. A request to screenshot and rebuild them was **declined**. Nothing of their source, markup, CSS values or screenshots is used.

Done instead: an original page built on our own code and the free UIArc parts already in the repo (SegmentedControl, FloatingButtonGroup, IconMorph, motion tokens). Only the *ideas* named in UIArc's public one-line descriptions are used, each mapped to something this page really does (no AI model is involved, so nothing is labelled AI):

| idea (public description) | what the Converter does |
|---|---|
| inline suggestion at the caret, key accepts | output file name: a muted completion of the suggested name (`<workbook>-<sheet>.csv`) continues what you type; the right arrow at the end accepts, Escape dismisses. Bare Tab is not used: the workspace reserves it for the page switcher (`CommandPalette.tsx`, capture phase) |
| live stats strip that counts up, then opens a breakdown | rows, columns, size and time count up after each conversion; a breakdown shows what was skipped or converted |
| result streaming in place over a dimmed original | in a fixed-height box each row's original cells crossfade (rise and blur, 70 ms stagger) into its CSV line, so nothing shifts; the Source toggle reverses it. Delimiters are tinted so the separator is visible |

## Data rules (the part that must be right)

- Reader: the existing `readWorkbook` (`collateral/excel-formation/engine/xlsx-reader.ts`), run in a dedicated worker; nothing leaves the device.
- Numbers keep the exact text stored in the file (no precision or leading-zero loss). Formulas export their cached value.
- Date-formatted numbers become ISO (`2026-09-30`, `2026-09-30 13:45:00`, `13:45:00` for time only). Booleans become TRUE / FALSE.
- Quoting per RFC 4180 (delimiter, quote, CR/LF). Rows with no value are skipped and counted.
- UTF-8 BOM is on by default so Excel opens Vietnamese text correctly.

## Files

| file | role |
|---|---|
| `src/components/sites/converter/convert.ts` (+ `convert.test.mjs`, 5 tests) | pure: CSV quoting, Excel serial to ISO date, suggested name, ghost completion, file-name check |
| `converter/convert.worker.ts`, `useConverter.ts` | reads and converts off the main thread; stale results are dropped; reader errors reuse the Excel import wording (`MESSAGE` exported from `ImportStep.tsx`) |
| `converter/Converter.tsx`, `converter.css` | the page; `data-interaction-own` on the tray, segmented controls and the details toggle |
| `i18n/vi-converter.ts` | Vietnamese copy, registered in `i18n/vi.ts` |
| wiring | `workspace-state.ts` (section), `Crm.tsx` (nav item, lazy route), `skeleton-kind.ts` (+ test), `navigation-items.ts` (palette entry, group Tools), `app/personalize/page.tsx` (description) |

## Tracker

- [x] Source and destination map, Pro status verified
- [x] `convert.ts` + tests
- [x] `convert.worker.ts`, `useConverter.ts`
- [x] `Converter.tsx` + `converter.css`
- [x] Section wired
- [x] Vietnamese copy
- [x] ESLint, TypeScript, `npm run test:app`, `npm run build`
- [x] Rendered check in Chrome (Playwright, 1440x900 light and dark, 390x844), real flow, real download read back
- [ ] Not done: other browsers, a screen reader pass, Vietnamese locale rendered in the browser, timing against uiarc.dev (not applicable: nothing was cloned)

## Decisions worth knowing

- The ghost text is accepted with the **right arrow at the end of the field**, not Tab: `CommandPalette.tsx` binds bare Tab on `window` in the capture phase (even from inputs) to open the page switcher. Found when Tab opened the palette over the field in the first browser run.
- Only the selected worksheet is exported per download. Rows with no value are skipped and counted.
- Cells whose text starts with `=`, `+`, `-` or `@` are written as they are (no CSV-injection prefix), because that would change the data. Opening such a CSV in Excel can evaluate them.
- `shortcut:` the 1900 date system is assumed (the reader does not expose `date1904`).

## Checks run

- `npm run typecheck`, `npx eslint src`: clean.
- `npm run test:app`: 367 of 370. Failures: two UIArc fixtures that were never committed (README) and `skill.transfer` (`Refusing symbolic link path: /var`, macOS), which fails identically on a clean HEAD.
- `npm run build`: passes.
- Browser, 21 checks passed: section and nav state, stats (41 rows, 5 columns), ghost completion, Escape, right-arrow accept, invalid name disables download, details text, Source toggle, semicolon delimiter, download read back (BOM, `;`, quoting, leading zeros kept, ISO dates, 41 rows, CRLF), tray label flip, empty sheet, no horizontal overflow at 390px, bad file message.
- 60,001 rows x 8 columns (2.9 MB): about 1.6 s to read and convert, longest main-thread stall 65 ms, output verified at both ends.
- A `404` for a `_next/static/chunks/src_components_sites_*.js` file appears on every section of the running dev server (also Excel formation and Queue); it is not from the Converter.
