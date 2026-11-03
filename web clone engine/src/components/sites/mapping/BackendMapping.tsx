"use client";

import { useMemo } from "react";
import type { ComponentProps } from "react";
import { BackendError, createSnapshotSource } from "@/lib/workspace-backend";
import { useWorkspaceBackend } from "@/lib/workspace-backend/react";
import { Mapping } from "./Mapping";
import { normalizeData } from "./mapping-store";

const checked = (raw: unknown) => {
  const data = normalizeData(raw);
  if (!data) throw new BackendError("invalid", "The stored map is not in a format this version understands.");
  return data;
};

/**
 * The map backed by the workspace backend (this browser by default, the REST API when one is configured).
 * The map itself stays independent: it only knows the `dataSource` interface in mapping-data-source.ts.
 */
export function BackendMapping(props: Omit<ComponentProps<typeof Mapping>, "dataSource">) {
  const backend = useWorkspaceBackend();
  const dataSource = useMemo(() => createSnapshotSource(backend, { name: "mapping", workspaceId: props.workspaceId }, checked), [backend, props.workspaceId]);
  return <Mapping {...props} dataSource={dataSource} />;
}
