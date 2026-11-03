/** Hard limits against hostile or accidental huge archives. Real workbooks of the target size (about 11 MB, 37 MB of sheet XML) fit with room to spare. */
export const LIMITS = { fileBytes: 120 * 1024 * 1024, entries: 2000, entryBytes: 400 * 1024 * 1024, totalBytes: 800 * 1024 * 1024, ratio: 1000 } as const;
