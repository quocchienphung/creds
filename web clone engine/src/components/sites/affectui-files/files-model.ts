export type FileKind = "document" | "pdf" | "spreadsheet" | "image" | "other";
export type FileAccess = "shared" | "private";
export interface LibraryFile {
  id: string;
  name: string;
  kind: FileKind;
  owner: string;
  mine: boolean;
  access: FileAccess;
  folder: string | null;
  template: boolean;
  size: number;
  mime: string;
  createdAt: string;
  url?: string;
  localBlobId?: string;
  /** Editable, independently authored sample/document content, never a fabricated binary. */
  text?: string;
}
export interface FileLibrary { folderAccess: Record<string, FileAccess>; items: LibraryFile[] }
export const defaultFolders = ["Q3 Campaign", "Brand assets", "Hiring", "Research"];
export const emptyLibrary: FileLibrary = { folderAccess: {}, items: [] };
export const kindLabels: Record<FileKind, string> = { document: "Document", pdf: "PDF", spreadsheet: "Spreadsheet", image: "Image", other: "File" };
export const kindBadges: Record<FileKind, string> = { document: "DOC", pdf: "PDF", spreadsheet: "XLS", image: "IMG", other: "FILE" };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const access = (v: unknown): v is FileAccess => v === "private" || v === "shared";
export function safeFileUrl(value: unknown): value is string {
  if (typeof value !== "string" || /[\r\n\\]/.test(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
export function parseFileLibrary(raw: unknown): FileLibrary | undefined {
  if (!record(raw) || !record(raw.folderAccess) || !Object.values(raw.folderAccess).every(access) || !Array.isArray(raw.items)) return undefined;
  const ids = new Set<string>();
  for (const item of raw.items) {
    if (!record(item) || typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.name !== "string" || !item.name.trim() || item.name.length > 200 || typeof item.kind !== "string" || !Object.hasOwn(kindLabels, item.kind) || typeof item.owner !== "string" || typeof item.mine !== "boolean" || !access(item.access) || !(item.folder === null || typeof item.folder === "string") || typeof item.template !== "boolean" || typeof item.size !== "number" || !Number.isSafeInteger(item.size) || item.size < 0 || typeof item.mime !== "string" || typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt)) || (item.url !== undefined && !safeFileUrl(item.url)) || (item.localBlobId !== undefined && (typeof item.localBlobId !== "string" || !item.localBlobId)) || (item.text !== undefined && typeof item.text !== "string")) return undefined;
    ids.add(item.id);
  }
  return raw as unknown as FileLibrary;
}
export function fileKind(name: string, mime: string): FileKind {
  if (mime === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (/\.(xlsx?|csv|ods)$/i.test(name)) return "spreadsheet";
  if (mime.startsWith("text/") || /\.(docx?|md|rtf|odt)$/i.test(name)) return "document";
  return "other";
}
export function seedFileLibrary(workspaceId: string): FileLibrary {
  if (workspaceId !== "acme") return emptyLibrary;
  const groups: [string, FileAccess, string[]][] = [
    ["Brand assets", "shared", ["Brand-Guidelines", "Tone-of-Voice", "Logo-Usage"]],
    ["Hiring", "private", ["Interview-Guide", "Job-Description", "Candidate-Notes", "Offer-Checklist"]],
    ["Q3 Campaign", "shared", ["Campaign-Budget", "Campaign-Brief", "Content-Calendar", "Launch-Checklist", "Campaign-Results"]],
    ["Research", "private", ["Research-Notes", "Customer-Insights"]],
  ];
  const items: LibraryFile[] = groups.flatMap(([folder, visibility, names]) => names.map((name, i) => ({
    id: `sample:${folder}:${i}`, name, kind: name === "Campaign-Budget" ? "spreadsheet" : ["Brand-Guidelines", "Logo-Usage"].includes(name) ? "pdf" : "document",
    owner: visibility === "shared" ? "Jonas Weber" : "Alex Morgan", mine: visibility === "private", access: visibility, folder, template: ["Brand-Guidelines", "Campaign-Budget"].includes(name), size: 0, mime: "text/plain", createdAt: "2026-10-16T09:00:00Z",
    text: `${name.replaceAll("-", " ")}\n\nSample workspace document. Replace this content or upload your own file.\n`,
  })));
  for (const name of ["Design-Book", "Weekly-Report"]) items.push({ id: `sample:${name}`, name, kind: name === "Weekly-Report" ? "spreadsheet" : "document", owner: "Alex Morgan", mine: true, access: "private", folder: null, template: true, size: 0, mime: "text/plain", createdAt: "2026-10-16T09:00:00Z", text: `${name.replaceAll("-", " ")}\n\nSample workspace document. Replace this content with your own.\n` });
  return { folderAccess: Object.fromEntries(groups.map(([name, visibility]) => [name, visibility])), items };
}
