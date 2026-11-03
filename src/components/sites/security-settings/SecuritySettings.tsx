"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Copy, Download, Eye, EyeOff, Laptop, LoaderCircle, Monitor, ShieldCheck, ShieldOff, Smartphone, Tablet } from "lucide-react";
import { useResource } from "@/lib/workspace-backend/react";
import { resources } from "../workspace-resources";
import { downloadFile } from "../affectui-crm/workspace-state";
import { demoBackupCodes, demoOtp, demoSetupKey, initialSecurityPreview, passwordIssue, passwordStrength, previewSessions } from "./security-model";
import type { SecurityPreviewState } from "./security-model";
import { previewQrCells } from "./preview-qr";
import { HoldAction } from "./HoldAction";
import "./security-settings.css";

const spring = { type: "spring", stiffness: 300, damping: 37, mass: 1 } as const;
type SetupStep = 'scan' | 'verify' | 'codes';

function Reveal({ children, reduced }: { children: ReactNode; reduced: boolean }) {
  return <motion.div className="sec-reveal" initial={reduced ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={reduced ? { duration: 0 } : spring}>{children}</motion.div>;
}

function PasswordField({ label, value, onChange, autoComplete, invalid, errorId }: { label: string; value: string; onChange: (value: string) => void; autoComplete: string; invalid?: boolean; errorId?: string }) {
  const { t: uiText } = useWorkspaceI18n();
  const [visible, setVisible] = useState(false);
  const id = useId();
  return <div className="sec-field"><label htmlFor={id}>{uiText(label)}</label><div className="sec-input-wrap"><input id={id} type={visible ? 'text' : 'password'} value={value} onChange={event => onChange(event.target.value)} autoComplete={autoComplete} aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined} placeholder={uiText("Use a demo value")} required /><button type="button" aria-label={uiText("{0} {1}", [visible ? 'Hide' : 'Show', label.toLowerCase()])} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></div>;
}

/** Independent public-preview reconstruction. All security operations are explicitly a local preview, never real authentication. */
export function SecuritySettings({ email, title = "Where you log", embedded = false, labelledBy }: { email: string; title?: string; embedded?: boolean; labelledBy?: string }) {
  const { t: uiText } = useWorkspaceI18n();
  const [saved, setSaved, sync] = useResource(resources.securityPreview, undefined, initialSecurityPreview);
  const [step, setStep] = useState<SetupStep | null>(null);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [codesSaved, setCodesSaved] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [signOutOnPassword, setSignOutOnPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const root = useRef<HTMLElement>(null);
  const sessionHeading = useRef<HTMLHeadingElement>(null);
  const otpInputs = useRef<(HTMLInputElement | null)[]>([]);
  const pending = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const id = useId();
  const railId = useId();
  const reducedPreference = useReducedMotion();
  const [motionOff, setMotionOff] = useState(false);
  const reduced = !!reducedPreference || motionOff;
  useEffect(() => {
    const host = root.current?.closest('[data-ui-motion]') ?? root.current?.closest('.crm-page');
    if (!host) return;
    const read = () => setMotionOff(host.getAttribute('data-ui-motion') === 'off'); read();
    const observer = new MutationObserver(read); observer.observe(host, { attributes: true, attributeFilter: ['data-ui-motion'] });
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => { if (step === 'verify') otpInputs.current[0]?.focus({ preventScroll: true }); }, [step]);
  const sessions = previewSessions.filter(session => !saved.revoked.includes(session.id));
  const otherCount = sessions.filter(session => !('current' in session)).length;
  const strength = passwordStrength(newPassword);
  const changedLabel = saved.passwordChangedAt ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(saved.passwordChangedAt)) : 'March 4, 2026';

  async function commit(next: SecurityPreviewState, announcement: string): Promise<boolean> {
    if (pending.current) return false;
    pending.current = true; setBusy(true); setError('');
    try { setSaved(next); await sync.flush(); setMessage(`Preview: ${announcement}`); return true; }
    catch (error) { setError(error instanceof Error ? error.message : 'The preview could not be saved.'); return false; }
    finally { pending.current = false; setBusy(false); }
  }
  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); if (key === 'codes') setCodesSaved(true); timers.current.push(setTimeout(() => setCopied(''), 1800)); }
    catch { setMessage('Copy failed. Select the text or use Download.'); }
  }
  function resetSetup() { setStep(null); setOtp(['', '', '', '', '', '']); setOtpError(''); setCodesSaved(false); setAcknowledged(false); setVerifying(false); }
  function verify(code = otp.join('')) {
    if (verifying || code.length !== 6) return;
    setVerifying(true); setOtpError('');
    timers.current.push(setTimeout(() => {
      setVerifying(false);
      if (code !== demoOtp) { setOtpError('That code is not correct. Use the demo code 246810.'); otpInputs.current[0]?.focus({ preventScroll: true }); return; }
      setStep('codes'); setMessage('Preview: code accepted. Save your backup codes to finish.');
    }, 550));
  }
  function enterDigits(index: number, text: string) {
    const digits = text.replace(/\D/g, '');
    const next = [...otp];
    if (!digits) next[index] = '';
    else for (let offset = 0; offset < Math.min(digits.length, 6 - index); offset++) next[index + offset] = digits[offset];
    setOtp(next); setOtpError('');
    const to = Math.min(5, index + digits.length); otpInputs.current[to]?.focus();
    if (next.every(Boolean)) verify(next.join(''));
  }
  async function finishSetup() {
    if (!codesSaved || !acknowledged) return;
    if (await commit({ ...saved, twoFactor: true, twoFactorEnabledAt: new Date().toISOString() }, 'two-factor setup complete. No real sign-in setting was changed.')) resetSetup();
  }
  async function revoke(sessionId: string) {
    if (await commit({ ...saved, revoked: [...new Set([...saved.revoked, sessionId])] }, 'sample session revoked.')) {
            requestAnimationFrame(() => (root.current?.querySelector<HTMLButtonElement>('[data-revoke-session]') ?? sessionHeading.current)?.focus({ preventScroll: true }));
    }
  }
  function closePassword() { setPasswordOpen(false); setCurrentPassword(''); setNewPassword(''); setSignOutOnPassword(false); setPasswordError(''); }

  return <section ref={root} className={`sec-settings${embedded ? ' sec-settings--embedded' : ''}`} aria-labelledby={labelledBy ?? `${id}-title`} data-motion-off={reduced || undefined} data-interaction-own>
    <header className="sec-header">{embedded ? <div className="sec-account"><p>{uiText("Signed in as ")}<strong>{uiText(email)}</strong></p><span className="sec-badge">{uiText("Preview")}</span></div> : <><div><h3 id={`${id}-title`}>{uiText(title)}</h3><span className="sec-badge">{uiText("Preview")}</span></div><p>{uiText("Control how you sign in to Logio as ")}{uiText(email)}.</p></>}<p className="sec-preview-note">{uiText("Sample sessions and simulated security actions. Account authentication is not connected.")}</p></header>
    <section className="sec-section" aria-labelledby={`${id}-2fa`}><div className="sec-section-head"><div className="sec-section-text"><h4 id={`${id}-2fa`}>{uiText("Two-factor authentication")}</h4><p>{uiText("Ask for a code from your authenticator app when you sign in on a new device.")}</p></div><div className="sec-aside"><span className="sec-badge" data-on={saved.twoFactor || undefined}>{uiText(step ? uiText('Setting up') : saved.twoFactor ? uiText('On') : uiText('Off'))}</span>{step ? <button type="button" className="sec-button sec-button--ghost" disabled={verifying || busy} onClick={resetSetup}>{uiText("Cancel")}</button> : saved.twoFactor ? null : <button type="button" className="sec-button sec-button--primary" onClick={() => { resetSetup(); setStep('scan'); }}>{uiText("Enable")}</button>}</div></div>
      {saved.twoFactor && <div className="sec-enabled"><span className="sec-enabled-icon"><ShieldCheck size={22} /></span><div><h4>{uiText("Two-factor authentication is on")}</h4><p>{uiText("Authenticator app added ")}{uiText(saved.twoFactorEnabledAt ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(saved.twoFactorEnabledAt)) : uiText('in this preview'))} {uiText(" · 10 of 10 backup codes unused")}</p></div><HoldAction disabled={busy} label={uiText("Hold to turn off")} doneLabel="Turned off" Icon={ShieldOff} onConfirm={() => commit({ ...saved, twoFactor: false }, 'two-factor preview turned off.')} /></div>}
      <AnimatePresence initial={false}>{step && <Reveal reduced={reduced}><div className="sec-setup"><ol className="sec-rail" aria-label={uiText("Two-factor setup steps")}>{(['scan', 'verify', 'codes'] as const).map((item, index) => {
        const current = item === step, done = index < ['scan', 'verify', 'codes'].indexOf(step);
        return <li key={item} aria-current={current ? 'step' : undefined} data-done={done || undefined}>{current && <motion.span layoutId={`${railId}-step`} className="sec-rail-highlight" transition={reduced ? { duration: 0 } : spring} />}<span className="sec-rail-mark">{done ? <Check size={12} /> : index + 1}</span><span>{uiText(['Scan', 'Verify', 'Save codes'][index])}</span></li>;
      })}</ol>
        <AnimatePresence mode="wait" initial={false}><motion.div key={step} className="sec-step-content" initial={reduced ? false : { opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .16 }}>
          {step === 'scan' && <div className="sec-scan"><svg className="sec-qr" viewBox="0 0 176 176" role="img" aria-label="Decorative preview QR code, not a real authenticator code"><rect x=".5" y=".5" width="175" height="175" rx="12" fill="white" stroke="#e9e9e9" />{previewQrCells.map(([x, y]) => <rect key={`${x}:${y}`} x={13 + x * 6} y={13 + y * 6} width="6" height="6" rx="1" fill="#171717" />)}{[[13, 13], [121, 13], [13, 121]].map(([x, y]) => <g key={`${x}:${y}`}><rect x={x} y={y} width="42" height="42" rx="3" fill="#171717" /><rect x={x + 6} y={y + 6} width="30" height="30" rx="2" fill="white" /><rect x={x + 12} y={y + 12} width="18" height="18" rx="1" fill="#171717" /></g>)}</svg><div className="sec-scan-copy"><h4>{uiText("Scan with your authenticator app")}</h4><p>{uiText("Preview the setup flow for Logio as ")}{uiText(email)}{uiText(". This sample QR does not enroll an authenticator.")}</p><div className="sec-key-block"><p>{uiText("Can’t scan it? Enter this setup key")}</p><code>{demoSetupKey}</code><button type="button" className="sec-button sec-button--ghost" onClick={() => void copy(demoSetupKey, 'key')}><Copy size={14} />{uiText(copied === 'key' ? uiText('Copied') : uiText('Copy key'))}</button></div><div className="sec-actions"><button type="button" className="sec-button sec-button--primary" onClick={() => setStep('verify')}>{uiText("Continue")}</button></div></div></div>}
          {step === 'verify' && <form className="sec-verify" onSubmit={event => { event.preventDefault(); verify(); }}><label id={`${id}-otp-label`}>{uiText("Enter the 6-digit code from your app")}</label><div className="sec-otp" role="group" aria-labelledby={`${id}-otp-label`}>{otp.map((digit, index) => <input key={index} ref={node => { otpInputs.current[index] = node; }} value={digit} type="text" inputMode="numeric" pattern="[0-9]" maxLength={1} autoComplete={index === 0 ? 'one-time-code' : 'off'} disabled={verifying} aria-label={uiText("Enter the 6-digit code from your app, digit {0} of 6", [index + 1])} aria-invalid={!!otpError} aria-describedby={otpError ? `${id}-otp-error` : `${id}-otp-hint`} onChange={event => enterDigits(index, event.target.value)} onPaste={event => { event.preventDefault(); enterDigits(index, event.clipboardData.getData('text')); }} onKeyDown={event => { if (event.key === 'Backspace' && !digit && index > 0) { event.preventDefault(); otpInputs.current[index - 1]?.focus(); } if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); otpInputs.current[Math.max(0, Math.min(5, index + (event.key === 'ArrowRight' ? 1 : -1)))]?.focus(); } }} />)}</div><p id={`${id}-otp-hint`}>{uiText("Demo code: ")}<code>246810</code>{uiText(". This preview does not verify a real authenticator.")}</p>{otpError && <p className="sec-error" role="alert" id={`${id}-otp-error`}>{uiText(otpError)}</p>}<div className="sec-actions"><button type="button" className="sec-button sec-button--ghost" disabled={verifying} onClick={() => setStep('scan')}>{uiText("Back")}</button><button type="submit" className="sec-button sec-button--primary" disabled={verifying || otp.some(digit => !digit)} aria-busy={verifying}>{verifying && <LoaderCircle className="sec-spin" size={14} />}{uiText("Verify")}</button></div></form>}
          {step === 'codes' && <div className="sec-codes"><h4>{uiText("Save your backup codes")}</h4><p>{uiText("These are sample codes for the preview. They cannot be used to sign in.")}</p><div className="sec-code-actions"><button type="button" className="sec-button" onClick={() => void copy(demoBackupCodes.join('\n'), 'codes')}><Copy size={14} />{uiText(copied === 'codes' ? uiText('Copied') : uiText('Copy codes'))}</button><button type="button" className="sec-button" onClick={() => { downloadFile('logio-preview-backup-codes.txt', `LOGIO PREVIEW — NOT REAL RECOVERY CODES\n\n${demoBackupCodes.join('\n')}`); setCodesSaved(true); }}><Download size={14} />{uiText("Download")}</button></div><ul className="sec-code-grid">{demoBackupCodes.map(code => <li key={code}><code>{code}</code></li>)}</ul>{codesSaved ? <label className="sec-checkbox"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />{uiText("I saved my backup codes")}</label> : <p className="sec-muted">{uiText("Copy or download the codes to finish")}</p>}<div className="sec-actions"><button type="button" className="sec-button sec-button--primary" disabled={!codesSaved || !acknowledged || busy} onClick={() => void finishSetup()}>{uiText("Finish setup")}</button></div></div>}
        </motion.div></AnimatePresence>
      </div></Reveal>}</AnimatePresence>

    </section>
    <section className="sec-section" aria-labelledby={`${id}-password`}><div className="sec-section-head"><div className="sec-section-text"><h4 id={`${id}-password`}>{uiText("Password")}</h4><p>{uiText("Last changed ")}{uiText(changedLabel)}</p></div><button type="button" className="sec-button" onClick={() => passwordOpen ? closePassword() : setPasswordOpen(true)}>{uiText(passwordOpen ? uiText('Cancel') : uiText('Change password'))}</button></div>
      <AnimatePresence initial={false}>{passwordOpen && <Reveal reduced={reduced}><form className="sec-password-form" onSubmit={async event => {
        event.preventDefault(); const issue = passwordIssue(currentPassword, newPassword); setPasswordError(issue ?? ''); if (issue) return;
        if (await commit({ ...saved, passwordChangedAt: new Date().toISOString(), revoked: signOutOnPassword ? previewSessions.filter(session => !('current' in session)).map(session => session.id) : saved.revoked }, 'password change simulated. No account password was changed.')) closePassword();
      }}><p className="sec-muted">{uiText("Use demo values. Passwords are never saved or sent by this preview.")}</p><PasswordField label={uiText("Current password")} value={currentPassword} onChange={setCurrentPassword} autoComplete="off" invalid={!!passwordError} errorId={`${id}-password-error`} /><PasswordField label={uiText("New password")} value={newPassword} onChange={setNewPassword} autoComplete="off" invalid={!!passwordError} errorId={`${id}-password-error`} /><div className="sec-strength" aria-label={uiText("Password strength: {0}", [['Empty', 'Weak', 'Fair', 'Good', 'Strong'][strength]])}><div>{[1, 2, 3, 4].map(part => <span key={part} data-filled={part <= strength || undefined} data-level={strength} />)}</div><span>{uiText(['Use at least 12 characters', 'Weak', 'Fair', 'Good', 'Strong'][strength])}</span></div><ul className="sec-requirements">{[
        { label: 'At least 12 characters', met: newPassword.length >= 12 },
        { label: 'Upper and lowercase letters', met: /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword) },
        { label: 'At least one number', met: /\d/.test(newPassword) },
        { label: 'At least one symbol', met: /[^a-z\d]/i.test(newPassword) },
      ].map(item => <li key={item.label} data-met={item.met || undefined}><span>{item.met ? <Check size={11} /> : null}</span>{uiText(item.label)}</li>)}</ul><label className="sec-checkbox"><input type="checkbox" checked={signOutOnPassword} onChange={event => setSignOutOnPassword(event.target.checked)} />{uiText("Sign out of other sessions")}</label>{passwordError && <p className="sec-error" role="alert" id={`${id}-password-error`}>{uiText(passwordError)}</p>}<div className="sec-actions"><button type="submit" className="sec-button sec-button--primary" disabled={busy}>{busy && <LoaderCircle size={14} className="sec-spin" />}{uiText("Update password")}</button></div></form></Reveal>}</AnimatePresence>
    </section>
    <section className="sec-section" aria-labelledby={`${id}-sessions`}><div className="sec-section-head"><div className="sec-section-text"><h4 ref={sessionHeading} tabIndex={-1} id={`${id}-sessions`}>{uiText("Active sessions ")}<span className="sec-count">{uiText(sessions.length)}</span></h4><p>{uiText("Sample devices from the reference preview, not your account’s login history.")}</p></div></div>
      <ul className="sec-sessions"><AnimatePresence initial={false}>{sessions.map(session => {
        const Icon = session.kind === 'phone' ? Smartphone : session.kind === 'tablet' ? Tablet : session.kind === 'desktop' ? Monitor : Laptop;
        return <motion.li key={session.id} className="sec-session" layout={!reduced} initial={false} exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }} transition={reduced ? { duration: 0 } : spring}><div className="sec-session-row"><Icon size={16} /><div className="sec-session-text"><div><span>{uiText(session.device)}</span>{'current' in session && <span className="sec-badge">{uiText("This device")}</span>}{'newLocation' in session && <span className="sec-badge sec-badge--warning">{uiText("New location")}</span>}</div><p>{uiText(session.detail)}</p></div>{!('current' in session) && <button type="button" className="sec-button sec-button--ghost" data-revoke-session aria-label={uiText("Revoke {0}", [session.device])} disabled={busy} onClick={() => void revoke(session.id)}>{uiText("Revoke")}</button>}</div></motion.li>;
      })}</AnimatePresence></ul>
      <div className="sec-session-footer"><span>{uiText("You stay signed in on this device")}</span><HoldAction disabled={!otherCount || busy} onConfirm={() => commit({ ...saved, revoked: previewSessions.filter(session => !('current' in session)).map(session => session.id) }, 'all other sample sessions signed out.')} /></div>
    </section>
    {(error || sync.error) && <p role="alert" className="sec-error sec-feedback">{uiText(error || sync.error?.message)}<button type="button" className="sec-button sec-button--ghost" onClick={sync.retry}>{uiText("Retry")}</button></p>}
    <span className="sec-sr" aria-live="polite" aria-atomic="true">{uiText(message)}</span>
  </section>;
}
