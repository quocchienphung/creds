# Collateral (Rules) — layer map

One workbook, three sections (Excel formation, JSON formation, Queue). Every section is split into three layers. **A function that decides, reads, repairs or builds data never lives in a component file; a component never holds that logic.**

| Layer | Folder | What it holds | May import |
|---|---|---|---|
| **ENGINE** | `engine/` | Pure logic: reading and patching XLSX, detecting and repairing text, building the JSON report. No React, no DOM, no CSS. Runs in a Web Worker. | other `engine/` files only |
| **MODEL** | `model/` | State and glue: hooks, providers, view-models (filters, sorting, marks, diffs), I/O to storage or the server. No JSX layout, no CSS, no motion. | `engine/`, other `model/`, `lib/` |
| **UI / UX** | `ui/` | Components, CSS, motion, copy and i18n hooks, DOM helpers. Renders model state and forwards the person's actions. | everything below it |

`layers.test.mjs` enforces this on every `npm run test:app`: `engine/` files cannot import React, motion, icons, CSS, the `@/` alias, `model/` or `ui/`; `model/` files cannot import `ui/`, CSS, motion or icons.

## Shared (this folder)

| Layer | File | Role |
|---|---|---|
| ENGINE | `engine/collateral.worker.ts` | The worker: opens, scans, edits, repairs, exports. |
| ENGINE | `engine/protocol.ts` | Message and result types between page and worker. |
| ENGINE | `engine/engine-client.ts` | Promise wrapper around the worker. |
| MODEL | `model/useCollateralEngine.ts` | The page's handle on the worker (`engine.edit`, `previewChanges`, `exportXlsx`, `autoRepair`, `jsonPlan`, …). |
| MODEL | `model/CollateralProvider.tsx` | One workbook shared by the three sections; archive to Queue; filters per file. |
| MODEL | `model/progress-store.ts` | Corrections kept in the browser (IndexedDB) under the file hash. |
| UI | `ui/shell.tsx`, `ui/Stepper.tsx`, `ui/NeedWorkbook.tsx`, `ui/CollateralBoundary.tsx` | Page frame, step tabs, empty state, error boundary. |
| UI | `ui/labels.ts` | Display strings and pill tones for severities, statuses and categories. |
| UI | `ui/download.ts` | Browser download helper (touches `document`). |
| UI | `ui/collateral.css`, `ui/arc-layout.css` | Shared styles. |

## Sections

- [`excel-formation/`](excel-formation/README.md): Import, Overview, Review and fix, Preview & export.
- [`json-formation/`](json-formation/README.md): Mapping, Preview, Export.
- [`queue/`](queue/README.md): saved originals.

`AGENTS.md` here keeps the rule about preserving the correction workbench. Run `npm run test:correction-ui` before touching it.
