# src — workspace app (Next.js)

Runs from the repo root next to ponytail: `npm run dev`, `npm run build`, `npm run test:app`. Root `npm test` stays ponytail's own suite.

| Folder | Role |
|---|---|
| `app/` | Routes only: `/personalize` (the three Rules pages via `?section=excel-formation|json-formation|queue`) and `/api/workspace/*` (file-backed REST). `/` redirects to `/personalize`. |
| `components/sites/guide-navigation` | Workspace entry and shared navigation helpers. `/personalize` opens Excel formation, JSON formation or Queue directly; the browse selector has been removed. |
| `components/sites/collateral` | Rules engine. `engine/` = worker + protocol, `excel-formation/` and `json-formation/` = detect, repair, report, steps UI, `queue/` = hand-off queue. |
| `components/sites/settings-command`, `affectui-crm` | User settings and the account menu (theme, language, workspaces). |
| `components/sites/i18n` | EN/VI catalog. |
| `components/{interaction,motion,page-transition,navigation}` | Shared runtime for menus, morphs and page transitions, mounted in `app/layout.tsx`. |
| `lib/workspace-backend` | Client store with local or HTTP backend. `lib/server` is its server half (`.logio-data/`, see `docs/workspace-app/backend-api.md`). |
| `styles/` | Global CSS layers imported by `app/globals.css`. |
| `tsconfig.json` | App TS config (the root one is gitignored by ponytail). |

Tests sit beside the code as `*.test.mjs`. Two still fail (split-bar labels, terrain traces): they need `docs/research/uiarc-*` fixtures that were never committed.
