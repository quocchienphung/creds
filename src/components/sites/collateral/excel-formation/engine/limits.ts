/** Hard limits against hostile or accidental huge archives. Measured: a 43 MB workbook (8.3M cells, 242 MB of sheet XML) opens in ~8 s at ~1.9 GB peak.
 * shortcut: `cells` is capped by a browser worker's ~4 GB heap (~0.2 GB per million cells), and `entryBytes` by V8's ~512M-character string; raise them only by streaming the sheet XML. */
export const LIMITS = { fileBytes: 120 * 1024 * 1024, entries: 2000, entryBytes: 400 * 1024 * 1024, totalBytes: 800 * 1024 * 1024, ratio: 1000, cells: 12_000_000, strings: 6_000_000, rows: 1_048_576 } as const;
