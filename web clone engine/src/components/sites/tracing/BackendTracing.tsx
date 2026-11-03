"use client";

import { useProcessSources } from "../process/use-process-sources";
import { Tracing } from "./TracingPage";

/** The Tracing page on the workspace backend: it reads the same plans and runs as the Process page, and never writes them. */
export function BackendTracing({ workspaceId }: { workspaceId: string }) {
  const { dataSource, runSource, remote } = useProcessSources(workspaceId);
  return <Tracing workspaceId={workspaceId} dataSource={dataSource} runSource={runSource} remote={remote} />;
}
