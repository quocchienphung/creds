# Queue

The originals the person uploaded, kept on the server until removed. Layer rules: [`../README.md`](../README.md).

There is **no engine layer**: Queue does no workbook analysis. Its server half is `src/lib/server/collateral-queue-*` and `app/api/workspace`.

## UI / UX (`ui/`)

| Part of the screen | Component |
|---|---|
| List, search, filters, summary, delete and undo | `Queue.tsx`, `queue.css` |
| Detail pop-up for one original | `QueuePopup.tsx`, `queue-popup.css` |
| "Saved to Queue" notice on the Excel/JSON pages | `ArchiveNotice.tsx` |
| Copy in English and Vietnamese | `queue-copy.ts` |

## MODEL (`model/`)

| File | Function |
|---|---|
| `queue-model.ts` | `QueueEntry`, `queueTone`, `queueBytes`, `filterQueue`. |
| `queue-client.ts` | Requests to the Queue API; checks size and SHA-256 before an original is reopened. |
| `useUploadArchive.ts` | Saves the opened file to Queue and keeps its processing status in step. |

Known limit: the refresh, open, delete and undo state is still inside `ui/Queue.tsx` because those flows share one set of `useState` and refs. Move it to a `model/useQueue.ts` hook when that file is next changed.
