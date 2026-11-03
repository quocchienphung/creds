# Workspace backend contract

Every Guide me section (Home, Companies, Contacts, Deals, Reports, Run, Settings, Mapping, Invoice, the pipelines and the shell) reads and writes its data through one seam: `src/lib/workspace-backend/`. A screen never touches `localStorage` or `fetch`; it asks for a named **resource** and the configured **backend** stores it.

- **Default (nothing configured): local backend.** Everything stays in this browser's `localStorage`, under the same keys earlier versions used, and is shared between tabs. No request leaves the page.
- **REST backend.** Set `NEXT_PUBLIC_WORKSPACE_API_URL` (build time) or `window.__workspaceBackendConfig = { baseUrl, … }` (run time, before the workspace mounts). The routes below are then used.
- **Anything else** (GraphQL, websockets, Supabase, …): implement the `WorkspaceBackend` interface in `src/lib/workspace-backend/types.ts` and pass it to `<WorkspaceBackendProvider backend={…}>` (mounted in `PersonalizeApp`, `src/components/sites/guide-navigation/GuideNavigation.tsx`).

> The REST convention is defined by this front end. There is no existing server for it; the routes, envelope and status codes below are what a server has to implement. Remap the URLs with `resolveUrl` if your API is laid out differently.

## Configuration

```ts
window.__workspaceBackendConfig = {
  baseUrl: "https://api.example.com/v1",          // required to switch to REST
  headers: async () => ({ Authorization: `Bearer ${await token()}` }), // called for every request
  credentials: "include",                          // default "same-origin"
  timeoutMs: 15000, pollMs: 4000, debounceMs: 400, // defaults
  serverRun: false,                                // true: the server runs the agent (see "Run")
  resolveUrl: target => undefined,                 // return a URL to override a route
};
```

## Conventions

| | |
| --- | --- |
| Account resources | `GET/PUT {base}/account/{resource}` |
| Workspace resources | `GET/PUT {base}/workspaces/{workspaceId}/{resource}` |
| Read | `200 {"data": <value>, "version"?: "<opaque>"}`. A `version` may instead come in the `ETag` header. `204` or `404` means "nothing saved yet": the screen starts from its demo defaults. |
| Write | `PUT` with `{"data": <value>, "changes"?: [...], "commands"?: [...], "baseVersion"?: "<version>"}` and `If-Match: <version>` when a version is known. Answer `200/204`, optionally `{"version": "<new>"}` or a new `ETag`. |
| `changes` | Only for collections (arrays of `{id: string, …}`): the difference to the last stored copy. `[{"op":"create"\|"update"\|"delete","id":"…","value"?:…,"previous"?:…}]`. `data` is always the full list too, so a server may ignore `changes`. Reordering alone is not a change. |
| `commands` | The Mapping screen sends the edit commands that produced the snapshot (`MappingCommand`, `src/components/sites/mapping/mapping-types.ts`). Optional to use. |
| Errors | Any non-2xx. Body `{"error": {"message": "…"}}` is shown to the person. |
| Page closing | Pending saves are sent with `keepalive: true` when the body is under 60 KB. |

Status handling in the client: `401` unauthorized, `403` forbidden, `409`/`412` conflict (the screen reloads the stored copy when the person retries), `429`/`5xx`/network/timeout are retried automatically up to 3 times (1 s, 2 s, 4 s), other `4xx` wait for the person ("Retry" in the sidebar status).

Saving: edits appear immediately and are sent after `debounceMs` of quiet; one save at a time, always the latest value. Nothing is saved before the first load finishes. The sidebar shows loading/saving/error state (`SyncStatus`).

**Secrets never leave the browser.** For remote backends, fields listed as `secret` on a resource (API key `value`) are removed from every `PUT` and are not expected in a `GET`.

**Live resources** (`agent-run`) are polled every `pollMs` with `If-None-Match: <version>`; answer `304` when unchanged.

## Resources

`scope`: **account** = `/account/{name}`, **workspace** = `/workspaces/{id}/{name}`. **device** resources never leave this browser even with a REST backend.

| Name | Scope | Screen | Value (TypeScript source) |
| --- | --- | --- | --- |
| `workspaces` | account, collection | Workspace switcher | `{id, name, logo?}[]` (`WorkspaceListItem`, `workspace-resources.ts`) |
| `active-workspace` | account, **device** | Which workspace is open here | `string` |
| `profile` | account | Profile | `WorkspaceProfile` (`WorkspaceEditors.tsx`) |
| `preferences` | account | Settings dialog | `WorkspacePreferences` |
| `feedback` | account, collection | Help & feedback | `{id, text}[]` |
| `news` | workspace, **device** | What's new badge | `number` |
| `checklist` | workspace | Home checklist | `string[]` |
| `companies` | workspace, collection | Companies, Deals, pipelines | `Company[]` (`crm-engine.ts`); invalid rows reject the whole answer |
| `contacts` | workspace, collection | Contacts | `Contact[]` (`WorkspacePages.tsx`) |
| `views` | workspace, collection | Custom views | `CustomView[]` |
| `active-tab` | workspace, **device** | Last open tab | `string` |
| `favorites` | workspace | Favourites | `string[]` |
| `pixel-connected` | workspace | Home | `boolean` |
| `documents` | workspace, collection | Documents | `SalesDocument[]` (`WorkspaceDocuments.tsx`); `upload` is a URL (see Uploads) |
| `folders` | workspace | Documents | `string[]` |
| `report-period` | workspace, **device** | Reports | `number` (days) |
| `reports` | workspace, collection | Saved reports | `SavedReport[]` (`Analytics.tsx`) |
| `run-draft` | workspace | Run, inline draft | `DraftState` (`RunDraft.tsx`), saved after 800 ms |
| `agent-run` | workspace, **live** | Run | `RunSnapshot` (`run-types.ts`) |
| `command-settings` | workspace | Settings page (`/personalize?section=settings`) | `SettingsValues` (`settings-command/settings-model.ts`); the theme is also kept in `preferences.theme` and the workspace name in `workspaces` |
| `settings-general` | workspace | Usage → General | `{region, logo}` |
| `settings-members` | workspace, collection | Usage → Members | `SettingsMember[]` |
| `settings-billing` | workspace | Usage → Billing | `BillingState` (`SettingsBilling.tsx`) |
| `settings-api-keys` | workspace, collection, **secret `value`** | Usage → API keys | `{id, name, prefix, suffix, created, lastUsed}[]` |
| `mapping` | workspace | Mapping | `MappingData` (`version: 1`; `mapping-types.ts`), saved after 350 ms with `commands` |
| `invoice` | workspace | Invoice | `InvoiceLibrary` (`version: 2`; `invoice-model.ts`; a document may carry an optional `stamp: { kind: "paid"|"received"|"approved"|"due", date: "yyyy-mm-dd", ink: "red"|"blue"|"green"|"violet"|"black" }`), with v1 migration; see `docs/research/invoice-credit/api-contract.md` |

Answers are validated before a screen sees them (`parse` per resource, `normalizeData` / `normalizeInvoice` for the map and the invoice). An invalid answer is ignored with a console warning and the screen keeps its demo defaults; a map or invoice in an unknown format shows the retry notice.

While a REST load is in flight a collection shows its `empty` value (no demo rows are shown as if they were real); on the local backend the stored data is read synchronously on first render.

## Read models (queries)

`GET {base}/workspaces/{id}/queries/{name}` → `200 {"data": …}`. `204`/`404` means "this server has nothing for it": the built-in sample is shown. An invalid shape or a failure shows the sample **with a visible notice and a Retry button**. Refreshed when the tab regains focus (after 30 s).

| Name | Query string | Value |
| --- | --- | --- |
| `analytics` | `days=7\|30\|90` | One period of the Reports screen: `{days, stats[], charts[], breakdown[], products[]}`. The shape of `affectui-analytics/analytics-seed.json` entries; every `charts[].series[].values` has as many entries as `dates`. |
| `usage` | – | `{daily: {label, value\|null}[], categories: {label, value}[], storageUsed: number (GB), resetLabel: string, renewsOn: string}` |
| `plans` | – | `{name, price, credits, seats, storage, description, features[]}[]` (at least one) |
| `invoices` | – | `{date, id, amount, status}[]` |

## Commands

### Skilled workspace

`/skilled` shares the configured workspace backend and workspace IDs. `GET/PUT {base}/workspaces/{id}/skill-library` stores validated `SkillRecord[]`; `GET/PUT .../skill-events` stores the latest 200 `SkillEvent[]` and supports live resource polling/push. Types, parsers and SHA-256 bundle validation are in `src/components/sites/skilled/skill-model.ts`. The default local backend persists in this browser; this repository does not include a database server.

`POST {base}/workspaces/{id}/commands/skill.transfer` accepts `{agent: string, bundle: {version:1,workspaceId,createdAt,skills:SkillRecord[]}}`. The server routes the bundle to that agent and returns `{data:{bundleVersion:1,workspaceId,receivedAt:<ISO>,agent,accepted:[{id,sha256,files?:[{path,sha256}]}],bytes:<sum of instruction and supporting-file bytes>}}` only after acknowledged delivery. Every ID/hash, supporting-file path/hash, workspace, agent and byte count must match; supporting acknowledgements are required for nonempty captured folders; absent, malformed or mismatched receipts show an error. This receipt acknowledges instruction delivery, not model loading, execution or answer quality. Existing authentication/credentials/error conventions apply. A backend must authorize workspace and agent access; it should not execute imported instructions while storing them.

### Repo workspace

`/personalize?section=repo` (under Skilled in the sidebar) shows the Activity terrain, drawn from the `skill-events` resource Skilled records. It stores nothing of its own.

### Built-in home-server API (`/api/workspace/*`)

This app can itself be the REST backend described above, with files on the machine that runs it. Set `NEXT_PUBLIC_WORKSPACE_API_URL=/api/workspace` (build time) or `window.__workspaceBackendConfig = { baseUrl: "/api/workspace" }`.

| Route | Behavior |
| --- | --- |
| `GET/PUT /account/{name}`, `GET/PUT /workspaces/{id}/{name}` | One JSON file per resource under `LOGIO_DATA_DIR` (default `./.logio-data`). Names match `[a-z0-9-]{1,48}`, workspace ids `[A-Za-z0-9_-]{1,128}`. A version is a hash of the stored value (also sent as `ETag`); `If-None-Match` answers `304`, a stale `If-Match` answers `412`, a missing resource `204`. Writes are atomic (temp file + rename) and serialised per file. Body limit 24 MiB. |
| `POST /workspaces/{id}/commands/skill.transfer` | Validates the whole bundle (hashes, byte counts, safe paths, same workspace), writes it to `LOGIO_AGENT_SKILLS_DIR/<agent>/` (default `<data>/agents/<agent>`) with `SKILL.md` + `LOGIO.md` per skill, and returns the receipt the page verifies. `LOGIO_AGENTS` (comma separated) limits agent ids. The receipt means the files were written; it does not mean a model loaded them. Nothing is executed. |
| `GET /health` | `{data:{ok, store:{writable,dir}, agents:{dir,restricted}, auth:{tokenRequired}}}` (shown in the Repo page's Home server card). |
| `PUT/GET/DELETE /workspaces/{id}/storage/...` | Storage originals, full text indexes, authenticated downloads and server search; see the Storage API contract. |
| queries, generic uploads, other commands, `agent-run/actions` | Not served (`404`): the page uses its built-in samples and keeps files inside the saved JSON as `data:` URLs. |

Access: with `LOGIO_API_TOKEN` set every request needs `Authorization: Bearer <token>`. Without it only requests addressed to this machine or a private name (`localhost`, `127.x`, `10.x`, `192.168.x`, `172.16-31.x`, `*.local`, `*.lan`, `*.home`, `*.internal`) or a host in `LOGIO_ALLOWED_HOSTS` are served; anything else gets `403`. Browser writes must have an `Origin` equal to the request's `Host`. Switching a workspace from the browser backend to this one does not copy existing browser data. See `.env.example`.

Public file import is separate: the local Next handler `POST /api/skilled/import` accepts `{url}` and scans a public GitHub source archive, with no GitHub or UIArc API. An exact skill returns `{data:<ImportedSkill with files>}`. A repository root URL (default `HEAD`) or folder containing nested skills returns `{data:{candidates:[{name,description,path,url}],skipped?:number}}`; the person chooses a commit-pinned candidate before importing. Discovery is bounded to 100 documents / 4 MiB and validates real frontmatter. Scripts/references/assets inside a selected skill folder and a source license are captured at a pinned commit; external dependencies are not installed. Portable bundle delivery works without a remote backend; `scripts/skilled/install-bundle.mjs` writes checked files and a receipt that can be imported through Deliver skills. Details, measurement semantics and source/motion evidence: `docs/research/uiarc-skilled/README.md`.

`POST {base}/workspaces/{id}/commands/{name}`, body = input, `200 {"data": …}`.

- `api-key.create` — input `{"name": "New key 3"}`; answer `{"data": {"key": {id, name, prefix, suffix, created, lastUsed}, "secret": "sk-…"}}`. The secret is shown once in a dialog and never stored by the page. The list is then reloaded from `GET …/settings-api-keys`. Rename and revoke go through the normal `PUT` (`changes` with `update`/`delete`). Without a command-capable remote backend the screen creates local demo keys as before.

## Uploads

`POST` multipart, field `file`, answer `{"data": {"url": "https://…"}}`.

| Route | Used for |
| --- | --- |
| `{base}/workspaces/{id}/uploads/logo` | Workspace logo (Settings → General) |
| `{base}/workspaces/{id}/uploads/document` | Non-text files added in Documents |
| `{base}/account/uploads/avatar` | Profile picture |

The returned URL is stored in the resource (`settings-general.logo`, `documents[].upload`, `profile.avatar`). If the route answers `404`, the file is kept inside the saved JSON as a `data:` URL instead; other failures are shown. The local backend always uses `data:` URLs.

## Run (agent)

By default the browser simulates the run (a clock advances the plan, the snapshot is saved as `agent-run`). With `serverRun: true` the **server** runs the agent:

- the screen does not tick, does not auto-start and does not save `agent-run`; it shows `GET …/agent-run` (polled);
- each person's action is applied optimistically, then sent: `POST {base}/workspaces/{id}/agent-run/actions` with `{type: "approve"|"deny", id}`, `{type:"stop"}`, `{type:"retry", id, now}`, `{type:"rename", id, title}`, `{type:"move", id, direction}`, `{type:"remove", id}`, `{type:"add", step}` or `{type:"restart", steps}`; the answer may contain `{"data": <RunSnapshot>}`, which replaces the screen's copy. If the request fails, the stored snapshot is reloaded.
- `RunSnapshot` is validated (`isRunSnapshot`); steps, states, phase, elapsed and approvals are required.

## Process (engine)

The Process page (`/personalize?section=process`) stores its processes as the `process` resource (`ProcessLibrary`, see `docs/research/process/README.md`) and, in simulation, its run as `process-run`. With `serverProcess: true` next to `baseUrl` (or `NEXT_PUBLIC_WORKSPACE_SERVER_PROCESS=1`) a **server** runs the tasks; the page then sends the plan and the person's decisions and shows what the server reports. The page never calls a model; the server can forward each block to a local model server (Ollama), an agent framework (Hermes Agent, Claude Code, Codex) or a chat bot.

Routes under `{base}/workspaces/{id}/process` (same auth headers as the rest of the API):

| Route | Purpose |
|---|---|
| `GET /engines` | `{data: [{id, label, provider, local, note?}]}`: the AI blocks the server can run (e.g. installed Ollama models). `id` is stored in a block's `ai.model`. `404`/`204` = not listed; model names are typed instead |
| `POST /runs` | Body `{processId, process, from?}` (`from` = a block id to run only that block and what hangs under it). Answer `{data: RunSnapshot, version?}` |
| `GET /runs?processId=…&latest=1` | `{data: RunSnapshot or null}`: the run to show after a reload |
| `GET /runs/{runId}` | `{data: RunSnapshot, version?}`; polled while the run is active; sends `If-None-Match` with the last `version`/`ETag`, `304` when unchanged |
| `POST /runs/{runId}/actions` | Body `{type: "approve"/"reject"/"retry"/"dismiss", id}` or `{type: "stop"}`. The answer may carry `{data: RunSnapshot}` |

`RunSnapshot = {id, processId, startedAt, at, state: "running"|"waiting"|"done"|"failed"|"stopped", nodes: {[blockId]: {status, cost, started?, ended?, waitedFrom?, ask?, error?, attempts?, calls?, round?, of?, rounds?, runId?}}}`; times are epoch milliseconds in the **server's** clock (`at` is the moment the snapshot describes, so the page counts time from it). `status` is one of `idle, running, waiting, done, failed, stopped`. A snapshot that does not validate is ignored and the previous state is kept. Errors use `{error: {message}}`; the message is shown to the person (`401/403/404/409/412/429/5xx` map to the usual codes).

A block's JSON includes `role` (`coordinator, planner, creator, coder, qa, reviewer, fixer, reverter, revoker, instructor, helper, processor, custom`), `ai {provider, model, instructions}` (`provider` is one of the 93 ids listed in `docs/research/process/README.md`; the model is free text) and the optional map position `pos {x, y}`.

**Connections.** A process may carry `links: [{id, from, to, rounds?, label?}]` (block ids; `rounds` 2 to 10 on a loop). A link to a block that came before (an ancestor of `from`) is a **loop**: when `from` has finished, run the blocks from `to` down to `from` again, at most `rounds` passes in all, and not again after a failure or a stop. Any other link means `to` starts only after `from` has finished. `POST /runs` sends the process with its links; a server that does not support them may ignore them.

**Rounds.** Report one entry per block under the block's own id: its newest pass that has started, with `round` (this pass, 1-based), `of` (passes planned), `rounds` (the earlier passes: `{round, status, cost, started?, ended?, waitedFrom?, error?, attempts?, calls?}`) and, when a decision about this pass must name something other than the block's id, `runId`. Actions use that `runId` as `id` (otherwise the block id). The page shows "Round 2/3", adds the cost of every pass to the block and keeps the earlier passes in the trace.

**What the Tracing page can show.** `waitedFrom` (epoch ms): when the block began waiting for a person; `started` is when the person said yes, so the wait is `started - waitedFrom`. `calls` (at most 60 per block): the model and tool calls the block made, `{id, kind: "llm"|"tool", name, detail?, status: "running"|"done"|"failed", start, end?, tokensIn?, tokensOut?, cost?, input?, output?, error?}` with epoch-ms times; a call without `end` is still going. Without `calls` the trace shows the block as one span carrying its cost; nothing is invented for a connected engine.

## Testing

- `npm test` runs the unit tests (`src/lib/workspace-backend/workspace-backend.test.mjs`): routes, versions, retries, conflicts, secrets, queries, uploads, run actions.
- `node scripts/qa/backend.mjs [base-url]` drives the real UI against a mocked REST server (Playwright routes under `/mock-api`) and checks that each section loads from it, saves to it with `PUT`/`If-Match`, never sends API key secrets and shows the error notice.
- The regular QA scripts (`scripts/qa/*.mjs`) run against the local backend and must stay green.
# Files / Agent Chat

Files adds the `file-library` workspace resource and reuses `folders` and `uploads/document`. See [the Files API contract](research/affectui-files/api-contract.md) for JSON shapes, signed download URLs, upload/auth behavior and cross-resource boundaries.


### Storage knowledge library

Storage has a complete original/index API as well as the `knowledge-library` metadata resource. Read [Storage API contract](research/storage/api-contract.md) for request/response types, setup, authentication and write/delete ordering.

`knowledge-library` is `{ version: 1, onboarded: boolean, documents: StorageDocument[] }`; metadata uses the normal GET/PUT resource, ETags, validation and visible live polling. With a remote backend, `WorkspaceBackend.knowledge` stores originals and full indexes, serves authenticated downloads and full-text search, and deletes server copies. The default browser backend still uses IndexedDB. A clean second device can read/search/download server documents without a local cache.

Routes under `{base}/workspaces/{id}/storage`: `PUT /documents/{documentId}` (multipart file/text/sha256), `GET /documents/{documentId}/index`, `GET /documents/{documentId}/original`, `GET /search?q=...`, `DELETE /documents/{documentId}`. The built-in `/api/workspace` server implements every route, using the same token/LAN guard and Origin check. Originals and index files persist below `LOGIO_DATA_DIR/workspaces/{id}/storage/`. Upload receipts are checked against actual SHA-256 and byte size; metadata is read back before completion. Delete metadata before deleting its original; a referenced original returns409, and failed deletion can be retried.

Production Docker builds accept `NEXT_PUBLIC_WORKSPACE_API_URL` as a build argument; Docker Compose forwards it and mounts named data volumes. See `.env.example` and the Storage contract. No UIArc or affectUI service is invoked.
