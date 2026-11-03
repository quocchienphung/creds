/** The slice of a resource entry that tells whether a change has really been stored. */
export interface SavingEntry {
  flush(): Promise<void>;
  subscribe(listener: () => void): () => void;
  getSnapshot(): { save: "idle" | "saving" | "error"; error: { message: string } | null };
}

/**
 * Save now and wait until the change is stored: resolves when the entry is idle, rejects with the backend's message when saving fails, or when it is
 * still going after `timeoutMs`. A change that is retried in the background (a flaky connection) is waited for, not reported as done.
 */
export async function settled(entry: SavingEntry, timeoutMs = 20_000): Promise<void> {
  await entry.flush();
  await new Promise<void>((resolve, reject) => {
    const handles: { stop: () => void; timer?: ReturnType<typeof setTimeout> } = { stop: () => {} };
    const finish = () => { handles.stop(); if (handles.timer) clearTimeout(handles.timer); };
    const check = () => {
      const view = entry.getSnapshot();
      if (view.save === "error" || (view.error && view.save !== "saving")) { finish(); reject(new Error(view.error?.message ?? "Saving failed.")); return true; }
      if (view.save === "idle") { finish(); resolve(); return true; }
      return false;
    };
    if (check()) return;
    handles.stop = entry.subscribe(() => { check(); });
    handles.timer = setTimeout(() => { finish(); reject(new Error("Saving is taking longer than expected. Your change is kept and will be retried.")); }, timeoutMs);
  });
}
