import path from "node:path";
import { installBundle } from "./install-bundle.mjs";
import { agentsRoot, StoreError } from "./workspace-store.ts";

const agentRule = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

/** `LOGIO_AGENTS` (comma separated) limits which agent ids may receive skills; unset allows any well-formed id. */
export function agentAllowed(agent: string): boolean {
  if (!agentRule.test(agent) || agent.includes("..")) return false;
  const list = (process.env.LOGIO_AGENTS ?? "").split(",").map(item => item.trim()).filter(Boolean);
  return !list.length || list.includes(agent);
}
export const restrictedAgents = () => Boolean((process.env.LOGIO_AGENTS ?? "").trim());

/**
 * `skill.transfer` on the home server: validate the whole bundle (hashes, byte counts, safe paths), write it into
 * `<LOGIO_AGENT_SKILLS_DIR>/<agent>/` and return the receipt the page checks. Nothing in the bundle is executed.
 * A receipt means the files were written, not that a model loaded them.
 */
export async function deliverToAgent(workspaceId: string, input: unknown) {
  const body = input as { agent?: unknown; bundle?: { workspaceId?: unknown } } | null;
  if (!body || typeof body.agent !== "string" || !agentAllowed(body.agent)) throw new StoreError("This agent id is not configured on the server.", 403);
  if (!body.bundle || body.bundle.workspaceId !== workspaceId) throw new StoreError("The bundle belongs to a different workspace.", 400);
  const directory = path.join(agentsRoot(), body.agent);
  try {
    const { receipt } = await installBundle(body.bundle, { directory, force: true });
    return { ...receipt, agent: body.agent };
  } catch (error) {
    throw new StoreError(error instanceof Error ? error.message : "The bundle could not be installed.", 422);
  }
}
