/** Public preview sample values, never authentication credentials. No password or secret is persisted. */
export interface SecurityPreviewState { twoFactor: boolean; twoFactorEnabledAt?: string; passwordChangedAt?: string; revoked: string[] }
export const initialSecurityPreview: SecurityPreviewState = { twoFactor: false, revoked: [] };
export const demoSetupKey = "N4XG K3LQ 7RPM 2VWD Y6HT A5CJ";
export const demoOtp = "246810";
export const demoBackupCodes = ["7kq2-m9xp", "c4tn-8wzr", "p3hd-6yvb", "x9fm-2rkt", "b5wl-4qne", "r8jc-7tgs", "m2vx-9dph", "t6nz-3kwf", "h4gy-5bmq", "w7rs-8cjd"];
export const previewSessions = [
  { id: "mac", device: "MacBook Pro", kind: "laptop", current: true, detail: "Chrome 129 · San Francisco, US · Active now" },
  { id: "iphone", device: "iPhone 15 Pro", kind: "phone", detail: "Fieldnote for iOS · San Francisco, US · 2 hours ago" },
  { id: "windows", device: "Windows desktop", kind: "desktop", detail: "Edge 128 · Austin, US · Yesterday at 4:12 PM" },
  { id: "ipad", device: "iPad Air", kind: "tablet", detail: "Safari 18 · Lisbon, PT · Sep 14" },
  { id: "thinkpad", device: "ThinkPad X1", kind: "laptop", newLocation: true, detail: "Firefox 130 · Berlin, DE · Sep 9" },
] as const;

export function parseSecurityPreview(raw: unknown): SecurityPreviewState | undefined {
  if (!raw || typeof raw !== 'object') return;
  const value = raw as Partial<SecurityPreviewState>;
  if (typeof value.twoFactor !== 'boolean' || !Array.isArray(value.revoked)) return;
  const allowed = new Set<string>(previewSessions.filter(session => !('current' in session)).map(session => session.id));
  return { twoFactor: value.twoFactor, revoked: [...new Set(value.revoked.filter((id): id is string => typeof id === 'string' && allowed.has(id)))], ...(typeof value.twoFactorEnabledAt === 'string' && Number.isFinite(Date.parse(value.twoFactorEnabledAt)) ? { twoFactorEnabledAt: value.twoFactorEnabledAt } : {}), ...(typeof value.passwordChangedAt === 'string' && Number.isFinite(Date.parse(value.passwordChangedAt)) ? { passwordChangedAt: value.passwordChangedAt } : {}) };
}

export function passwordIssue(current: string, password: string): string | undefined {
  if (!current) return 'Enter your current demo password.';
  if (password.length < 12) return 'Use at least 12 characters.';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) return 'Use upper and lowercase letters.';
  if (!/\d/.test(password)) return 'Include at least one number.';
  if (!/[^a-z\d]/i.test(password)) return 'Include at least one symbol.';
  if (password === current) return 'Choose a different password.';
}

export function passwordStrength(password: string): number {
  if (!password) return 0;
  return Number(password.length >= 12) + Number(/[a-z]/.test(password) && /[A-Z]/.test(password)) + Number(/\d/.test(password)) + Number(/[^a-z\d]/i.test(password));
}
