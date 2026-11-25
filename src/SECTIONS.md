# Sections: where the UI, model and engine of each one live

Each section has a `README.md` listing its screen parts and the functions behind them. The three layers are enforced by `components/sites/collateral/layers.test.mjs`.

| Section | UI / UX | MODEL | ENGINE | README |
|---|---|---|---|---|
| Excel formation | `components/sites/collateral/excel-formation/ui/` | `.../excel-formation/model/` | `.../excel-formation/engine/` | [README](components/sites/collateral/excel-formation/README.md) |
| JSON formation | `.../json-formation/ui/` | `.../json-formation/model/` | `.../json-formation/engine/` | [README](components/sites/collateral/json-formation/README.md) |
| Queue | `.../queue/ui/` | `.../queue/model/` | none | [README](components/sites/collateral/queue/README.md) |
| Collateral shared (frame, provider, worker) | `.../collateral/ui/` | `.../collateral/model/` | `.../collateral/engine/` | [README](components/sites/collateral/README.md) |

Sections outside Collateral (converter, settings, CRM shell, cookie consent, uiarc…) are not split yet; most already keep `*-model.ts` beside the component.
