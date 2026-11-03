import type { Request, Response, WorkerMessage } from "./protocol.ts";
import type { RepairProgress } from "../excel-formation/engine/auto-repair.ts";

/** Thin promise wrapper around the worker. `cancel()` terminates it: the only way to stop a synchronous scan, and it also drops all data. */
export class EngineError extends Error {
  code?: string;
  constructor(message: string, code?: string) { super(message); this.name = "EngineError"; this.code = code; }
}
export type ProgressListener = (progress: { phase: "read" | "scan"; fraction: number }) => void;

export class EngineClient {
  private worker: Worker | null = null;
  private next = 1;
  private pending = new Map<number, { resolve: (response: Response) => void; reject: (error: Error) => void; progress?: ProgressListener; repairProgress?: (p: RepairProgress) => void }>();

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./collateral.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      const entry = this.pending.get(message.id);
      if (!entry) return;
      if ("repairProgress" in message) { entry.repairProgress?.(message.repairProgress); return; }
      if ("progress" in message) { entry.progress?.(message.progress); return; }
      this.pending.delete(message.id);
      if (message.ok) entry.resolve(message.response); else entry.reject(new EngineError(message.error, message.code));
    };
    worker.onerror = event => { this.failAll(new EngineError(event.message || "The review engine stopped unexpectedly.")); };
    this.worker = worker;
    return worker;
  }
  private failAll(error: Error) { for (const entry of this.pending.values()) entry.reject(error); this.pending.clear(); }

  call(request: Request, options: { progress?: ProgressListener; transfer?: Transferable[]; repairProgress?: (p: RepairProgress) => void } = {}): Promise<Response> {
    const worker = this.ensure();
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, progress: options.progress, repairProgress: options.repairProgress });
      worker.postMessage({ id, request }, options.transfer ?? []);
    });
  }
  /** Stop everything and forget the workbook. */
  cancel() {
    this.worker?.terminate();
    this.worker = null;
    this.failAll(new EngineError("Cancelled.", "cancelled"));
  }
}
