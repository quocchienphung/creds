/**
 * The data model of the Settings page (the "settings command" layout): sections, rows, defaults, change tracking, validation and the
 * search over rows. Pure, so the page, the small account pop-up and the tests share one definition.
 * Row labels, hints and options were read from the rendered public preview of UIArc's Settings command block
 * (docs/research/uiarc-settings-command/); the default values are this workspace's own.
 */
export type SectionId = "general" | "appearance" | "notifications" | "security" | "where-you-log" | "members" | "billing";

export interface SettingsValues {
  workspaceName: string; workspaceUrl: string; language: string; timezone: string; weekStart: "mon" | "sun";
  theme: "light" | "dark" | "system"; density: "comfortable" | "compact"; textSize: "small" | "default" | "large"; sidebarCounts: boolean; motion: boolean;
  loadingEffect: "decode" | "dither" | "terminal" | "blueprint" | "off";
  mentions: boolean; assigned: boolean; deployFailures: boolean; weeklyDigest: boolean; emailCadence: string;
  twoStep: boolean; saml: boolean; sessionLength: string; ipAllowlist: boolean; auditRetention: string;
  defaultRole: string; invitePolicy: "admins" | "everyone"; guests: boolean; domains: string;
  billingEmail: string; currency: string; spendAlerts: boolean; taxId: string;
}
export type SettingKey = keyof SettingsValues;
export type SettingKind = "text" | "select" | "segmented" | "switch";
export interface Option { value: string; label: string }

export interface SettingRow {
  key: SettingKey; id: string; section: SectionId; kind: SettingKind; label: string; hint: string;
  options?: readonly Option[]; prefix?: string; placeholder?: string;
}
export interface SettingsSection { id: SectionId; label: string; description: (values: SettingsValues) => string }

const options = (...labels: string[]): Option[] => labels.map(label => ({ value: label.toLowerCase().replaceAll(" ", "-"), label }));

export const sections: readonly SettingsSection[] = [
  { id: "general", label: "General", description: values => `Name, address, and regional defaults for ${values.workspaceName.trim() || "this workspace"}.` },
  { id: "appearance", label: "Appearance", description: () => "How the app looks for you on this device." },
  { id: "notifications", label: "Notifications", description: () => "Choose what reaches you and how often." },
  { id: "security", label: "Security", description: () => "Sign in rules and session policy for everyone." },
  { id: "where-you-log", label: "Where you log", description: () => "Account sign-in, two-factor setup, password and sessions." },
  { id: "members", label: "Members", description: () => "Who can join and what new people can do." },
  { id: "billing", label: "Billing", description: () => "Where invoices go and how they are issued." },
];

export const rows: readonly SettingRow[] = [
  { key: "workspaceName", id: "workspace-name", section: "general", kind: "text", label: "Workspace name", hint: "Shown in the sidebar, invites, and emails." },
  { key: "workspaceUrl", id: "workspace-url", section: "general", kind: "text", label: "Workspace URL", hint: "Changing it breaks old links for 30 days.", prefix: "logio.app/" },
  { key: "language", id: "language", section: "general", kind: "segmented", label: "Language", hint: "Choose the language used throughout your workspace.", options: [{ value: "en", label: "English" }, { value: "vi", label: "Tiếng Việt" }] },
  { key: "timezone", id: "timezone", section: "general", kind: "select", label: "Time zone", hint: "Due dates and digests follow this zone.", options: [{ value: "lisbon", label: "Lisbon (GMT+1)" }, { value: "london", label: "London (GMT+1)" }, { value: "berlin", label: "Berlin (GMT+2)" }, { value: "new-york", label: "New York (GMT-4)" }, { value: "san-francisco", label: "San Francisco (GMT-7)" }, { value: "tokyo", label: "Tokyo (GMT+9)" }] },
  { key: "weekStart", id: "week-start", section: "general", kind: "segmented", label: "Week starts on", hint: "Affects calendars and weekly reports.", options: [{ value: "mon", label: "Monday" }, { value: "sun", label: "Sunday" }] },

  { key: "theme", id: "theme", section: "appearance", kind: "segmented", label: "Theme", hint: "Match the system or pick one.", options: options("Light", "Dark", "System") },
  { key: "density", id: "density", section: "appearance", kind: "segmented", label: "Density", hint: "Compact fits more rows in lists and tables.", options: options("Comfortable", "Compact") },
  { key: "textSize", id: "font-size", section: "appearance", kind: "select", label: "Text size", hint: "Scales text across the app.", options: [{ value: "small", label: "Small" }, { value: "default", label: "Default" }, { value: "large", label: "Large" }] },
  { key: "sidebarCounts", id: "sidebar-counts", section: "appearance", kind: "switch", label: "Sidebar counts", hint: "Show unread counts beside each view." },
  { key: "motion", id: "smooth-motion", section: "appearance", kind: "switch", label: "Interface motion", hint: "Turn off to swap movement for fades." },

  { key: "loadingEffect", id: "loading-effect", section: "appearance", kind: "select", label: "Loading effect", hint: "How a page appears after a wait.", options: [{ value: "decode", label: "Decode" }, { value: "dither", label: "Dither" }, { value: "terminal", label: "Terminal" }, { value: "blueprint", label: "Blueprint" }, { value: "off", label: "Off" }] },

  { key: "mentions", id: "mentions", section: "notifications", kind: "switch", label: "Mentions", hint: "When someone @mentions you or your team." },
  { key: "assigned", id: "assigned", section: "notifications", kind: "switch", label: "Assigned to me", hint: "New issues and reviews that land on you." },
  { key: "deployFailures", id: "deploy-failures", section: "notifications", kind: "switch", label: "Failed deploys", hint: "Builds that fail on a branch you own." },
  { key: "weeklyDigest", id: "weekly-digest", section: "notifications", kind: "switch", label: "Weekly digest", hint: "A Monday summary of what shipped." },
  { key: "emailCadence", id: "email-cadence", section: "notifications", kind: "select", label: "Email delivery", hint: "Batch emails to cut down on noise.", options: [{ value: "right-away", label: "Right away" }, { value: "hourly", label: "Hourly digest" }, { value: "daily", label: "Daily digest" }, { value: "never", label: "Never" }] },

  { key: "twoStep", id: "two-step", section: "security", kind: "switch", label: "Require two-step sign in", hint: "Everyone adds an authenticator app or key." },
  { key: "saml", id: "saml", section: "security", kind: "switch", label: "Enforce SAML single sign-on", hint: "Members sign in through Okta only." },
  { key: "sessionLength", id: "session-length", section: "security", kind: "select", label: "Session length", hint: "Idle people are signed out after this.", options: [{ value: "1h", label: "1 hour" }, { value: "8h", label: "8 hours" }, { value: "24h", label: "24 hours" }, { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }] },
  { key: "ipAllowlist", id: "ip-allowlist", section: "security", kind: "switch", label: "IP allowlist", hint: "Only office and VPN addresses can sign in." },
  { key: "auditRetention", id: "audit-retention", section: "security", kind: "select", label: "Audit log retention", hint: "How long sign ins and changes are kept.", options: [{ value: "90d", label: "90 days" }, { value: "1y", label: "1 year" }, { value: "2y", label: "2 years" }] },

  { key: "defaultRole", id: "default-role", section: "members", kind: "select", label: "Default role", hint: "Given to everyone who joins by invite link.", options: options("Viewer", "Member", "Admin") },
  { key: "invitePolicy", id: "invite-policy", section: "members", kind: "segmented", label: "Who can invite", hint: "Admins approve requests from everyone else.", options: [{ value: "admins", label: "Admins" }, { value: "everyone", label: "Everyone" }] },
  { key: "guests", id: "guests", section: "members", kind: "switch", label: "Guest access", hint: "Guests see only projects shared with them." },
  { key: "domains", id: "domains", section: "members", kind: "text", label: "Allowed email domains", hint: "People with these addresses join without an invite.", placeholder: "example.com" },

  { key: "billingEmail", id: "billing-email", section: "billing", kind: "text", label: "Billing email", hint: "Receipts and payment alerts go here." },
  { key: "currency", id: "currency", section: "billing", kind: "select", label: "Invoice currency", hint: "Applies from the next billing period.", options: [{ value: "eur", label: "Euro (EUR)" }, { value: "usd", label: "US dollar (USD)" }, { value: "gbp", label: "Pound sterling (GBP)" }, { value: "chf", label: "Swiss franc (CHF)" }] },
  { key: "spendAlerts", id: "spend-alerts", section: "billing", kind: "switch", label: "Spend alerts", hint: "Email admins at 80% of the monthly budget." },
  { key: "taxId", id: "tax-id", section: "billing", kind: "text", label: "VAT number", hint: "Printed on every invoice.", placeholder: "VN 0000 000 000" },
];

/** The settings a person sees first in the search before typing, in the order shown. */
export const suggestedIds = ["two-step", "theme", "billing-email", "session-length", "email-cadence"] as const;

export function slugify(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export function defaultSettings(workspaceName: string): SettingsValues {
  return {
    workspaceName, workspaceUrl: slugify(workspaceName) || "workspace", language: "en", timezone: "lisbon", weekStart: "mon",
    theme: "system", density: "comfortable", textSize: "default", sidebarCounts: true, motion: true, loadingEffect: "decode",
    mentions: true, assigned: true, deployFailures: true, weeklyDigest: false, emailCadence: "hourly",
    twoStep: true, saml: false, sessionLength: "24h", ipAllowlist: false, auditRetention: "1y",
    defaultRole: "member", invitePolicy: "admins", guests: true, domains: `${slugify(workspaceName) || "workspace"}.com`,
    billingEmail: "billing@logio.com", currency: "usd", spendAlerts: true, taxId: "",
  };
}

/** Saved values from older versions or a backend may miss keys or hold the wrong type: keep what fits, fill the rest. */
export function mergeSettings(raw: unknown, base: SettingsValues): SettingsValues {
  if (!raw || typeof raw !== "object") return base;
  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) if (key in base && typeof value === typeof (base as unknown as Record<string, unknown>)[key]) next[key] = value;
  return next as unknown as SettingsValues;
}

export const rowOf = (key: SettingKey) => rows.find(row => row.key === key)!;

export function changedKeys(draft: SettingsValues, saved: SettingsValues): SettingKey[] {
  return rows.map(row => row.key).filter(key => draft[key] !== saved[key]);
}
export function dirtySections(draft: SettingsValues, saved: SettingsValues): Set<SectionId> {
  return new Set(changedKeys(draft, saved).map(key => rowOf(key).section));
}

/** The message a row shows when its value cannot be saved; undefined when it can. */
export function validate(key: SettingKey, values: SettingsValues): string | undefined {
  const text = String(values[key] ?? "").trim();
  switch (key) {
    case "workspaceName": return text ? (text.length > 40 ? "Use 40 characters or fewer." : undefined) : "Enter a workspace name.";
    case "workspaceUrl": return !text ? "Enter a URL." : /^[a-z0-9]+(-[a-z0-9]+)*$/.test(text) ? undefined : "Use lowercase letters, numbers and dashes.";
    case "billingEmail": return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? undefined : "Enter a valid email address.";
    case "domains": return !text || text.split(/[\s,]+/).filter(Boolean).every(domain => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain)) ? undefined : "Use domains such as example.com, separated by commas.";
    default: return undefined;
  }
}
export function errorsOf(values: SettingsValues): Partial<Record<SettingKey, string>> {
  const errors: Partial<Record<SettingKey, string>> = {};
  for (const row of rows) { const message = validate(row.key, values); if (message) errors[row.key] = message; }
  return errors;
}

export interface SettingsSectionLink { id: string; section: SectionId; kind: "section"; label: string; hint: string }
export type SettingsSearchRow = SettingRow | SettingsSectionLink;
export interface SearchHit { row: SettingsSearchRow; labelRange?: [number, number] }
/**
 * Settings that match a query: every word must appear in the label, hint or section name. The first match inside the label is
 * reported so the result can mark it. An empty query gives the suggested settings.
 */
export function searchSettings(query: string, localize: (text: string) => string = text => text): SearchHit[] {
  const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
  const words = fold(query).split(/\s+/).filter(Boolean);
  const localizedRows = rows.map(row => ({ ...row, label: localize(row.label), hint: localize(row.hint) }));
  if (!words.length) return suggestedIds.map(id => ({ row: localizedRows.find(row => row.id === id)! }));
  const hits: SearchHit[] = [];
  for (const row of localizedRows) {
    const original = rows.find(item => item.id === row.id)!;
    const label = fold(row.label);
    const sectionLabel = sections.find(section => section.id === row.section)!.label;
    const haystack = fold(`${row.label} ${row.hint} ${localize(sectionLabel)} ${original.label} ${original.hint} ${sectionLabel}`);
    if (!words.every(word => haystack.includes(word))) continue;
    const at = label.indexOf(words[0]);
    hits.push({ row, labelRange: at >= 0 ? [at, at + words[0].length] : undefined });
  }
  const accountText = fold(`where you log login sign in devices sessions authenticator two-factor password backup codes ${localize('Where you log')} ${localize('Two-factor authentication, password and active sessions.')}`);
  if (words.every(word => accountText.includes(word))) {
    const label = localize('Where you log'), at = fold(label).indexOf(words[0]);
    hits.push({ row: { id: 'where-you-log', section: 'where-you-log', kind: 'section', label, hint: localize('Two-factor authentication, password and active sessions.') }, labelRange: at >= 0 ? [at, at + words[0].length] : undefined });
  }
  return hits.sort((a, b) => Number(!!b.labelRange) - Number(!!a.labelRange));
}

/** The label of the option a value selects. */
export function optionLabel(row: SettingRow, value: unknown) {
  return row.options?.find(option => option.value === value)?.label ?? String(value);
}
