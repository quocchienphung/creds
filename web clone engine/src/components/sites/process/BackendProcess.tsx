"use client";

import { Process } from "./ProcessPage";
import { useProcessSources } from "./use-process-sources";

/** Connects the Process page to the workspace backend: the `process` resource holds the plans, `process-run` the simulated engine's runs. */
export function BackendProcess({ workspaceId }: { workspaceId: string }) {
  const { dataSource, runSource, remote } = useProcessSources(workspaceId);
  return <Process workspaceId={workspaceId} dataSource={dataSource} runSource={runSource} remote={remote} />;
}
