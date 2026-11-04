# 03 · Synthetic corruption lab

Code: `engine/collateral/synth.ts`. Everything it produces is **SYNTHETIC**.

## Generator
33 template families (every domain, plus 3 mixed-domain), each assigned to `train`, `validation` or `test`. Slots take concepts of their domain from the record's split pool; numbers, parcels, plates, VIN-like codes, certificate numbers, dates, amounts are fabricated (`protectedAnchors` lists them). Company names are fabricated and never damaged. `SyntheticRecord` keeps `accentedTruth`, `asciiTruth`, `corruptedInput`, `corruptionPositions`, `protectedAnchors`, `semanticSlots`, `corruptionPatternIds`, `split`, `seed`, `difficulty`, `damagedWords`.

## Operators
`one_letter`, `multi_letter`, `mixed_plain_and_q` (some marks become plain letters, some `?`), `span_to_one_q` (two letters lost as one `?`, variable length), `whole_short_token` (single marked letter such as *ở*), `first_char`, `last_char`, `uppercase`, `ascii_context` / `accented_context` (the clean words around the damage are plain 65% / accented 35%). Difficulty: easy (1 word), medium (1–2), hard (60–100% of damageable words). A `?` is only ever put where a mark was.

**Not generated**: mojibake / U+FFFD families, whitespace and punctuation errors, abbreviation damage (documented gaps).

## Real distribution
The mix above is an **assumption** (a marked letter becomes `?` with probability 0.85 in hard mode, 1 in easy). No real workbook was available, so it was not learned from data. `scripts/collateral/profile-corruption.mjs file.xlsx …` prints counts only (position in token, `?` per token, damaged tokens per cell, token length, casing, terminal `?`, `?` inside codes, mojibake / U+FFFD, share of clean text); run it locally on real files and set the operator weights from it. It was run only on the synthetic sample, which proves it works, not that the mix is realistic.

## Leakage control
* Concept split by hash of the concept id (train 732 / validation 138 / test 163 phrase-concepts; one-word glue concepts are always train so the held-out condition does not invent unknown function words).
* Template families split on their own; test families share no template with train/validation.
* The lexicon of the primary test condition holds train+validation concepts only; the calibration uses a lexicon of train concepts only against validation records. The test split was scored once per condition after calibration was frozen.
* Seeds fixed (validation 1001; test 2001+k); 3 seeds × 600 records.
* Verified by tests: disjoint splits, seed reproducibility, anchors untouched, `?` only at inserted positions, truth = ASCII of the accented truth.

Limit: a train-split syllable can still occur in a test phrase; that is the point of testing generalisation, but it means held-out concepts are not unseen *vocabulary*.
