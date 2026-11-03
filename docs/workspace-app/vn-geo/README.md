# Vietnamese address recovery (offline)

Repairs the `?` a legacy export left in place of Vietnamese letters, in the **address and location parts** of any text cell of any workbook. It runs in the browser worker, uses no network at run time, no paid API, no Google Maps and no cloud AI. It does not depend on MAU9.

## What it does

1. **Classifies** each comma/semicolon/line separated segment of a cell from content only (`engine/geo/address-classifier.ts`): type words that introduce a number or an existing name (Phường, Hẻm, Chung cư ...), administrative-unit names, place-name phrases, vocabulary, and, as weak clues, the column header and neighbouring segments. Which words are "types" is learned from how names in the data begin; no word list is written in the code.
2. **Reasons in accented Vietnamese**: every damaged word gets the accented syllables of the data that fit its visible letters (one `?` = one letter; a `?` standing for several letters only when nothing fits), clean words get their accented forms, and the whole phrase is decoded at once (Viterbi over an accented unigram/bigram model plus a reward for words that form a real administrative unit, street or place name, more when it lies under the units found in the cell). A cell whose units are damaged too is decoded twice: the second pass reads the units from the first pass's best phrase.
3. **Converts the chosen reconstruction to Vietnamese without marks** (`toAscii`: NFD, marks removed, `đ`→`d`, case kept) and writes only that. Digits, letters outside damaged words and layout are never touched.
4. **Reports honestly**: every damaged word gets a status. `FORCE_NO_QUESTION_MARK` writes the best choice for every damaged word of an address segment and marks the doubtful ones `forced_guess`; `SAFE_AUTO` writes only trusted ones and leaves the rest as `?`.

| status | meaning |
|---|---|
| `verified_official` | the word is in an official administrative unit name and the margin to the runner-up passes the calibrated floor |
| `high_confidence_auto` | margin ≥ the calibrated `highMargin` (held-out precision ≥ 99%) |
| `contextual_auto` | backed by a name in the data under the cell's units |
| `forced_guess` | best available choice, below the trust margins; recorded |
| `fallback_lossy` | no syllable of the data fits: the placeholder is dropped, nothing invented |
| `unchanged_legitimate_punctuation` | a real question mark (lone `?` ending the text, or beside a whole syllable no syllable extends) |
| `rejected_numeric_anchor_conflict` | digits and `?` in one word (`12?3`): never changed |
| `needs_review` | `SAFE_AUTO` only: left as `?` |

The report (`report.geo`) holds counts only. The **address audit** (original, accented, ASCII, status, margin, runner-up, evidence per word) contains cell values and is a separate local download. The final status is never a claim of full verification: `ADDRESS_SPANS_COMPLETED_WITH_FORCED_GUESSES` / `..._WITH_LOSSY_FALLBACKS` / `..._PARTIAL`.

## Data (`public/data/vn-geo`, built by `scripts/geo`)

| source | licence | use |
|---|---|---|
| [thanglequoc/vietnamese-provinces-database](https://github.com/thanglequoc/vietnamese-provinces-database) | MIT | recorded (63 provinces / 692 districts / 5,720 wards) and current (34 / 3,321) administrative units |
| [trucmtnguyen/vietnam-address-collection](https://huggingface.co/datasets/trucmtnguyen/vietnam-address-collection) | Apache-2.0 | ~80k street/address names under their wards |
| OpenStreetMap Vietnam (Geofabrik extract, names only) | ODbL 1.0, © OpenStreetMap contributors | ~274k place, road and feature names |

`manifest.json` records version, counts, URLs, licences and the sha256 of each raw file. **Attribution:** map data © OpenStreetMap contributors, ODbL. The NSO administrative catalogue (Excel) is a documented manual import (`scripts/geo/fetch-datasets.mjs --nso file`); a parser for it is **not** written.

Rebuild: `node scripts/geo/fetch-datasets.mjs [--osm]` → `node scripts/geo/build-geo-dataset.mjs`. The recorded (as written on the document) and current units are both kept; the engine matches against both and never rewrites a historical address to its current form.

## Measured (held-out; `public/data/vn-geo/evaluation.json`)

`node --experimental-strip-types scripts/geo/evaluate-geo.mjs --n 2000 --write`: every 10th ward (572 of 5,720) is held out together with all its streets, and the OSM names equal to a test street are removed, so no test address, and no street name that exists only there, is in the knowledge. Test addresses are `street, ward, district, province` (a quarter in capitals), damaged like the export does (a marked letter becomes `?` 70% / its plain letter 30%).

- 2,000 addresses, 17,094 damaged words: **word accuracy 97.8%**, **whole-address exact 85.3%** (unseen street names: 85.4%).
- `highMargin` 6 → **99.2% precision on 16,313 words**; `contextMargin` 0 → 98.0% on words backed by a name in the data.
- `forced_guess`: 356 words at **52.5%** precision: these are the honest coin flips.
- 55 ms per address on the development machine (with the knowledge already built; building it takes a few seconds once per worker).

The corruption model is simulated; real exports may damage other things. Re-run the evaluation on your own files' clean text before relying on the numbers.

## Known limits

- A ward or street absent from every dataset can only be guessed from syllable statistics (`forced_guess`).
- Sentences made only of common place-name syllables can be classified as addresses; a trailing `?` is kept, other `?` in such text may be guessed.
- A person's name beside an address in the same cell is repaired as address text.
- Case of a word whose first letter was lost follows the cell's style (`Duong` where the source wrote `đường`).
- The fixed weights of the decoder (`W` in `address-recovery.ts`) were set by error analysis on the held-out split, then measured on it: some optimism is possible. The trust margins are calibrated, not hand-set.

## Evidence

`docs/workspace-app/vn-geo/sample`: `before.xlsx`, `after.xlsx`, `evidence.json`, `address-audit.json`, made by `node --experimental-strip-types scripts/geo/make-sample.mjs` (held-out knowledge, independent Python read-back of the exported file).
