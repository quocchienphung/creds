# 02 · Domain ontology and sources

Code: `engine/collateral/ontology.ts` (data), `lexicon.ts` (indexes).

## Content
960 phrase-concepts in 12 domains (land-use right 64, land-attached asset 51, house/building 63, future asset 24, vehicle 95, machinery 95, inventory 89, deposits/papers 58, property rights/receivables 75, ownership/security status 144, general documents/connectives 145, geographic 57), each with `id`, `domain`, accented `canonical`, `source`, optional `weight` (function words count 25× because they are far more frequent in running text than in a phrase list). The ASCII alias is derived (`toAscii`); there is no `? → answer` table. `#` inside a phrase stands for a number or a code (`số #`, `# mét vuông`).

The distinctions the spec asks to keep apart are separate concepts: *quyền sử dụng đất* / *quyền sở hữu nhà ở* / *tài sản gắn liền với đất*; *giấy chứng nhận* / *giấy tờ có giá*; *sổ tiết kiệm* / *số*; *hiện có* / *hình thành trong tương lai*; *thế chấp / cầm cố / bảo lãnh / giữ hộ / chuyển nhượng / cho thuê*; owner / user / secured party roles.

## Protected semantic slots
`SLOT_VALUES` lists the values of one legal attribute (right, registration, polarity, relation, temporal, role, ownership, document). The **protected syllables** are those that tell the values apart (syllables every value shares, such as *đăng ký* in *đã/chưa đăng ký*, are not). A damaged word that resolves to a protected syllable is **high impact**: SAFE needs a larger calibrated margin; FORCE never writes it below `forceSlotMargin` and writes `KHONG XAC DINH` instead.

Known weakness: protection is per syllable, so `đồng` (in *đồng sở hữu*) is high impact even when it means the currency. This costs SAFE coverage, not safety.

## Sources and provenance
| id | source | status |
|---|---|---|
| BLDS2015 | Bộ luật Dân sự 2015 (Điều 105, 107, 115) | **`verified: false`** |
| ND21 | Nghị định 21/2021/NĐ-CP | **`verified: false`** |
| LDD2024 | Luật Đất đai 2024 | **`verified: false`** |
| LNO2023 | Luật Nhà ở 2023 | **`verified: false`** |
| PRACTICE | author-drafted common collateral wording (vehicles, machinery, goods, deposits, connectives) | original work |

**Honest limit:** the sections were drafted from knowledge of the vocabulary of those instruments. The cited URLs were **not fetched or re-read** in this work, the articles and effective dates are unchecked, and no licensed Vietnamese text corpus (spec tier C) was added. The ontology is a vocabulary aid; it asserts no eligibility as security and no ownership.

## Not done
Tier A cross-job feedback store (user-confirmed repairs) and tier C licensed corpus: not built. `verified_by_human` promotion is therefore not implemented either; forced guesses are never promoted by anything.
