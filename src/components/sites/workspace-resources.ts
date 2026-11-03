import { defineResource as define } from "@/lib/workspace-backend";
import type { ResourceDefinition } from "@/lib/workspace-backend";
import { logioContent, profileContent } from "./affectui-crm/workspace-brand";
import type { WorkspacePreferences, WorkspaceProfile } from "./affectui-crm/WorkspaceEditors";
import type { SettingsValues } from "./settings-command/settings-model";
import { parseSecurityPreview } from "./security-settings/security-model";
import type { SecurityPreviewState } from "./security-settings/security-model";

/**
 * Every piece of workspace data that outlives a page load, in one place. Each entry is a seam to the backend:
 * the screens never touch storage, they read and write these resources (see docs/backend-api.md for the routes
 * and JSON shapes, and which screen owns which resource).
 *
 * - account: belongs to the signed-in person; workspace: to one workspace.
 * - device: stays in this browser even when a backend is configured (which workspace is open here).
 * - collection: records with string ids; saves also carry a create/update/delete diff.
 */
/** Previously saved demo workspace names are updated as they are loaded or edited. */
const defineResource = <T,>(definition: ResourceDefinition<T>) => define<T>({ ...definition, normalize: value => logioContent(value) });
const isArray = <T>(raw: unknown) => (Array.isArray(raw) ? raw as T : undefined);
const isObject = <T>(raw: unknown) => (raw && typeof raw === "object" && !Array.isArray(raw) ? raw as T : undefined);
const isString = (raw: unknown) => (typeof raw === "string" ? raw : undefined);
const isNumber = (raw: unknown) => (typeof raw === "number" && Number.isFinite(raw) ? raw : undefined);
const isStringList = (raw: unknown) => (Array.isArray(raw) && raw.every(item => typeof item === "string") ? raw as string[] : undefined);

export interface WorkspaceListItem { id: string; name: string; logo?: string }

export const resources = {
  // Shell
  workspaces: defineResource<WorkspaceListItem[]>({ name: "workspaces", scope: "account", storage: "backend", collection: true, empty: [], parse: isArray }),
  activeWorkspace: defineResource<string>({ name: "active-workspace", scope: "account", storage: "device", parse: isString }),
  profile: define<WorkspaceProfile>({ name: "profile", scope: "account", storage: "backend", parse: isObject, normalize: profileContent }),
  preferences: defineResource<WorkspacePreferences>({ name: "preferences", scope: "account", storage: "backend", parse: isObject }),
  securityPreview: defineResource<SecurityPreviewState>({ name: "security-preview", scope: "account", storage: "device", parse: parseSecurityPreview }),
  news: defineResource<number>({ name: "news", scope: "workspace", storage: "device", parse: isNumber }),
  checklist: defineResource<string[]>({ name: "checklist", scope: "workspace", storage: "backend", empty: [], parse: isStringList }),
  // Settings page (settings-command): the saved copy of the page's values; theme and the workspace name live in `preferences` and `workspaces`.
  commandSettings: defineResource<SettingsValues>({ name: "command-settings", scope: "workspace", storage: "backend", parse: isObject }),
} as const;
