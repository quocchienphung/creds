"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useSyncSummary } from "./react";
import type { BackendError } from "./types.ts";
import "./sync-status.css";

/**
 * Says what the connection to the backend is doing. It stays out of the way: nothing is shown while the
 * workspace is idle or while data only lives in this browser.
 */
export function SyncStatus() {
  const { t: uiText } = useWorkspaceI18n();
  const { summary, retryAll } = useSyncSummary();
  if (!summary.loading && !summary.saving && !summary.errors) return null;
  const failed = summary.errors > 0;
  return <div className="wb-sync" data-state={failed ? "error" : "busy"} role="status" aria-live="polite">
    <span className="wb-sync__dot" aria-hidden="true" />
    <span className="wb-sync__text">{uiText(failed ? (summary.message ?? "Couldn’t sync with the server.") : summary.saving ? uiText("Saving…") : uiText("Loading your data…"))}</span>
    {failed && <button type="button" className="wb-sync__retry" onClick={retryAll}>{uiText("Retry")}</button>}
  </div>;
}

/**
 * Tells what happened to a read model (see useQuery): nothing while the data is the screen's own, a loading
 * line while the server answers, and the reason plus a retry when the sample is shown because the server failed.
 */
export function QueryNotice({ query, what }: { query: { phase: "loading" | "ready"; error: BackendError | null; retry: () => void }; what: string }) {
  const { t: uiText } = useWorkspaceI18n();
  if (query.phase === "loading") return <div className="wb-notice" role="status"><span className="wb-sync__dot" aria-hidden="true" />{uiText("Loading ")}{uiText(what)}…</div>;
  if (!query.error) return null;
  return <div className="wb-notice" data-state="error" role="alert"><span className="wb-sync__dot" aria-hidden="true" /><span className="wb-sync__text">{uiText(query.error.message)} {uiText(" The sample ")}{uiText(what)} {uiText(" is shown instead.")}</span><button type="button" className="wb-sync__retry" onClick={query.retry}>{uiText("Retry")}</button></div>;
}
