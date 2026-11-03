import type { ResourceName, ResourceRef } from "./types.ts";

/** Describes one persisted resource: where it lives, how it is validated and how it is saved. */
export interface ResourceDefinition<T> {
  name: ResourceName;
  /** "account" resources belong to the signed-in person; "workspace" resources to one workspace. */
  scope: "account" | "workspace";
  /** "device" resources (which workspace is open here, the last tab) stay in this browser even with a remote backend. */
  storage: "backend" | "device";
  /** An array of records with string ids: saves also carry a create/update/delete diff. */
  collection?: boolean;
  /** Shown while a remote load is in flight, instead of the demo defaults. */
  empty?: T;
  /** Rewrites legacy values after they are loaded or edited (for example rebranding demo copy). Must return the same reference when nothing changes. */
  normalize?: (value: T) => T;
  /** Validate untrusted data (storage, a backend response). Return undefined to reject it and fall back to the defaults. */
  parse?: (raw: unknown) => T | undefined;
  /** Fields that must never be sent to, or read back from, a remote backend. Applied to each record of a collection. */
  secret?: readonly string[];
  /** Overrides how long the store waits after an edit before saving. */
  debounceMs?: number;
  /** Saves only happen when this signature changes, so high-frequency state (a run's clock) is not saved on every tick. */
  signature?: (value: T) => string;
  /** Ask the backend for live updates (polling or push) while a screen is showing this resource. */
  live?: boolean;
}

export function defineResource<T>(definition: ResourceDefinition<T>): ResourceDefinition<T> { return definition; }

/** The key the local backend has always used, so data saved by earlier versions keeps working. */
const legacyName: Partial<Record<ResourceName, string>> = { mapping: "mapping-data" };
export function localKey(ref: ResourceRef) {
  const name = legacyName[ref.name] ?? ref.name;
  return ref.workspaceId ? `affectui:${ref.workspaceId}:${name}` : `affectui:${name}`;
}
export const refKey = (ref: ResourceRef) => `${ref.workspaceId ?? "-"}/${ref.name}`;

/** Removes secret fields before data leaves the browser. Returns the same value when there is nothing to remove. */
export function stripSecrets<T>(definition: Pick<ResourceDefinition<T>, "secret" | "collection">, value: T): T {
  const secret = definition.secret;
  if (!secret?.length) return value;
  const clean = (item: unknown) => { if (!item || typeof item !== "object") return item; const copy = { ...(item as Record<string, unknown>) }; for (const key of secret) delete copy[key]; return copy; };
  return (Array.isArray(value) ? value.map(clean) : clean(value)) as T;
}
