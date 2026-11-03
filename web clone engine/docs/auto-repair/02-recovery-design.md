# Recovery design and scope

Implemented MVP: pure TypeScript, Verified-only, existing worker/RPC/review/fflate architecture. No neural model, remote inference, dictionary of repaired words, or new production dependency.

## Decision path

- `corruption-span.ts`: original UTF-16 offsets, `?`, U+FFFD, possible terminal punctuation/URLs, reversible mojibake. Terminal `Anh?` remains ambiguous. Mask matching is a bounded NFA (32 letters/combining marks per unknown run, 128 parts, 100k operations); masks may expand to several characters. Every unmasked character, including accents/case/digits, must match exactly. Search normalization never changes the input.
- `evidence-index.ts`: indexes only damaged text field scopes, from clean **original** text in the same sheet, role and schema-equivalent field. Manually patched source cells, formula/merged/rich text, corrupted values and invented/model output are excluded. Identity requires the exact branch/customer/asset tuple. Twin/duplicate records with the same value do not count as independent confirmations. Distinct clean values for that identity block recovery.
- `candidate-generator.ts`: exact entity lookup first; otherwise bounded same-field prefix retrieval (128 sources, top eight candidates). Other-asset candidates cannot authorize a patch. Reversible Windows-1252/UTF-8 decoding additionally needs matching clean same-entity evidence.
- `context-ranker.ts`: stable frequency scoring with the existing VietnameseModel; a score is not a calibrated probability. Same-entity evidence takes precedence. This MVP does not add a full new character n-gram/trigram language model.
- `repair-decision.ts`: `source_verified`, `model_high_confidence`, `needs_review`, `blocked`, `unchanged`. Only a unique clean same-entity match can be auto-applied. `model_high_confidence` is reserved and never emitted: there is no independently calibrated threshold. Formula, non-text and protected roles stay unchanged. Digits, unmasked text and formula-like prefixes are checked again.
- `auto-repair.ts`: visits every materialized cell on every worksheet, including headers, unmapped fields and hidden rows. Unmapped cells are reported, not guessed. Records Unicode/whitespace/control anomalies too. Existing edits/exceptions are preserved. One batch is validated before a single history commit; failure/cancel produces no commit or download. Existing typed edits may be included in the copy and are counted separately. JSON readiness uses separate gates.

`S? ti?t ki?m` can be restored from a clean equivalent source. `Quy?n s? d?ng d?t` cannot become `Quyền sử dụng đất`: the unmasked `d` would change to `đ`. No clean source, punctuation ambiguity, conflicting sources, or an unsupported text structure leaves the cell unresolved.

## Format preservation

`xlsx-reader.ts` uses the small strict `xml-scan.ts` scanner and `xlsx-zip.ts` (fflate streaming inflater with declared and actual size budgets, counts, CRC32, path/duplicate checks). It accepts single/double quotes and prefixes, rejects malformed XML/DTD/unsupported CDATA, invalid references and missing parts, and preserves raw numeric lexical text. Formulas are never evaluated. Number exponents expand with string arithmetic; decimal addition uses BigInt. There is no inferred currency rounding policy.

`xlsx-patcher.ts` changes existing approved cell spans only in the automatic path. All attributes except the intended type change stay intact; a targeted shared string becomes inlineStr without changing its table entry or other references. Rich text, merged ranges, array/shared-formula dependencies and formulas are read but refused as write targets. Names, filters, panes, styles, relationships, sheet order and calcChain remain in untouched bytes outside those spans. ZIP compression itself changes the container bytes.

Runtime verification combines cell/type/style/formula checks and package-entry/XML-outside-target comparisons. It shares the XML scanner and is **not** claimed to be a fully independent parser. Independent test verification uses Python zipfile/ElementTree and real installed Excel 16.0 on synthetic fixtures.

Formatting-only blank rows keep the original reader contract: they are not data rows for required-field/grouping validation. Explicit blank cells in those skipped rows are counted as unchanged (`Sheet.emptyCells`), and their XML/styles/hidden state remain byte-preserved. Thus preserving blank formatting does not introduce false missing-required errors or lose workbook accounting.

## Explicit boundaries

The engine inflates in bounded chunks but still materializes the workbook, shared strings and one whole worksheet string; it is not a constant-memory streaming reader. Patching/re-reading/package verification are synchronous inside the worker. Cancel is cooperative at stage/500-row checkpoints and may wait through these phases. The benchmark records the largest checkpoint gap. ZIP64, encrypted/legacy XLS, unsupported XML constructs and exceeded budgets fail closed.

No approved private real-error gold set was supplied or inspected. Same-file retrieval is reported separately from unmeasured model generalization. Optional approved corpus import, full language-model improvements and calibrated model auto-apply remain future research, not completed features.
