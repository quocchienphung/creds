"use client";
import { useMemo } from "react";
import { BackendError, createSnapshotSource } from "@/lib/workspace-backend";
import { useWorkspaceBackend } from "@/lib/workspace-backend/react";
import { Invoice } from "./Invoice";
import { normalizeLibrary } from "./invoice-model";
export function BackendInvoice({ workspaceId }: { workspaceId: string }) {
  const backend = useWorkspaceBackend();
  const dataSource = useMemo(() => {
    const ref = { name: "invoice" as const, workspaceId };
    const snapshot = createSnapshotSource(backend, ref, raw => {
      const library = normalizeLibrary(raw);
      if (!library) throw new BackendError("invalid", "The saved invoice data is invalid. Your stored copy has been kept.");
      return library;
    });
    return { ...snapshot, async save(...args: Parameters<typeof snapshot.save>) {
      await snapshot.save(...args);
      // The shared local backend tolerates full storage. Invoice must not report a successful save in that case.
      if (!backend.remote && backend.peek && JSON.stringify(backend.peek(ref)?.value) !== JSON.stringify(args[0])) throw new BackendError("network", "Browser storage is unavailable or full. Export your edits before leaving this page.");
    } };
  }, [backend, workspaceId]);
  return <Invoice workspaceId={workspaceId} dataSource={dataSource} remote={backend.remote} />;
}
