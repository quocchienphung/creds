import { problemsOf } from "./catalog.ts";
import { countNodes, depthOfNode, flattenNodes, LIMITS } from "./process-model.ts";
import type { ProcessDoc, ProcessNode } from "./process-model.ts";
import type { NodeRun } from "./run-model.ts";

export type BlockShortcutId = "run" | "review" | "retry" | "trace" | "settings" | "add" | "duplicate" | "approval" | "delete";
export interface BlockShortcut {
  id: BlockShortcutId;
  label: string;
  description: string;
  disabled: boolean;
  danger?: boolean;
  /** Pressed while the menu is open: a letter, or `Delete`. Run, review and retry share R: only one of them is offered at a time. */
  hotkey: string;
}
/** The menu exposes existing operations, with the same execution/structure guards as the studio. */
export function blockShortcuts(doc: ProcessDoc, node: ProcessNode, options: { active: boolean; starting?: boolean; run?: NodeRun }): BlockShortcut[] {
  const { active, starting = false, run } = options;
  const locked = active || starting;
  const firstProblem = flattenNodes(node).flatMap(child => problemsOf(child).map(reason => `${child.name}: ${reason}`))[0];
  const root = doc.root.id === node.id, total = countNodes(doc.root), branchSize = countNodes(node);
  const frozen = "Stop the current run before changing its blocks.";
  const primary: BlockShortcut = run?.status === "waiting"
    ? { id: "review", hotkey: "R", label: "Review request", description: "Read this block’s actual request before approving or rejecting it.", disabled: false }
    : run?.status === "failed"
      ? { id: "retry", hotkey: "R", label: "Retry block", description: "Retry the failed attempt using its saved run settings.", disabled: starting }
      : active
        ? { id: "trace", hotkey: "T", label: "Open run trace", description: "Inspect the current process run in Tracing.", disabled: false }
        : { id: "run", hotkey: "R", label: "Run from here", description: starting ? "A run is already starting." : firstProblem || `Run this block${branchSize > 1 ? ` and its ${branchSize - 1} connected sub-blocks` : ""}.`, disabled: starting || !!firstProblem };
  const addLimit = total >= LIMITS.nodes || depthOfNode(doc.root, node.id) + 1 >= LIMITS.depth;
  const copyLimit = total + branchSize > LIMITS.nodes;
  const humanApproval = node.ai.provider === "human" && node.approval;
  return [
    primary,
    { id: "settings", hotkey: "S", label: "Block settings", description: "Open the existing block settings panel.", disabled: false },
    { id: "add", hotkey: "A", label: "Add sub-block", description: locked ? frozen : addLimit ? "The process block or depth limit has been reached." : "Connect a new block below this one, then configure its task.", disabled: locked || addLimit },
    { id: "duplicate", hotkey: "D", label: "Duplicate branch", description: locked ? frozen : root ? "The first block cannot be duplicated here. Duplicate the process from the library instead." : copyLimit ? "The copy would exceed the process block limit." : "Copy this block and its descendants with fresh IDs; keep the original unchanged.", disabled: locked || root || copyLimit },
    { id: "approval", hotkey: "P", label: node.approval ? "Remove approval" : "Require approval", description: locked ? frozen : humanApproval ? "A person’s block must keep its approval rule." : "Change whether a person reviews this block before it runs.", disabled: locked || humanApproval },
    { id: "delete", hotkey: "Delete", label: "Delete block", description: locked ? frozen : root ? "The first block cannot be deleted." : "Review a confirmation before deleting this block and its descendants.", disabled: locked || root, danger: true },
  ];
}

export interface MenuPointer { clientX: number; clientY: number; button: number; pointerType?: string }
/**
 * Where the shortcut menu opens. A right click (button 2) or a touch opens it at the pointer; the Menu key or Shift + F10 reports
 * another button (-1 in Chromium, 0 elsewhere), so the menu opens at the middle of the focused block.
 */
export function menuAnchor(event: MenuPointer, rect: { left: number; top: number; width: number; height: number }): { x: number; y: number; keyboard: boolean } {
  const keyboard = event.button !== 2 && event.pointerType !== "touch";
  return keyboard ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, keyboard } : { x: event.clientX, y: event.clientY, keyboard };
}
