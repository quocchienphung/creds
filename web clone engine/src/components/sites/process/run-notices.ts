import type { Notice } from "../affectui-notification-stack/stack-model.ts";
import { modelLabel } from "./catalog.ts";
import { findNode } from "./process-model.ts";
import type { ProcessDoc } from "./process-model.ts";
import type { RunSnapshot } from "./run-model.ts";

/**
 * What a person should be told as a run goes on: a block finished, a block failed (with its reason and a way to retry), the run is over.
 * Derived by comparing each snapshot with the statuses the page already knew, so a page that opens in the middle of a run stays quiet about
 * what happened before it was looked at, and a block that a loop runs again is announced again, once per round. Waiting for a person is
 * not announced here: the Permission Request card already asks. Pure: no timers, no React.
 */
export type NoticeIntent = { kind: "retry" | "locate"; blockId: string } | { kind: "trace" };
export interface ProcessNotice extends Omit<Notice, "action"> { intent?: NoticeIntent; actionLabel?: string; blockId?: string }

export interface NoticeContext { doc: Pick<ProcessDoc, "name" | "root">; formatCost: (amount: number) => string; showCost: boolean; formatDuration: (ms: number) => string }
export interface NoticeStep { /** The statuses to remember for the next snapshot. */ known: Record<string, string>; notices: ProcessNotice[]; /** Notices that are no longer true (a block that failed is running again). */ retire: string[] }

/** How long a quiet "done" stays before it goes away by itself. A failure stays until it is dealt with. */
export const DONE_EXPIRES_MS = 9000;

const keyOf = (blockId: string, round: number) => `${blockId}@${round}`;
export const noticeId = (runId: string, kind: string, blockId: string, round: number) => `${runId}:${kind}:${blockId}:${round}`;

/** Every pass of a block that has a status: the earlier passes of a loop (once a later pass started they are over) and the current one. */
function passesOf(run: RunSnapshot["nodes"][string]) {
  return [...(run.rounds ?? []).map(earlier => ({ round: earlier.round, status: earlier.status, cost: earlier.cost, started: earlier.started, ended: earlier.ended, error: earlier.error })),
    { round: run.round ?? 1, status: run.status, cost: run.cost, started: run.started, ended: run.ended, error: run.error }];
}

export function statusesOf(snapshot: RunSnapshot): Record<string, string> {
  const known: Record<string, string> = { "": snapshot.state };
  for (const [id, run] of Object.entries(snapshot.nodes)) for (const pass of passesOf(run)) known[keyOf(id, pass.round)] = pass.status;
  return known;
}

export function diffRun(previous: Record<string, string> | null, snapshot: RunSnapshot, context: NoticeContext): NoticeStep {
  const known = statusesOf(snapshot);
  if (!previous) return { known, notices: [], retire: [] };
  const { doc, formatCost, showCost, formatDuration } = context;
  const rootId = doc.root.id;
  const notices: ProcessNotice[] = [], retire: string[] = [];
  const finished: { id: string; round: number; name: string; text: string }[] = [];

  for (const [id, run] of Object.entries(snapshot.nodes)) {
    const node = findNode(doc.root, id);
    if (!node) continue;
    for (const pass of passesOf(run)) {
      const round = pass.round, before = previous[keyOf(id, round)], now = pass.status;
      if (before === now) continue;
      if (before === "failed" && now !== "failed") retire.push(noticeId(snapshot.id, "failed", id, round));
      if (now === "failed") {
        notices.push({
          id: noticeId(snapshot.id, "failed", id, round), badge: "Failed", tone: "error", pattern: "rays", blockId: id, title: `${node.name} failed`,
          text: pass.error ?? "The block could not finish.", intent: { kind: "retry", blockId: id }, actionLabel: "Retry",
        });
      } else if (now === "done" && id !== rootId && before !== undefined) {
        const spent = pass.started !== undefined && pass.ended !== undefined ? formatDuration(pass.ended - pass.started) : "";
        const cost = showCost ? formatCost(pass.cost ?? 0) : "";
        finished.push({ id, round, name: node.name, text: [modelLabel(node.ai.provider, node.ai.model), cost, spent].filter(Boolean).join(" · ") + (round > 1 ? ` · round ${round}` : "") });
      }
    }
  }

  // Several blocks finishing together are one notice: a run of eight blocks must not be eight cards
  if (finished.length === 1) {
    const [only] = finished;
    notices.push({ id: noticeId(snapshot.id, "done", only.id, only.round), badge: "Done", tone: "success", pattern: "grid", blockId: only.id, title: `${only.name} finished`, text: only.text, intent: { kind: "locate", blockId: only.id }, actionLabel: "Show on the map", expireMs: DONE_EXPIRES_MS });
  } else if (finished.length > 1) {
    const names = finished.map(item => item.name);
    notices.push({
      id: noticeId(snapshot.id, "done", finished.map(item => `${item.id}.${item.round}`).join("+"), 0), badge: "Done", tone: "success", pattern: "grid", blockId: finished[0].id, title: `${finished.length} blocks finished`,
      text: names.length > 4 ? `${names.slice(0, 4).join(", ")} and ${names.length - 4} more` : names.join(", "), intent: { kind: "locate", blockId: finished[0].id }, actionLabel: "Show the first", expireMs: DONE_EXPIRES_MS,
    });
  }

  // The run itself
  const was = previous[""], now = snapshot.state;
  if (was !== now && (now === "done" || now === "failed" || now === "stopped")) {
    const total = Math.max(0, ...Object.values(snapshot.nodes).map(run => run.ended ?? 0)) - snapshot.startedAt;
    const cost = showCost ? formatCost(Object.values(snapshot.nodes).reduce((sum, run) => sum + run.cost + (run.rounds ?? []).reduce((a, earlier) => a + earlier.cost, 0) + (run.attempts ?? []).reduce((a, attempt) => a + attempt.cost, 0), 0)) : "";
    const blocks = Object.keys(snapshot.nodes).length;
    notices.push({
      id: noticeId(snapshot.id, "run", now, 0), badge: now === "done" ? "Run finished" : now === "failed" ? "Run failed" : "Run stopped", tone: now === "done" ? "success" : now === "failed" ? "error" : "neutral",
      pattern: now === "done" ? "rings" : "rays", title: now === "done" ? `${doc.name} is done` : now === "failed" ? `${doc.name} did not finish` : `${doc.name} was stopped`,
      text: [`${blocks} block${blocks === 1 ? "" : "s"}`, cost, total > 0 ? formatDuration(total) : ""].filter(Boolean).join(" · "), intent: { kind: "trace" }, actionLabel: "Open the trace", ...(now === "done" ? { expireMs: DONE_EXPIRES_MS * 2 } : {}),
    });
  }
  return { known, notices, retire };
}
