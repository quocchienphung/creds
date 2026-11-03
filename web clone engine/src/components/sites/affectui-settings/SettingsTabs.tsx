"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { MenuSurface } from "@/components/interaction/MenuSurface";
import { WorkspaceDialog } from "../affectui-crm/WorkspaceDialog";

import { Combobox } from "../affectui-combobox/Combobox";
import "./settings-tabs.css";
import { BackendError, conforms, storeFile } from "@/lib/workspace-backend";
import { useResource, useWorkspaceBackend } from "@/lib/workspace-backend/react";
import { resources } from "../workspace-resources";

type Notify = (text: string) => void;
type IconName = "down" | "globe" | "upload" | "invite" | "more" | "plus" | "key" | "copy" | "trash" | "check";

/** The same paths observed in the public Settings preview. */
function SettingsIcon({ name, size = 15 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "down" && <path d="M18 9.00005C18 9.00005 13.5811 15 12 15C10.4188 15 6 9 6 9" />}
    {name === "globe" && <><circle cx="12" cy="12" r="10" /><path d="M8 12C8 18 12 22 12 22C12 22 16 18 16 12C16 6 12 2 12 2C12 2 8 6 8 12ZM21 15H3M21 9H3" /></>}
    {name === "upload" && <><path d="M5 21C9.20998 16.2487 13.9412 9.9475 21 14.6734M17 4.50012C17.4915 3.99442 18.7998 2.00012 19.5 2.00012M22 4.50012C21.5085 3.99442 20.2002 2.00012 19.5 2.00012M19.5 2.00012V10.0001M20.9999 13C20.998 17.147 20.9472 19.2703 19.6088 20.6088C18.2175 22 15.9783 22 11.5 22C7.02166 22 4.78249 22 3.39124 20.6088C2 19.2175 2 16.9783 2 12.5C2 8.02166 2 5.78249 3.39124 4.39124C4.78249 3 7.02166 3 11.5 3C11.6699 3 14 3.00008 14 3.00008" /></>}
    {name === "invite" && <><path d="M3 20.5002C3.28417 16.8058 6.3 13.7193 10.0008 13.5379C10.3134 13.5226 10.6446 13.5097 11 13.5L11.995 13.5663C12.6939 13.6129 13.3665 13.7543 14 13.9777M18 15.5V21.5M21 18.5L15 18.5" /><circle cx="11" cy="6.5" r="4" /></>}
    {name === "more" && <><circle cx="6" cy="12.5" r="1" /><circle cx="12" cy="12.5" r="1" /><circle cx="18" cy="12.5" r="1" /></>}
    {name === "plus" && <path d="M12 4V20M20 12H4" />}
    {name === "key" && <><path d="M15.5 14.5C18.8137 14.5 21.5 11.8137 21.5 8.5C21.5 5.18629 18.8137 2.5 15.5 2.5C12.1863 2.5 9.5 5.18629 9.5 8.5C9.5 9.38041 9.68962 10.2165 10.0303 10.9697L2.5 18.5V21.5H5.5V19.5H7.5V17.5H9.5L13.0303 13.9697C13.7835 14.3104 14.6196 14.5 15.5 14.5ZM17.5 6.5L16.5 7.5" /></>}
    {name === "copy" && <><path d="M7.5 14.5C7.5 11.2002 7.5 9.55025 8.52513 8.52513C9.55025 7.5 11.2002 7.5 14.5 7.5C17.7998 7.5 19.4497 7.5 20.4749 8.52513C21.5 9.55025 21.5 11.2002 21.5 14.5C21.5 17.7998 21.5 19.4497 20.4749 20.4749C19.4497 21.5 17.7998 21.5 14.5 21.5C11.2002 21.5 9.55025 21.5 8.52513 20.4749C7.5 19.4497 7.5 17.7998 7.5 14.5Z" /><path d="M7.5 16.5C6.10355 16.5 5.40533 16.5 4.84402 16.3036C3.83866 15.9518 3.0482 15.1613 2.69641 14.156C2.5 13.5947 2.5 12.8964 2.5 11.5V9.5C2.5 6.20017 2.5 4.55025 3.52513 3.52513C4.55025 2.5 6.20017 2.5 9.5 2.5H11.5C12.8964 2.5 13.5947 2.5 14.156 2.69641C15.1613 3.0482 15.9518 3.83866 16.3036 4.84402C16.5 5.40533 16.5 6.10355 16.5 7.5" /></>}
    {name === "trash" && <><path d="M19.5 5.5L18.8803 15.5251C18.7219 18.0864 18.6428 19.3671 18.0008 20.2879C17.6833 20.7431 17.2747 21.1273 16.8007 21.416C15.8421 22 14.559 22 11.9927 22C9.42312 22 8.1383 22 7.17905 21.4149C6.7048 21.1257 6.296 20.7408 5.97868 20.2848C5.33688 19.3626 5.25945 18.0801 5.10461 15.5152L4.5 5.5M3 5.5H21M16.0557 5.5L15.3731 4.09173C14.9196 3.15626 14.6928 2.68852 14.3017 2.39681C14.215 2.3321 14.1231 2.27454 14.027 2.2247C13.5939 2 13.0741 2 12.0345 2C10.9688 2 10.436 2 9.99568 2.23412C9.8981 2.28601 9.80498 2.3459 9.71729 2.41317C9.32164 2.7167 9.10063 3.20155 8.65861 4.17126L8.05292 5.5M9.5 16.5V10.5M14.5 16.5V10.5" /></>}
    {name === "check" && <path d="m5 12 4 4L19 6" />}
  </svg>;
}

function SettingsButton({ children, icon, variant = "primary", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: IconName; variant?: string }) {
  return <button type="button" className="ui-button" data-variant={variant} data-size="sm" data-ready="true" {...props}>{icon && <span className="ui-button__icon"><SettingsIcon name={icon} size={14} /></span>}<span className="ui-button__label" data-text={typeof children === "string" ? children : undefined}>{children}</span></button>;
}

function SettingsMenu({ label, ariaLabel, icon, end = false, children }: { label?: string; ariaLabel?: string; icon?: IconName; end?: boolean; children: (close: () => void) => ReactNode }) {
  const { t: uiText } = useWorkspaceI18n();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() { setOpen(false); }
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled):not([aria-disabled="true"])')?.focus();
    function outside(event: PointerEvent) { if (!anchor.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <span ref={anchor} className="ui-as-anchor" onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); trigger.current?.focus(); }
    if (!open && event.key === "ArrowDown") { event.preventDefault(); setOpen(true); return; }
    if (!open || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled):not([aria-disabled="true"])') || []);
    const current = items.findIndex(item => item === document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    event.preventDefault(); items[next]?.focus();
  }}>
    <button ref={trigger} type="button" className={`ui-as-tool${label ? " ui-as-tool--label" : ""}`} aria-label={uiText(ariaLabel)} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>{icon && <SettingsIcon name={icon} />}{uiText(label)}{label && <SettingsIcon name="down" size={13} />}</button>
    <AnimatePresence>{open && <MenuSurface ref={menu} className="ui-as-popover ui-as-menu" data-align={end ? "end" : undefined} role="menu" aria-label={uiText(ariaLabel || label)} onClick={() => trigger.current?.focus()}>{children(close)}</MenuSurface>}</AnimatePresence>
  </span>;
}

const regions = ["Europe (Frankfurt)", "United States (Virginia)", "Asia Pacific (Singapore)"];
export type GeneralValue = { region: string; logo: string };

export function GeneralSettings({ workspaceId, workspaceName, onRename, onLogoChange, notify }: { workspaceId: string; workspaceName: string; onRename: (name: string) => void; onLogoChange?: (logo: string) => void; notify: Notify }) {
  const { t: uiText } = useWorkspaceI18n();
  const [saved, setSaved] = useResource(resources.settingsGeneral, workspaceId,  { region: regions[0], logo: "" });
  const [draft, setDraft] = useState<(GeneralValue & { name: string }) | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const backend = useWorkspaceBackend();
  const [uploading, setUploading] = useState(false);
  const current = draft || { ...saved, name: workspaceName };
  const dirty = current.name !== workspaceName || current.region !== saved.region || current.logo !== saved.logo;
  function edit(change: Partial<typeof current>) { setDraft(previous => ({ ...(previous || { ...saved, name: workspaceName }), ...change })); }
  return <form className="ui-sb-tray ui-sb-form ui-as-rise" onSubmit={event => {
    event.preventDefault(); const name = current.name.trim(); if (!name || !dirty) return;
    setSaved({ region: current.region, logo: current.logo }); onRename(name); onLogoChange?.(current.logo); setDraft(null); notify("Workspace settings saved");
  }}>
    <div className="ui-sb-card ui-sb-form__fields">
      <div className="ui-sb-field"><span className="ui-sb-field__label"><b>{uiText("Logo")}</b><span>{uiText("Shown in the sidebar and on invites. Square, at least 128 px.")}</span></span><div className="ui-sb-logo-row">
        <span className="ui-sb-logo">{current.logo ? <img src={current.logo} alt={`${current.name} workspace logo`} /> : current.name.charAt(0).toUpperCase()}</span>
        <SettingsButton variant="secondary" icon="upload" disabled={uploading} onClick={() => fileInput.current?.click()}>{uiText(uploading ? uiText("Uploading…") : uiText("Upload"))}</SettingsButton>
        <input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label={uiText("Upload workspace logo")} onChange={event => {
          const file = event.target.files?.[0]; event.currentTarget.value = ""; if (!file) return;
          if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 2 * 1024 * 1024) { notify("Choose a PNG, JPEG, WebP or GIF up to 2 MB"); return; }
          setUploading(true);
          storeFile(backend, workspaceId, "logo", file).then(url => edit({ logo: url })).catch(error => notify(error instanceof BackendError ? error.message : "This image could not be opened")).finally(() => setUploading(false));
        }} />
      </div></div>
      <label className="ui-sb-field"><span className="ui-sb-field__label"><b>{uiText("Workspace name")}</b><span>{uiText("Your team sees this name everywhere.")}</span></span><input className="ui-sb-input" value={current.name} maxLength={40} required onChange={event => edit({ name: event.target.value })} /></label>
      <div className="ui-sb-field"><span className="ui-sb-field__label"><b>{uiText("Data region")}</b><span>{uiText("Where chats, files and embeddings are stored.")}</span></span><div><SettingsMenu label={uiText(current.region)} icon="globe">{close => regions.map(region => <button key={region} type="button" className="ui-as-menu__item" role="menuitemradio" aria-checked={current.region === region} onClick={() => { edit({ region }); close(); }}>{uiText(region)}{current.region === region && <SettingsIcon name="check" size={14} />}</button>)}</SettingsMenu></div></div>
    </div>
    <div className="ui-sb-form__foot"><SettingsButton variant="ghost" disabled={!dirty} onClick={() => setDraft(null)}>{uiText("Discard")}</SettingsButton><SettingsButton type="submit" disabled={!dirty || !current.name.trim()}>{uiText("Save changes")}</SettingsButton></div>
  </form>;
}

export type SettingsMember = { id: string; name: string; email: string; role: "Owner" | "Admin" | "Member" | "Viewer"; pending?: boolean };
export const initialMembers: SettingsMember[] = [
  { id: "alex", name: "Alex Morgan", email: "alex@logio.com", role: "Owner" },
  { id: "priya", name: "Priya Shah", email: "priya@logio.com", role: "Admin" },
  { id: "jonas", name: "Jonas Weber", email: "jonas@logio.com", role: "Member" },
  { id: "mia", name: "Mia Chen", email: "mia@logio.com", role: "Member" },
  { id: "leo", name: "Leo Martins", email: "leo@logio.com", role: "Viewer" },
];
const roles = ["Admin", "Member", "Viewer"] as const;
const rowMotion = { opacity: 1, y: 0 };

export function MembersSettings({ workspaceId, notify, seatLimit, onMembersChange }: { workspaceId: string; notify: Notify; seatLimit: number; onMembersChange?: (count: number) => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const [members, setMembers] = useResource(resources.settingsMembers, workspaceId,  workspaceId === "acme" ? initialMembers : initialMembers.slice(0, 1));
  const [invite, setInvite] = useState(false);
  const [remove, setRemove] = useState<SettingsMember | null>(null);
  const [error, setError] = useState("");
  const reduced = useReducedMotion();
  useEffect(() => { onMembersChange?.(members.length); }, [members.length, onMembersChange]);
  return <section className="ui-sb-section ui-sb-section--first">
    <div className="ui-sb-section__head"><div><h2 className="ui-sb-h2">{uiText("Members")}</h2><p className="ui-sb-muted">{uiText(members.length)} {uiText(" of ")}{uiText(seatLimit)} {uiText(" seats used")}</p></div><SettingsButton icon="invite" onClick={() => { setError(""); setInvite(true); }}>{uiText("Invite")}</SettingsButton></div>
    <div className="ui-sb-tray"><div className="ui-sb-tray__head" aria-hidden="true"><span>{uiText("Member")}</span><span className="ui-sb-tray__end">{uiText("Role")}</span></div><div className="ui-sb-card ui-sb-list"><AnimatePresence initial={false}>
      {members.map((member, index) => <motion.div key={member.id} layout="position" className="ui-sb-row ui-as-rise" style={{ "--i": index } as CSSProperties} initial={reduced ? false : { opacity: 0, y: 8 }} animate={rowMotion} exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0, minHeight: 0 }} transition={{ duration: reduced ? 0 : .22 }}>
        <span className="ui-sb-avatar" data-tone={index % 4}>{uiText(member.name.split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join("").toUpperCase())}</span><span className="ui-sb-row__text"><b>{uiText(member.name)}{member.pending && <small className="ui-sb-pill" data-tone="amber">{uiText("Pending")}</small>}</b><span>{uiText(member.email)}</span></span>
        {member.role === "Owner" ? <><span className="ui-sb-role">{uiText("Owner")}</span><span className="ui-sb-row__spacer" /></> : <><SettingsMenu label={uiText(member.role)} ariaLabel={`Role for ${member.name}`} end>{close => roles.map(role => <button key={role} type="button" className="ui-as-menu__item" role="menuitemradio" aria-checked={member.role === role} onClick={() => { setMembers(previous => previous.map(item => item.id === member.id ? { ...item, role } : item)); close(); notify(`${member.name} is now ${role.toLowerCase()}`); }}>{uiText(role)}{member.role === role && <SettingsIcon name="check" size={14} />}</button>)}</SettingsMenu><SettingsMenu ariaLabel={`More for ${member.name}`} icon="more" end>{close => <button type="button" className="ui-as-menu__item" role="menuitem" data-danger="true" onClick={() => { close(); setRemove(member); }}><SettingsIcon name="trash" />{uiText(member.pending ? uiText("Cancel invitation") : uiText("Remove member"))}</button>}</SettingsMenu></>}
      </motion.div>)}
    </AnimatePresence></div></div>
    <WorkspaceDialog open={invite} title={uiText("Invite a teammate")} onClose={() => setInvite(false)}>
      <form onSubmit={event => { event.preventDefault(); if (members.length >= seatLimit) { setError("All seats are used. Upgrade your plan or remove a member first."); return; } const data = new FormData(event.currentTarget); const email = String(data.get("email")).trim().toLowerCase(); if (members.some(member => member.email.toLowerCase() === email)) { setError("This email is already a member or has a pending invitation."); return; } const role = String(data.get("role")) as typeof roles[number]; setMembers(previous => [...previous, { id: crypto.randomUUID(), name: email.split("@")[0].replace(/[._-]/g, " "), email, role, pending: true }]); setInvite(false); notify("Invitation saved locally · no email was sent"); }}>
        <p className="ui-sb-muted settings-dialog-intro">{uiText("Add a pending invitation to this workspace demo. No email is sent.")}</p><label className="crm-field">{uiText("Email address")}<input name="email" type="email" autoFocus placeholder={uiText("name@company.com")} required maxLength={120} onChange={() => setError("")} /></label><div className="crm-field"><Combobox label={uiText("Role")} name="role" defaultValue="Member" options={roles.map(role => ({ value: role, label: role }))} /></div>{error && <p className="workspace-form-error" role="alert">{uiText(error)}</p>}<div className="workspace-form-actions"><SettingsButton variant="ghost" onClick={() => setInvite(false)}>{uiText("Cancel")}</SettingsButton><SettingsButton type="submit">{uiText("Save invitation")}</SettingsButton></div>
      </form>
    </WorkspaceDialog>
    <WorkspaceDialog open={!!remove} title={uiText(remove?.pending ? uiText("Cancel invitation") : uiText("Remove member"))} onClose={() => setRemove(null)}><p className="ui-sb-muted settings-dialog-intro">{uiText(remove?.pending ? uiText("Cancel the pending invitation for {0}?", [remove?.email]) : uiText("Remove {0} from this workspace? Their local access entry will be removed.", [remove?.name]))}</p><div className="workspace-form-actions"><SettingsButton variant="ghost" onClick={() => setRemove(null)}>{uiText("Keep member")}</SettingsButton><SettingsButton onClick={() => { if (!remove) return; setMembers(previous => previous.filter(member => member.id !== remove.id)); notify(remove.pending ? "Invitation cancelled" : `${remove.name} removed`); setRemove(null); }}>{uiText(remove?.pending ? uiText("Cancel invitation") : uiText("Remove member"))}</SettingsButton></div></WorkspaceDialog>
  </section>;
}

/** `value` is the full secret. It exists only for keys made in this browser, or in the moment a backend creates one: backends never send it back. */
export type DemoApiKey = { id: string; name: string; prefix: string; suffix: string; created: string; lastUsed: string; value?: string };
/** What the backend's "api-key.create" command answers: the new key's details and its secret, shown once. */
interface CreatedApiKey { key: Omit<DemoApiKey, "value">; secret: string }
const isCreatedKey = (raw: unknown): raw is CreatedApiKey => conforms({ key: { id: "", name: "", prefix: "", suffix: "", created: "", lastUsed: "" }, secret: "" }, raw);
const initialKeys: DemoApiKey[] = [
  { id: "production", name: "Production", prefix: "sk-live-", suffix: "8F2q", created: "Mar 4, 2026", lastUsed: "2 minutes ago", value: "sk-demo-local-production-8F2q" },
  { id: "staging", name: "Staging", prefix: "sk-test-", suffix: "Lm7x", created: "May 18, 2026", lastUsed: "Yesterday", value: "sk-demo-local-staging-Lm7x" },
  { id: "zapier", name: "Zapier sync", prefix: "sk-live-", suffix: "Qz4k", created: "Aug 2, 2026", lastUsed: "Sep 28, 2026", value: "sk-demo-local-zapier-Qz4k" },
];

export function ApiKeysSettings({ workspaceId, notify }: { workspaceId: string; notify: Notify }) {
  const { t: uiText } = useWorkspaceI18n();
  const [keys, setKeys, sync] = useResource(resources.settingsApiKeys, workspaceId,  workspaceId === "acme" ? initialKeys : []);
  const backend = useWorkspaceBackend();
  const [creating, setCreating] = useState(false);
  const [revoke, setRevoke] = useState<DemoApiKey | null>(null);
  const [created, setCreated] = useState<DemoApiKey | null>(null);
  const [copied, setCopied] = useState("");
  const [rename, setRename] = useState<DemoApiKey | null>(null);
  const reduced = useReducedMotion();
  async function copy(key: DemoApiKey) { if (!key.value) return; try { await navigator.clipboard.writeText(key.value); setCopied(key.id); notify(backend.remote ? "API key copied" : "Local demo key copied · it cannot access a real API"); } catch { setCreated(key); notify("Copy is unavailable. Select the demo key in this dialog."); } }
  function createLocal() { const random = Array.from(crypto.getRandomValues(new Uint8Array(20)), value => value.toString(16).padStart(2, "0")).join(""); const key: DemoApiKey = { id: crypto.randomUUID(), name: `New key ${keys.length + 1}`, prefix: "sk-demo-", suffix: random.slice(-4), created: "Just now", lastUsed: "Never", value: `sk-demo-local-${random}` }; setKeys(previous => [key, ...previous]); setCreated(key); setCopied(""); }
  // With a backend that can make keys, the secret is made there and shown once; the list then comes from the server.
  async function createOnServer(command: NonNullable<typeof backend.command>) {
    setCreating(true);
    try {
      await sync.flush();
      const answer = await command.call(backend, "api-key.create", workspaceId, { name: `New key ${keys.length + 1}` });
      if (!isCreatedKey(answer)) throw new BackendError("invalid", "The server did not return the new key.");
      setCreated({ ...answer.key, value: answer.secret }); setCopied(""); sync.reload();
    } catch (error) { notify(error instanceof BackendError ? error.message : "The key could not be created."); }
    finally { setCreating(false); }
  }
  function create() { if (backend.command && backend.remote) void createOnServer(backend.command); else createLocal(); }
  return <section className="ui-sb-section ui-sb-section--first">
    <div className="ui-sb-section__head"><div><h2 className="ui-sb-h2">{uiText("API keys")}</h2><p className="ui-sb-muted">{uiText("Keys give full access to this workspace – keep them secret.")}</p></div><SettingsButton icon="plus" disabled={creating} onClick={create}>{uiText("Create key")}</SettingsButton></div>
    <div className="ui-sb-tray"><div className="ui-sb-tray__head" aria-hidden="true"><span>{uiText("Name")}</span><span className="ui-sb-tray__end ui-sb-tray__end--key">{uiText("Key")}</span></div><div className="ui-sb-card ui-sb-list"><AnimatePresence initial={false}>
      {keys.map((key, index) => <motion.div key={key.id} layout="position" className="ui-sb-row ui-as-rise" style={{ "--i": index } as CSSProperties} initial={reduced ? false : { opacity: 0, y: 8 }} animate={rowMotion} exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0, minHeight: 0 }} transition={{ duration: reduced ? 0 : .22 }}>
        <span className="ui-sb-tile"><SettingsIcon name="key" /></span><span className="ui-sb-row__text"><b><button type="button" className="settings-key-name" title={uiText("Rename key")} onClick={() => setRename(key)}>{uiText(key.name)}</button></b><span>{uiText("Created ")}{uiText(key.created)} {uiText(" · last used ")}{uiText(key.lastUsed)}</span></span><code className="ui-sb-key">{key.prefix}••••••••••••{key.suffix}</code>{key.value ? <button type="button" className="ui-as-tool" aria-label={uiText("Copy {0} key", [key.name])} title={uiText("Copy {0} key", [key.name])} onClick={() => void copy(key)}><SettingsIcon name={copied === key.id ? "check" : "copy"} /></button> : <span className="ui-as-tool" aria-hidden="true" title={uiText("A key is shown only once, when it is created")} style={{ visibility: "hidden" }}><SettingsIcon name="copy" /></span>}<button type="button" className="ui-as-tool ui-sb-danger" aria-label={uiText("Revoke {0} key", [key.name])} title={uiText("Revoke")} onClick={() => setRevoke(key)}><SettingsIcon name="trash" /></button>
      </motion.div>)}
    </AnimatePresence>{keys.length === 0 && <div className="workspace-empty"><SettingsIcon name="key" size={24} /><p>{uiText("No API keys yet. Create a local demo key to get started.")}</p></div>}</div></div>
    <WorkspaceDialog open={!!created} title={uiText(backend.remote ? uiText("New API key") : uiText("Local demo API key"))} onClose={() => setCreated(null)}><p className="ui-sb-muted settings-dialog-intro">{uiText(backend.remote ? uiText("Copy this key now. For your security it is shown only once and cannot be read again.") : uiText("This demo key is saved in this browser and has no access to a real API."))}</p><label className="crm-field">{uiText(created?.name)}<input className="settings-demo-key" readOnly value={created?.value || ""} onFocus={event => event.currentTarget.select()} /></label><div className="workspace-form-actions"><SettingsButton variant="ghost" onClick={() => setCreated(null)}>{uiText("Done")}</SettingsButton><SettingsButton icon={copied === created?.id ? "check" : "copy"} onClick={() => created && void copy(created)}>{uiText(copied === created?.id ? uiText("Copied") : backend.remote ? uiText("Copy key") : uiText("Copy demo key"))}</SettingsButton></div></WorkspaceDialog>
    <WorkspaceDialog open={!!rename} title={uiText("Rename key")} onClose={() => setRename(null)}>{rename && <form key={rename.id} onSubmit={event => { event.preventDefault(); const name = String(new FormData(event.currentTarget).get("name")).trim(); if (!name) return; setKeys(previous => previous.map(key => key.id === rename.id ? { ...key, name } : key)); setRename(null); notify("API key renamed"); }}><label className="crm-field">{uiText("Key name")}<input name="name" defaultValue={rename.name} required maxLength={50} autoFocus /></label><div className="workspace-form-actions"><SettingsButton variant="ghost" onClick={() => setRename(null)}>{uiText("Cancel")}</SettingsButton><SettingsButton type="submit">{uiText("Save name")}</SettingsButton></div></form>}</WorkspaceDialog>
    <WorkspaceDialog open={!!revoke} title={uiText("Revoke API key")} onClose={() => setRevoke(null)}><p className="ui-sb-muted settings-dialog-intro">{uiText("Revoke “")}{uiText(revoke?.name)}”? {uiText(backend.remote ? uiText("Anything using this key will stop working.") : uiText("This removes its local demo value from this workspace."))}</p><div className="workspace-form-actions"><SettingsButton variant="ghost" onClick={() => setRevoke(null)}>{uiText("Keep key")}</SettingsButton><SettingsButton onClick={() => { if (!revoke) return; setKeys(previous => previous.filter(key => key.id !== revoke.id)); if (created?.id === revoke.id) setCreated(null); setRevoke(null); notify(backend.remote ? "API key revoked" : "Local API key revoked"); }}>{uiText("Revoke key")}</SettingsButton></div></WorkspaceDialog>
  </section>;
}
