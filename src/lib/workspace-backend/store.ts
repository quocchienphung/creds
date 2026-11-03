import { diffById, isRecordList } from "./diff.ts";
import { refKey, stripSecrets } from "./resource.ts";
import type { ResourceDefinition } from "./resource.ts";
import { BackendError } from "./types.ts";
import type { Loaded, QueryName, ResourceRef, WorkspaceBackend } from "./types.ts";

export type Phase = "loading" | "ready";
export type SaveState = "idle" | "saving" | "error";
export interface ResourceView<T> { value: T; phase: Phase; save: SaveState; error: BackendError | null; /** Where the failure happened, so "retry" does the right thing. */ failed: "load" | "save" | null }
export interface SyncSummary { loading: number; saving: number; errors: number; message: string | null }

const MAX_AUTO_RETRIES = 3;
function asBackendError(error: unknown): BackendError {
  if (error instanceof BackendError) return error;
  return new BackendError("network", error instanceof Error ? error.message : "Something went wrong while talking to the server.");
}
const same = (a: unknown, b: unknown) => Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);

/**
 * One resource, loaded once and shared by every screen that shows it. Edits are applied immediately, then
 * saved after a short pause: one save at a time, always the latest value, retried when the network fails.
 */
export class ResourceEntry<T> {
  private view: ResourceView<T>;
  private readonly serverView: ResourceView<T>;
  private listeners = new Set<() => void>();
  private baseline: T | undefined;
  private version: string | undefined;
  private dirty = false;
  private inflight = false;
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private started = false;
  /** The first value was read synchronously, so there is nothing to wait for. */
  private peeked = false;
  private lastSignature: string | undefined;
  private stopLive: (() => void) | undefined;
  private lastLoad = 0;
  private loadAbort: AbortController | undefined;
  persist = true;
  private readonly store: ResourceStore;
  readonly ref: ResourceRef;
  readonly definition: ResourceDefinition<T>;
  private readonly backend: WorkspaceBackend;
  private readonly seed: T;

  constructor(store: ResourceStore, ref: ResourceRef, definition: ResourceDefinition<T>, backend: WorkspaceBackend, seed: T) {
    this.store = store; this.ref = ref; this.definition = definition; this.backend = backend;
    this.seed = definition.normalize ? definition.normalize(seed) : seed;
    const first = backend.remote && definition.empty !== undefined ? definition.empty : this.seed;
    this.view = { value: first, phase: "loading", save: "idle", error: null, failed: null };
    // Browser storage can be read right now, so the first render already shows the stored data.
    const peeked = typeof window === "undefined" ? undefined : backend.peek?.<unknown>(ref);
    if (peeked !== undefined) {
      this.peeked = true;
      const value = peeked ? this.accept(peeked.value) : undefined;
      this.baseline = value; this.version = peeked?.version;
      this.lastSignature = value !== undefined && definition.signature ? definition.signature(value) : undefined;
      this.view = { value: value === undefined ? this.seed : value, phase: "ready", save: "idle", error: null, failed: null };
    }
    // Server rendering and hydration always start from the demo defaults, so markup never differs between them.
    // The server cannot read browser storage, so it is always still loading: hydration must say the same or the markup differs.
    this.serverView = { ...this.view, value: this.seed, phase: "loading", error: null, failed: null };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (!this.started) { this.started = true; if (this.peeked) { this.lastLoad = Date.now(); this.startLive(); } else void this.load(); }
    return () => { this.listeners.delete(listener); };
  };
  getSnapshot = () => this.view;
  getServerSnapshot = () => this.serverView;

  private setView(patch: Partial<ResourceView<T>>) {
    this.view = { ...this.view, ...patch };
    for (const listener of [...this.listeners]) listener();
    this.store.touch();
  }
  private accept(raw: unknown): T | undefined {
    const parsed = this.definition.parse ? this.definition.parse(raw) : raw as T;
    if (parsed === undefined) { if (typeof console !== "undefined") console.warn(`workspace-backend: ignored invalid data for "${this.ref.name}".`); return undefined; }
    return this.definition.normalize ? this.definition.normalize(parsed) : parsed;
  }

  /** First load, or "reload": throw away local edits and fetch again. */
  async load(quiet = false) {
    this.loadAbort?.abort();
    const controller = this.loadAbort = new AbortController();
    if (!quiet) this.setView({ phase: "loading", error: null, failed: null, save: this.dirty || this.inflight ? this.view.save : "idle" });
    try {
      const loaded = await this.backend.load<unknown>(this.ref, controller.signal);
      if (controller.signal.aborted) return;
      this.lastLoad = Date.now();
      this.adopt(loaded, quiet);
      this.startLive();
    } catch (error) {
      if (controller.signal.aborted) return;
      const failure = asBackendError(error);
      if (quiet) return;
      this.setView({ phase: "ready", error: failure, failed: "load" });
    }
  }
  private adopt(loaded: Loaded<unknown> | null, quiet: boolean) {
    const value = loaded ? this.accept(loaded.value) : undefined;
    this.baseline = value;
    this.version = loaded?.version;
    this.lastSignature = value !== undefined && this.definition.signature ? this.definition.signature(value) : undefined;
    // Edits made while the first load was in flight win; they will be saved against this revision.
    if (this.dirty) { this.setView({ phase: "ready", error: null, failed: null }); this.schedule(); return; }
    const next = value === undefined ? this.seed : value;
    if (quiet && value !== undefined && same(this.view.value, next)) return;
    this.setView({ value: next, phase: "ready", error: null, failed: null });
  }
  private startLive() {
    if (this.stopLive || !this.backend.subscribe) return;
    this.stopLive = this.backend.subscribe<unknown>(this.ref, loaded => this.applyRemote(loaded), { poll: !!this.definition.live });
  }
  /** A change made somewhere else. Local edits that are not saved yet take precedence. */
  private applyRemote(loaded: Loaded<unknown>) {
    if (this.dirty || this.inflight) return;
    const value = this.accept(loaded.value);
    if (value === undefined || same(value, this.view.value)) return;
    this.baseline = value; this.version = loaded.version;
    this.lastSignature = this.definition.signature?.(value);
    this.setView({ value });
  }
  /** Refresh in the background (for example when the tab regains focus). */
  revalidate(minAgeMs = 15_000) {
    if (!this.started || !this.backend.remote || this.dirty || this.inflight || Date.now() - this.lastLoad < minAgeMs) return;
    void this.load(true);
  }
  /** Replace the value with what the backend sent (used by a server-driven run). Does not save. */
  apply = (value: T) => { if (!same(value, this.view.value)) { this.baseline = value; this.dirty = false; this.setView({ value }); } }

  set = (action: T | ((current: T) => T)) => {
    const made = typeof action === "function" ? (action as (current: T) => T)(this.view.value) : action;
    const next = this.definition.normalize ? this.definition.normalize(made) : made;
    if (Object.is(next, this.view.value)) return;
    this.setView({ value: next });
    if (!this.persist) return;
    // Browser storage is cheap, so only remote backends skip saves that change nothing durable.
    if (this.backend.remote && this.definition.signature && this.lastSignature === this.definition.signature(next)) return;
    this.dirty = true;
    this.schedule();
  };

  private schedule() {
    clearTimeout(this.timer);
    const wait = this.definition.debounceMs ?? this.backend.debounceMs;
    if (wait <= 0) { this.timer = undefined; queueMicrotask(() => void this.flush()); return; }
    this.timer = setTimeout(() => void this.flush(), wait);
  }

  /** Save now. `unloading` marks a save made as the page closes. */
  async flush(unloading = false) {
    clearTimeout(this.timer); this.timer = undefined;
    // Nothing is saved before the first load finishes, so edits never overwrite what is stored.
    if (!this.dirty || this.inflight || this.view.phase === "loading") return;
    const value = this.view.value;
    const send = this.backend.remote ? stripSecrets(this.definition, value) : value;
    const baseline = this.baseline;
    const changes = this.definition.collection && isRecordList(value) && (baseline === undefined || isRecordList(baseline)) ? diffById((baseline ?? []) as { id: string }[], value) : undefined;
    this.dirty = false; this.inflight = true;
    this.setView({ save: "saving", error: null, failed: null });
    try {
      const result = await this.backend.save(this.ref, send, { previous: baseline === undefined ? undefined : stripSecrets(this.definition, baseline), changes, baseVersion: this.version, unloading });
      this.baseline = value;
      if (result && result.version) this.version = result.version;
      this.lastSignature = this.definition.signature?.(value);
      this.attempts = 0; this.inflight = false;
      if (this.dirty) { this.schedule(); this.setView({ save: "saving" }); } else this.setView({ save: "idle" });
    } catch (error) {
      this.inflight = false; this.dirty = true;
      const failure = asBackendError(error);
      if (failure.retryable && this.attempts < MAX_AUTO_RETRIES) {
        this.attempts += 1;
        this.setView({ save: "saving", error: null });
        this.timer = setTimeout(() => void this.flush(), 1000 * 2 ** (this.attempts - 1));
      } else this.setView({ save: "error", error: failure, failed: "save" });
    }
  }

  /** Try again after a failure. */
  retry = () => { this.attempts = 0; if (this.view.error?.code === "conflict") this.reload(); else if (this.view.failed === "load") void this.load(); else void this.flush(); };
  /** Drop unsaved edits and fetch the stored value again (after a conflict). */
  reload = () => { clearTimeout(this.timer); this.dirty = false; this.attempts = 0; void this.load(); };
  dispose() { clearTimeout(this.timer); this.loadAbort?.abort(); this.stopLive?.(); this.listeners.clear(); }
  get isDirty() { return this.dirty || this.inflight; }
  get isRemote() { return this.backend.remote; }
}

export interface QueryView<T> { data: T; phase: Phase; error: BackendError | null }
/** Computed, read-only data with a built-in sample to fall back on. */
export class QueryEntry<T> {
  private view: QueryView<T>;
  private listeners = new Set<() => void>();
  private started = false;
  private lastLoad = 0;
  private readonly backend: WorkspaceBackend;
  private readonly name: QueryName;
  private readonly workspaceId: string;
  private readonly params: Record<string, string | number>;
  private readonly fallback: T;
  private readonly parse: ((raw: unknown) => T | undefined) | undefined;
  constructor(backend: WorkspaceBackend, name: QueryName, workspaceId: string, params: Record<string, string | number>, fallback: T, parse?: (raw: unknown) => T | undefined) {
    this.backend = backend; this.name = name; this.workspaceId = workspaceId; this.params = params; this.fallback = fallback; this.parse = parse;
    this.view = { data: fallback, phase: backend.query ? "loading" : "ready", error: null };
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (!this.started) { this.started = true; void this.load(); }
    return () => { this.listeners.delete(listener); };
  };
  getSnapshot = () => this.view;
  private set(view: QueryView<T>) { this.view = view; for (const listener of [...this.listeners]) listener(); }
  /** `quiet` keeps showing the current data while the newest is fetched (coming back to the tab). */
  async load(quiet = false) {
    if (!this.backend.query) return;
    this.lastLoad = Date.now();
    try {
      const raw = await this.backend.query<unknown>(this.name, this.workspaceId, this.params);
      if (raw === undefined) { this.set({ data: this.fallback, phase: "ready", error: null }); return; }
      const data = this.parse ? this.parse(raw) : raw as T;
      if (data === undefined) this.set({ data: this.fallback, phase: "ready", error: new BackendError("invalid", `The server's "${this.name}" answer is not in the expected format.`) });
      else this.set({ data, phase: "ready", error: null });
    } catch (error) {
      // A failed refresh keeps what is on screen; a failed first load shows the built-in sample.
      this.set({ data: quiet && this.view.phase === "ready" ? this.view.data : this.fallback, phase: "ready", error: asBackendError(error) });
    }
  }
  /** Coming back to the page: fetch again if the answer is more than half a minute old. */
  revalidate() { if (this.started && this.listeners.size && Date.now() - this.lastLoad > 30_000) void this.load(true); }
  retry = () => { this.set({ ...this.view, phase: "loading", error: null }); void this.load(); };
}

export class ResourceStore {
  private entries = new Map<string, ResourceEntry<unknown>>();
  private queries = new Map<string, QueryEntry<unknown>>();
  private summaryListeners = new Set<() => void>();
  private summary: SyncSummary = { loading: 0, saving: 0, errors: 0, message: null };

  readonly backend: WorkspaceBackend;
  private readonly device: WorkspaceBackend;
  constructor(backend: WorkspaceBackend, device: WorkspaceBackend) { this.backend = backend; this.device = device; }

  /** The entry for a resource. The first caller's defaults are used when the backend has nothing stored. */
  entry<T>(definition: ResourceDefinition<T>, workspaceId: string | undefined, seed: T, options?: { persist?: boolean }): ResourceEntry<T> {
    const ref: ResourceRef = { name: definition.name, workspaceId: definition.scope === "workspace" ? workspaceId : undefined };
    const key = refKey(ref);
    let entry = this.entries.get(key) as ResourceEntry<T> | undefined;
    if (!entry) {
      entry = new ResourceEntry<T>(this, ref, definition, definition.storage === "device" ? this.device : this.backend, seed);
      this.entries.set(key, entry as ResourceEntry<unknown>);
    }
    if (options?.persist === false) entry.persist = false;
    return entry;
  }
  query<T>(name: QueryName, workspaceId: string, params: Record<string, string | number>, fallback: T, parse?: (raw: unknown) => T | undefined): QueryEntry<T> {
    const key = `${name}/${workspaceId}/${JSON.stringify(params)}`;
    let entry = this.queries.get(key) as QueryEntry<T> | undefined;
    if (!entry) { entry = new QueryEntry<T>(this.backend, name, workspaceId, params, fallback, parse); this.queries.set(key, entry as QueryEntry<unknown>); }
    return entry;
  }

  /** Called by entries whenever their state changes. */
  touch() {
    let loading = 0, saving = 0, errors = 0, message: string | null = null;
    for (const entry of this.entries.values()) {
      if (!entry.isRemote) continue;
      const view = entry.getSnapshot();
      if (view.phase === "loading") loading++;
      if (view.save === "saving") saving++;
      if (view.error) { errors++; message ??= view.error.message; }
    }
    const next = { loading, saving, errors, message };
    if (next.loading === this.summary.loading && next.saving === this.summary.saving && next.errors === this.summary.errors && next.message === this.summary.message) return;
    this.summary = next;
    for (const listener of [...this.summaryListeners]) listener();
  }
  subscribeSummary = (listener: () => void) => { this.summaryListeners.add(listener); return () => { this.summaryListeners.delete(listener); }; };
  getSummary = () => this.summary;
  retryAll() { for (const entry of this.entries.values()) if (entry.getSnapshot().error) entry.retry(); }
  flushAll(unloading = false) { for (const entry of this.entries.values()) void entry.flush(unloading); }
  revalidateAll() { for (const entry of this.entries.values()) entry.revalidate(); for (const entry of this.queries.values()) entry.revalidate(); }
  dispose() { for (const entry of this.entries.values()) entry.dispose(); this.entries.clear(); this.queries.clear(); }
}
