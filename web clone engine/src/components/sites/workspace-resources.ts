import { defineResource as define } from "@/lib/workspace-backend";
import type { ResourceDefinition } from "@/lib/workspace-backend";
import { logioContent } from "./affectui-crm/workspace-brand";
import type { SavedReport } from "./affectui-analytics/Analytics";
import type { Company } from "./affectui-crm/crm-engine";
import type { SalesDocument } from "./affectui-crm/WorkspaceDocuments";
import type { CustomView, WorkspacePreferences, WorkspaceProfile } from "./affectui-crm/WorkspaceEditors";
import type { Contact } from "./affectui-crm/WorkspacePages";
import type { DraftState } from "./affectui-run/RunDraft";
import { isRunSnapshot } from "./affectui-run/run-model";
import type { RunSnapshot } from "./affectui-run/run-types";
import type { BillingState } from "./affectui-settings/SettingsBilling";
import { parseFileLibrary } from "./affectui-files/files-model";
import type { FileLibrary } from "./affectui-files/files-model";
import type { DemoApiKey, GeneralValue, SettingsMember } from "./affectui-settings/SettingsTabs";
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
/** The workspace was renamed from Acme to Logio: previously saved demo copy is updated as it is loaded or edited. */
const defineResource = <T,>(definition: ResourceDefinition<T>) => define<T>({ ...definition, normalize: value => logioContent(value) });
const isArray = <T>(raw: unknown) => (Array.isArray(raw) ? raw as T : undefined);
const isObject = <T>(raw: unknown) => (raw && typeof raw === "object" && !Array.isArray(raw) ? raw as T : undefined);
const isString = (raw: unknown) => (typeof raw === "string" ? raw : undefined);
const isNumber = (raw: unknown) => (typeof raw === "number" && Number.isFinite(raw) ? raw : undefined);
const isBoolean = (raw: unknown) => (typeof raw === "boolean" ? raw : undefined);
const isStringList = (raw: unknown) => (Array.isArray(raw) && raw.every(item => typeof item === "string") ? raw as string[] : undefined);
/** Company rows: the shape the table needs, so a broken response cannot crash it. */
const isCompanies = (raw: unknown): Company[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  return raw.every(row => row && typeof row === "object" && typeof row.id === "string" && typeof row.value === "number" && ["company", "category", "domain", "owner", "stage", "lastContact"].every(key => typeof row[key] === "string")) ? raw as Company[] : undefined;
};

export interface WorkspaceListItem { id: string; name: string; logo?: string }

export const resources = {
  // Shell
  workspaces: defineResource<WorkspaceListItem[]>({ name: "workspaces", scope: "account", storage: "backend", collection: true, empty: [], parse: isArray }),
  activeWorkspace: defineResource<string>({ name: "active-workspace", scope: "account", storage: "device", parse: isString }),
  profile: defineResource<WorkspaceProfile>({ name: "profile", scope: "account", storage: "backend", parse: isObject }),
  preferences: defineResource<WorkspacePreferences>({ name: "preferences", scope: "account", storage: "backend", parse: isObject }),
  securityPreview: defineResource<SecurityPreviewState>({ name: "security-preview", scope: "account", storage: "device", parse: parseSecurityPreview }),
  feedback: defineResource<{ id: string; text: string }[]>({ name: "feedback", scope: "account", storage: "backend", collection: true, empty: [], parse: isArray }),
  news: defineResource<number>({ name: "news", scope: "workspace", storage: "device", parse: isNumber }),
  checklist: defineResource<string[]>({ name: "checklist", scope: "workspace", storage: "backend", empty: [], parse: isStringList }),
  // CRM: Home, Companies, Contacts, Deals and the pipelines
  companies: defineResource<Company[]>({ name: "companies", scope: "workspace", storage: "backend", collection: true, empty: [], parse: isCompanies }),
  contacts: defineResource<Contact[]>({ name: "contacts", scope: "workspace", storage: "backend", collection: true, empty: [], parse: isArray }),
  views: defineResource<CustomView[]>({ name: "views", scope: "workspace", storage: "backend", collection: true, empty: [], parse: isArray }),
  activeTab: defineResource<string>({ name: "active-tab", scope: "workspace", storage: "device", parse: isString }),
  favorites: defineResource<string[]>({ name: "favorites", scope: "workspace", storage: "backend", empty: [], parse: isStringList }),
  pixelConnected: defineResource<boolean>({ name: "pixel-connected", scope: "workspace", storage: "backend", parse: isBoolean }),
  documents: defineResource<SalesDocument[]>({ name: "documents", scope: "workspace", storage: "backend", collection: true, empty: [], parse: isArray }),
  folders: defineResource<string[]>({ name: "folders", scope: "workspace", storage: "backend", empty: [], parse: isStringList }),
  fileLibrary: defineResource<FileLibrary>({ name: "file-library", scope: "workspace", storage: "backend", empty: { folderAccess: {}, items: [] }, parse: parseFileLibrary }),
  // Reports
  reportPeriod: defineResource<number>({ name: "report-period", scope: "workspace", storage: "device", parse: isNumber }),
  reports: defineResource<SavedReport[]>({ name: "reports", scope: "workspace", storage: "backend", collection: true, empty: [], parse: isArray }),
  // Run. The clock advances many times a second, so only a change of phase, step status or approval is saved.
  runDraft: defineResource<DraftState>({ name: "run-draft", scope: "workspace", storage: "backend", debounceMs: 800, parse: isObject }),
  agentRun: defineResource<RunSnapshot>({
    name: "agent-run", scope: "workspace", storage: "backend", live: true, parse: raw => isRunSnapshot(raw) ? raw : undefined,
    signature: run => JSON.stringify([run.phase, run.activeId, run.steps.map(step => [step.id, step.title, run.states[step.id]?.status]), run.approvals]),
  }),
  // Settings page (settings-command): the saved copy of the page's values; theme and the workspace name live in `preferences` and `workspaces`.
  commandSettings: defineResource<SettingsValues>({ name: "command-settings", scope: "workspace", storage: "backend", parse: isObject }),
  // Usage (agent usage, plan and API keys). API key secrets are never sent to or read from a backend: it returns metadata, and the secret once, when a key is created.
  settingsGeneral: defineResource<GeneralValue>({ name: "settings-general", scope: "workspace", storage: "backend", parse: isObject }),
  settingsMembers: defineResource<SettingsMember[]>({ name: "settings-members", scope: "workspace", storage: "backend", collection: true, empty: [], parse: isArray }),
  settingsBilling: defineResource<BillingState>({ name: "settings-billing", scope: "workspace", storage: "backend", parse: isObject }),
  settingsApiKeys: defineResource<DemoApiKey[]>({ name: "settings-api-keys", scope: "workspace", storage: "backend", collection: true, secret: ["value"], empty: [], parse: isArray }),
  // Mapping and Invoice keep their own data models and normalizers; these names route them through the same backend.
  mapping: defineResource<unknown>({ name: "mapping", scope: "workspace", storage: "backend", debounceMs: 350 }),
  invoice: defineResource<unknown>({ name: "invoice", scope: "workspace", storage: "backend" }),
  // Process keeps its own data model and normalizer (process/process-model.ts); the simulated engine saves its runs next to it.
  process: defineResource<unknown>({ name: "process", scope: "workspace", storage: "backend", debounceMs: 500 }),
  processRun: defineResource<unknown>({ name: "process-run", scope: "workspace", storage: "backend", debounceMs: 300 }),
} as const;
