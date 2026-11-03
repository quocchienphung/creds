"use client";

import { Check, LoaderCircle, AlertCircle } from "lucide-react";
import { useCollateral } from "../CollateralProvider";
import { WorkspaceLink } from "../../guide-navigation/WorkspaceLink";
import { useQueueCopy } from "./queue-copy";

export function ArchiveNotice() {
  const { archive, retryArchive, saveToQueue, engine } = useCollateral();
  const copy = useQueueCopy();
  return <div className="cr-archive" data-error={archive?.state === "error"} role={archive?.state === "error" ? "alert" : "status"}>
    {archive?.state === "saving" ? <><LoaderCircle size={13} className="cr-archive__spin" />{copy("saving")}</>
      : archive?.state === "error" ? <><AlertCircle size={13} /><span>{copy("saveFailed")} {archive.message}</span><button type="button" onClick={retryArchive}>{copy("retry")}</button></>
      : <>{archive ? <Check size={13} /> : null}<span>{archive ? copy("saved") : "Local only · No upload"}</span>{!archive && engine.phase === "ready" && <button type="button" onClick={saveToQueue}>Save original to server Queue</button>}<WorkspaceLink href="/personalize?section=queue">{copy("viewQueue")}</WorkspaceLink></>}
  </div>;
}
