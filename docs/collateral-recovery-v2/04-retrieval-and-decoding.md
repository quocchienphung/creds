# 04 · Retrieval and decoding

Code: `collateral/lexicon.ts`, `recover.ts`, `complete.ts`; wiring in `auto-repair.ts`.

## Order inside one cell (only cells holding `?`, not formulas, role free text or name, no clean same-asset record)
1. `recoverCollateralText` (ontology) → 2. `recoverAddressText` (geo, if the dataset loaded) on what is left → 3. FORCE only: `completeRemaining`.
Starting text is the calibrated file-model repair when there is one. Collateral runs before geo because geo rewrites real words as place names (see 01).

## Collateral decoder
* **Spans / tokens**: runs of letters, marks, digits and `?`. A `?` that is punctuation (ends the text, inside a link) is not part of a word (`corruptionSpans`). A token with digits and `?` is a protected anchor and is never completed. Numbers, mixed alphanumerics and unknown short capital words (QJ, XD, HĐTC) become one symbol `#`.
* **Candidate lattice**: for each damaged word the accented syllables of the ontology that fit its visible letters (one letter per `?`; a letter written with a mark must match exactly, a plain letter matches its marked forms), plus a costlier reading where one `?` stands for up to three letters. Clean words contribute their accented spellings. A `?` over a plain letter is penalised and, in SAFE, refused (the export loses marked letters, so such a reading signals the true word is missing).
* **Ranking**: syllable unigram + bigram, and a reward for readings that spell a contiguous phrase of the ontology (windows of 2–6 words, once per word, larger when the window is a whole concept and covers the cell). Viterbi with max-marginals; the **margin** is the gap to the best reading that writes something *else* (readings differing only in marks write the same ASCII).
* **Recognition**: a cell is touched only if some damaged word has support from an ontology phrase of ≥2 words. Otherwise nothing is changed and later stages decide.
* **Domain**: the domains of the supporting phrases give `domainCandidates` (scores normalised), and each word its own domain.
* **ASCII**: only after selection: `toAscii` (NFD, marks off, `đ→d`), case kept (a lost first letter: capitals if the text is, title case at the start of the text or when every clean word is title case, otherwise lower).

## Decision per word
| | SAFE_AUTO | FORCE_NO_QUESTION_MARK |
|---|---|---|
| phrase support ≥2, no `?` over a plain letter, margin ≥ tier margin (low 6, high 10) | `safe_auto_domain_calibrated` | same |
| otherwise, low impact | `needs_review` (`?` stays) | `forced_guess` |
| otherwise, high impact, margin < `forceSlotMargin` (2) | `needs_review` | `fallback_lossy`, text `KHONG XAC DINH` |
| otherwise, high impact | `needs_review` | `forced_guess` |
| digits with `?` | `blocked_protected_anchor` | same |
| lone terminal `?` / link `?` | `legitimate_question_mark` (not a token) | same |

`completeRemaining` (FORCE, free-text cells only, never a proper name): a word the file's own clean text can predict → `forced_guess`; nothing fits → the placeholder is dropped, `fallback_lossy`; anchors stay.

## Not implemented
No neural reranker (spec §10): the deterministic engine's ceiling was not reached on available evidence, and no model asset or real holdout justifies one. Wildcard retrieval is by token-length shape + masks, not a character n-gram index. NFD input is skipped (`text !== NFC` → untouched).
