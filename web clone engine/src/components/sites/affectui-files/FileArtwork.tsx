import type { FileKind } from "./files-model";
import { kindBadges } from "./files-model";

/** Editable CSS artwork: layered paper, glass label, and a folder with three sheets. */
export function FileArtwork({ kind }: { kind: FileKind }) {
  return <span className="files-art" data-kind={kind} aria-hidden="true"><span className="files-art__back" /><span className="files-art__page">{kind === "spreadsheet" ? <span className="files-art__sheet">{Array.from({ length: 18 }, (_, i) => <i key={i} />)}</span> : <>{(kind === "pdf" || kind === "image") && <span className="files-art__image" />}<i /><i /><i />{kind === "document" && <><i /><i /><i /></>}</>}</span><span className="files-art__badge">{kindBadges[kind]}</span></span>;
}
export function FolderArtwork() {
  return <span className="files-folder-art" aria-hidden="true"><span className="files-folder-art__back" /><i /><i /><i /><span className="files-folder-art__front" /></span>;
}
