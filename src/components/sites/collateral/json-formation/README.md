# JSON formation

Steps: **Mapping → Preview → Export** (`ui/JsonFormation.tsx`). Needs an open workbook from Excel formation. Layer rules: [`../README.md`](../README.md).

## UI / UX (`ui/`)

| Part of the screen | Component | Calls |
|---|---|---|
| Section shell, step tabs | `JsonFormation.tsx` | `useCollateral` (`engine`, `json`), whose `json` is `model/useJsonPlan` |
| Mapping: columns to report fields | `steps/MappingStep.tsx` | `excel-formation/engine/mapping-profiles`, `excel-formation/engine/text` |
| Report fields form, export | `steps/JsonPanel.tsx` | `model/useJsonPlan` (`meta`, `options`, `plan`) |
| Checks and pipeline view | `steps/JsonPipeline.tsx` | `JsonPlan` from `engine/json-session`, `model/useJsonPlan` state; drawn with the shared `json-pipeline/Workflow` |
| Grouped preview of the document | `steps/GroupedPreview.tsx` | `model/remote-source`, the shared viewer `../../json-viewer` |

## MODEL (`model/`)

| File | Function |
|---|---|
| `useJsonPlan.ts` | Debounced check of the report: asks the worker for the plan whenever the review or the form changes. |
| `remote-source.ts` | `remoteSource`: a viewer source for a document that lives in the worker (pages fetched on demand). |

## ENGINE (`engine/`)

`json-session.ts` (all gates for the export), `json-report.ts` (the report), `json-doc.ts` (document served to the viewer), `json-package.ts` (export package), `report-options.ts`, `template-mau09.ts` (the template).
