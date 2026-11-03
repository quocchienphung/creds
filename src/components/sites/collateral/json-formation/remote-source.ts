import type { JsonNodeInfo, JsonSource, SearchResult } from "../../json-viewer/json-model";

/** What the page can ask of the worker that holds the reporting document (see `json-doc.ts`). */
export interface DocCalls {
  root(): Promise<{ epoch: number; info: JsonNodeInfo | null } | null>;
  children(keys: string[], from: number, to: number): Promise<{ epoch: number; items: JsonNodeInfo[] } | null>;
  search(query: string, max: number): Promise<{ epoch: number; result: SearchResult } | null>;
  text(keys: string[]): Promise<{ epoch: number; text: string | null } | null>;
}

/**
 * The viewer's source for a document that lives in the worker. Pages of children are fetched on demand and kept; `children` answers null until the
 * page is here, and `subscribe` tells the viewer to ask again. A source belongs to one build of the document: a new plan makes a new source.
 */
export function remoteSource(calls: DocCalls, rootName: string): JsonSource & { dispose(): void } {
  const nodes = new Map<string, (JsonNodeInfo | undefined)[]>();
  const keysOf = new Map<string, string[]>([[rootName, []]]);
  const pending = new Set<string>();
  const listeners = new Set<() => void>();
  let root: JsonNodeInfo | null = null, alive = true, version = 0;
  // Pages that arrive in the same frame make one change, so a screen full of branches is drawn once, not once per page.
  let scheduled = false;
  const notify = () => {
    if (!alive || scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; if (!alive) return; version++; listeners.forEach(listener => listener()); });
  };
  void calls.root().then(answer => { if (!alive) return; root = answer?.info ?? null; notify(); });

  const store = (path: string, from: number, items: JsonNodeInfo[]) => {
    const list = nodes.get(path) ?? [];
    items.forEach((item, i) => { list[from + i] = item; keysOf.set(item.path, [...(keysOf.get(path) ?? []), item.key]); });
    nodes.set(path, list);
  };
  return {
    rootName,
    root: () => root,
    children(path, from, to) {
      if (to <= from) return [];
      const list = nodes.get(path);
      for (let i = from; i < to; i++) if (!list?.[i]) return null;
      return (list as JsonNodeInfo[]).slice(from, to);
    },
    loaded(path) { const list = nodes.get(path); let n = 0; while (list?.[n]) n++; return n; },
    request(path, from, to) {
      const list = nodes.get(path);
      let first = from;
      while (first < to && list?.[first]) first++;
      if (first >= to) return;
      const key = `${path}\u0001${first}\u0001${to}`, keys = keysOf.get(path);
      if (pending.has(key) || !keys) return;
      pending.add(key);
      void calls.children(keys, first, to).then(answer => { pending.delete(key); if (!alive || !answer) return; store(path, first, answer.items); notify(); });
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    version: () => version,
    async search(query, max) {
      const answer = await calls.search(query, max);
      const result = answer?.result ?? { hits: [], capped: false };
      // The way to every hit tells where each branch on the way sits, so its children can be asked for.
      for (const hit of result.hits) { let parent = rootName; for (const step of hit.trail) { if (!keysOf.has(step.path)) keysOf.set(step.path, [...(keysOf.get(parent) ?? []), step.key]); parent = step.path; } }
      return result;
    },
    async copyText(path, kind) {
      if (kind === "path") return path;
      const answer = await calls.text(keysOf.get(path) ?? []);
      if (!answer || answer.text === null) throw new Error("too large to copy");
      return answer.text;
    },
    dispose() { alive = false; listeners.clear(); },
  };
}
