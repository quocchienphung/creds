# 06 · Benchmark and calibration

> **SYNTHETIC.** Text generated from the ontology and damaged by simulated operators. **REAL-WORLD ACCURACY NOT VERIFIED**: no reviewed real set was available. Reproduce: `node --experimental-strip-types scripts/collateral/evaluate-collateral.mjs --n 600 --seeds 3 --write` (raw: `benchmark-results.json`).

## Calibration (validation split, lexicon of train concepts only)
Smallest margin per impact tier at which accepted words reach ≥99% (n ≥ 100): **low 6** (883 words, 99.09%), **high 10** (386 words, 99.22%). `forceSlotMargin` 2 (smallest margin where high-impact words are ≥95% right; below it FORCE writes `KHONG XAC DINH`). Generated into `collateral/calibration.ts`, labelled `synthetic: true`.
The earlier run showed that without the "no `?` over a plain letter" rule no margin reached 99% at all (88% / 95%); that rule is what made SAFE usable.

## Frozen test split, 3 seeds × 600 records (≈2,270 damaged words per seed; word accuracy = damaged words written exactly right)
Condition **held_out_concepts**: test concepts are not in the lexicon (the honest condition).

| system | policy | word acc. (range) | applied · precision | `?` left / in | protected-slot flips (mean per seed of 600 cells) |
|---|---|---|---|---|---|
| existing `predict.ts` file model (trained on 4,000 clean lines) | SAFE | 75.2% | 86.0% · 87.4% | 315 / 2272 | 39 |
| | FORCE | 78.2% | 100% · 78.2% | 0 | 48 |
| address-only geo engine | SAFE | 28.1% | 35.1% · 80.2% | 1471 / 2272 | 20 |
| | FORCE | 60.5% | 91.1% · 66.4% | 198 / 2272 | 71 |
| domain retrieval only (no LM) | SAFE | 32.4% | 32.4% · 100% | 1555 / 2272 | 0 |
| | FORCE | 61.7% | ~100% · 61.8% | 2 | 5 |
| **domain decoder (shipped)** | SAFE | 72.3% (70.2–74.0) | 73.2% · **98.8%** | 620 / 2272 | **0** |
| | FORCE | **82.8%** (80.7–85.0) | ~100% · 82.9% | 2 | 8 |
| decoder + synthetic template corpus (**not promoted**) | SAFE / FORCE | 71.0% / 79.1% | 73.5% · 96.7% / – | – | 4 / 32 |

Condition **in_lexicon** (every concept indexed; upper bound, since the phrase being repaired can be looked up): decoder SAFE 85.4% word acc., 85.7% applied at **99.7%** precision, 0 flips; FORCE **93.3%**, 3 flips.

## Reading it honestly
* SAFE precision on the frozen test (98.8% held-out) is **below** the 99% calibration target (99.1% on validation): the margin does not transfer perfectly, as expected with out-of-lexicon words.
* The baseline's SAFE "applied precision" (87%) is its own calibration, measured on its own clean text; it flips protected values 39–48 times per 600 cells where the decoder flips 0 (SAFE) / 8 (FORCE). `KHONG XAC DINH` is not counted as a flip and is never equal to the truth.
* Exact **cell** accuracy is low (decoder FORCE 25% held-out, 32% in-lexicon) because "hard" records damage 60–100% of the words; one wrong word spoils the cell. By difficulty (SAFE, applied words): easy 96.2%, medium 94.5%, hard 91.4%.
* By status (held-out, seed-pooled): `safe_auto_domain_calibrated` 98.8% (4,755 words), `forced_guess` 72.8% (1,373), `needs_review` words would have been right 70.5% (1,456). By domain, precision of all tokens in FORCE ranges 85% (geographic, property rights, deposits) to 97% (future asset).
* Ablation 5 (synthetic corpus) lowered held-out accuracy (82.8 → 79.1 FORCE): random concept juxtapositions create spurious bigrams. Reported as a negative result; the production lexicon is the ontology only. Ablation 6 (neural reranker): not evaluated (see 04).
* Anchors: 0 cells lost a protected number or code in any system. Timings: ~0.8 ms per cell (decoder); the geo engine is ~13 ms per cell on the same text.

## Address model (Phase 1, SYNTHETIC addresses)
SAFE (high 12 / context 2 / contextual off): 94.4% of words accepted at 99.07% precision, versus 99.6% at 97.96% before. `forced_guess` words 76.9% right (965 words).
