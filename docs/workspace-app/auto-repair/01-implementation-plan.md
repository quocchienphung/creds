# Sequential checkpoints

1. Safety: make archive explicit, remove audit value fingerprints/freeform content and insecure fingerprint fallback; strengthen question/duplicate/JSON gates and formula protection. Regression tests, then checkpoint.
2. Reliability: strict bounded XML scanning, actual decompression accounting, lexical numbers and invalid-reference failures. Keep fflate/TS and document memory ceiling. Reader tests, then checkpoint.
3. Recovery: Unicode spans, trusted same-entity evidence, bounded candidates and ranker, conservative decision validator, workbook-wide verified-only orchestrator. No word repair dictionary; model suggestions never auto-verified. Synthetic unit/integration tests, then checkpoint.
4. Worker/UX: one action outside existing suggestion panels; actual progress, cooperative cancel, safe XLSX/report downloads, atomic history transaction. Keep original and suggestion layout intact.
5. Format: preserve complete original cell attributes and non-text content, refuse unsupported patch targets, validate exact approved changes and package invariants independently. Independent XML/desktop checks where available.
6. Validation: existing suites and production build; browser one-click, offline/cancel and layout regression; synthetic small/medium/50k performance. Record actual results and untested cases, no real customer content in logs.

Prioritize a complete verified-only flow. Statistical predictions remain review suggestions until a private, source-disjoint reviewed gold set calibrates auto-apply precision. Byte-identical untouched ZIP parts and XML outside approved cells are required, not byte-identical recompressed ZIP containers.
