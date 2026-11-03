"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDownToLine, ArrowRight, BookOpen, Check, CheckCircle2, CircleAlert, Code2, Database, FileCode2, Fingerprint, HardDrive, Loader2, Plus, Radio, Search, Send, Settings2, X } from "lucide-react";
import { WorkspaceDialog } from "../affectui-crm/WorkspaceDialog";
import { downloadFile } from "../affectui-crm/workspace-state";
import { SectionSkeleton } from "../shimmer-loader/SectionSkeleton";
import { GitHubMark as Github } from "./GitHubMark";
import { RealtimeStream } from "./RealtimeStream";
import { SkillMenu } from "./SkillMenu";
import { SkillCard } from "./SkillCard";
import { resolveGitHubSkillUrl } from "@/lib/skilled/github-source";
import type { SkillCandidate } from "@/lib/skilled/github-folder";
import { createBundle, parseSkillMarkdown, parseSkillRecord, sha256, totalSkillBytes, validateTransferReceipt, type SkillRecord, type SkillTarget } from "./skill-model";
import { useSkills } from "./useSkills";
import { SkillOverview } from "./SkillOverview";
import { SkillTimeline } from "./SkillTimeline";
import { applySkillEdit, reinsertSkill, withGhosts, withoutSkill, type Ghost, type SkillDraft } from "./skill-edit";
import { settled } from "./skill-persist";
import "./skilled.css";

type Filter = "all" | "ready" | "archived";
const guardrailDefaults = { citeSources: true, verifyBeforeAnswer: true, askWhenUncertain: true };
type ImportData = Pick<SkillRecord, "name" | "description" | "instructions" | "sourceUrl" | "sourceRef" | "sourcePath" | "sha256" | "bytes" | "files">;

export function Skilled({ workspaceId }: { workspaceId: string }) {
  const { t: uiText } = useWorkspaceI18n();
  const { skills, setSkills, sync, events, eventsSync, record, backend, entry } = useSkills(workspaceId);
  const [instructions, setInstructions] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [target, setTarget] = useState<SkillTarget>("Local AI");
  const [guardrails, setGuardrails] = useState(guardrailDefaults);
  const [attributes, setAttributes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [sourceMode, setSourceMode] = useState<"github" | "write" | "file">("github");
  const [fieldError, setFieldError] = useState("");
  const [candidates, setCandidates] = useState<SkillCandidate[]>([]);
  const [picking, setPicking] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [transfer, setTransfer] = useState(false);
  const [agent, setAgent] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [metric, setMetric] = useState("all");
  const [undo, setUndo] = useState<SkillRecord | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // skills just deleted keep their card in place (showing the result and Undo) until it settles
  const [ghosts, setGhosts] = useState<ReadonlyMap<string, Ghost>>(() => new Map());
  const inputFile = useRef<HTMLInputElement>(null);
  const receiptFile = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (!textarea.current) return;
    textarea.current.style.height = "0px";
    textarea.current.style.height = `${Math.max(64, Math.min(220, textarea.current.scrollHeight))}px`;
  }, [instructions]);
  const ready = skills.filter(skill => skill.status === "ready");
  const chosen = ready.filter(skill => selected.includes(skill.id));
  const visible = withGhosts(skills, ghosts).filter(({ skill }) => (filter === "all" || skill.status === filter) && `${skill.name} ${skill.description} ${skill.target}`.toLowerCase().includes(query.toLowerCase()));
  const measures = events.filter(event => metric === "all" || event.kind === metric);
  const successful = measures.filter(event => event.outcome === "success");
  const sorted = successful.map(event => event.durationMs).sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.ceil(sorted.length * .95) - 1] : null;
  const bytes = (value: number) => value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KB`;
  const tell = (message: string) => { setNotice(message); setError(""); };

  async function addSkill(source = url) {
    if (busy || sync.phase !== "ready" || sync.error) return;
    setFieldError("");
    if (source.trim()) {
      try { resolveGitHubSkillUrl(source.trim()); }
      catch (failure) { setAttributes(true); setSourceMode("github"); setFieldError(failure instanceof Error ? failure.message : "Check this GitHub URL."); requestAnimationFrame(() => document.getElementById("sk-source")?.focus()); return; }
    } else if (!instructions.trim() || !description.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) {
      setAttributes(true); setSourceMode("write"); setFieldError("Add a lowercase-with-hyphens name, a description and the skill instructions."); requestAnimationFrame(() => document.getElementById("sk-name")?.focus()); return;
    }
    setBusy(true); setError(""); setNotice("");
    const started = performance.now();
    const controller = new AbortController(); abort.current = controller;
    try {
      let imported: ImportData;
      if (source.trim()) {
        const response = await fetch("/api/skilled/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: source.trim() }), signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "Could not read this GitHub skill.");
        if (Array.isArray(result.data?.candidates)) {
          setCandidates(result.data.candidates); setCandidateSearch(""); setPicking(true);
          record({ kind: "import", label: `Source scan · ${result.data.candidates.length} skills found`, durationMs: performance.now() - started, bytes: new TextEncoder().encode(JSON.stringify(result.data)).length, outcome: "success" });
          return;
        }
        imported = result.data as ImportData;
        if (instructions.trim()) {
          const path = "WORKSPACE-INSTRUCTIONS.md";
          if (imported.files?.some(file => file.path.toLowerCase() === path.toLowerCase())) throw new Error("This skill already has WORKSPACE-INSTRUCTIONS.md. Import it first, or clear the additional instructions to preserve its source file.");
          const content = `# Additional workspace instructions\n\n${instructions.trim()}\n`;
          imported.files = [...(imported.files ?? []), { path, content, encoding: "utf8", sha256: await sha256(content), bytes: new TextEncoder().encode(content).length }];
        }
      } else {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) throw new Error("Give the skill a name in lowercase-with-hyphens (up to 64 characters).");
        if (!description.trim() || !instructions.trim()) throw new Error("Add a description and the instructions your agent should follow.");
        const content = instructions.replace(/^\uFEFF/, "").startsWith("---") ? instructions : `---\nname: ${name}\ndescription: ${JSON.stringify(description.trim())}\n---\n\n${instructions.trim()}\n`;
        const metadata = parseSkillMarkdown(content);
        if (metadata.name !== name || metadata.description !== description.trim()) throw new Error("The name and description must match the SKILL.md frontmatter. Edit the file header to change them.");
        imported = { name, description: description.trim(), instructions: content, sourceUrl: "", sourceRef: "", sourcePath: "", sha256: await sha256(content), bytes: new TextEncoder().encode(content).length };
      }
      if (controller.signal.aborted) return;
      if (skills.some(skill => skill.name === imported.name && skill.status !== "archived")) throw new Error("This skill already exists. Archive the old version before adding a new one.");
      if (skills.length >= 200) throw new Error("This workspace holds up to 200 skills.");
      const skill: SkillRecord = { ...imported, id: crypto.randomUUID(), importedAt: new Date().toISOString(), target, status: "ready", guardrails: { ...guardrails } };
      if (!parseSkillRecord(skill) || await sha256(skill.instructions) !== skill.sha256) throw new Error("Skill data or checksum is invalid. Check the source and file size.");
      setSkills(current => [skill, ...current]);
      record({ kind: "import", skillId: skill.id, label: source ? "GitHub skill folder scan" : "Authored instruction", durationMs: performance.now() - started, bytes: totalSkillBytes(skill), outcome: "success" });
      setInstructions(""); setName(""); setDescription(""); setUrl(""); setExpanded(current => new Set([...current, skill.id])); setFilter("all"); setAttributes(false); setSourceMode("github");
      tell(`${skill.name} added. The save status confirms when it is persisted.`);
    } catch (failure) {
      if (controller.signal.aborted) { tell("Import cancelled."); return; }
      const message = failure instanceof Error ? failure.message : "Could not add this skill.";
      setFieldError(message); setAttributes(true);
      record({ kind: "import", label: "Skill import", durationMs: performance.now() - started, bytes: 0, outcome: "error", detail: message });
    } finally { setBusy(false); abort.current = null; }
  }

  async function deliver(remote: boolean) {
    if (!chosen.length || busy) return;
    setBusy(true); setError("");
    const started = performance.now();
    try {
      await sync.flush();
      const current = entry.getSnapshot();
      if (current.save !== "idle" || current.error) throw new Error("Wait for the skill library to finish saving before delivery.");
      const bundle = await createBundle(chosen, workspaceId);
      const countBytes = new TextEncoder().encode(JSON.stringify(bundle)).length;
      if (remote) {
        if (!backend.remote || !backend.command) throw new Error("Connect a workspace backend to transfer to an agent.");
        if (!agent.trim()) throw new Error("Enter the agent ID configured in your backend.");
        const result = await backend.command("skill.transfer", workspaceId, { agent: agent.trim(), bundle });
        const receipt = validateTransferReceipt(result, bundle);
        if (!receipt || receipt.agent !== agent.trim()) throw new Error("The backend did not return a matching agent receipt. Delivery is unconfirmed.");
        tell(`Receipt confirmed by ${receipt.agent}. ${receipt.accepted.length} skill(s) received; this does not verify model behavior.`);
      } else {
        downloadFile(`logio-skills-${workspaceId}.json`, JSON.stringify(bundle, null, 2), "application/json");
        tell("Bundle prepared for download. Run the local installer, then load the instructions in your agent.");
      }
      record({ kind: remote ? "transfer" : "export", label: remote ? `Receipt · ${agent}` : "Bundle serialization", durationMs: performance.now() - started, bytes: countBytes, outcome: "success" });
      setTransfer(false);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "Delivery failed.";
      setError(message);
      record({ kind: remote ? "transfer" : "export", label: remote ? "Agent transfer" : "Bundle export", durationMs: performance.now() - started, bytes: 0, outcome: "error", detail: message });
    } finally { setBusy(false); }
  }

  function submit(event: FormEvent) { event.preventDefault(); void addSkill(); }
  async function importReceipt(file: File) {
    const started = performance.now();
    try {
      if (file.size > 150000) throw new Error("Receipt file is too large.");
      const raw: unknown = JSON.parse(await file.text());
      const preliminary = validateTransferReceipt(raw);
      if (!preliminary || !preliminary.accepted.length) throw new Error("Invalid receipt file.");
      const matching = ready.filter(skill => preliminary.accepted.some(item => item.id === skill.id));
      const bundle = await createBundle(matching, workspaceId);
      const receipt = validateTransferReceipt(raw, bundle);
      if (!receipt) throw new Error("Receipt does not match this workspace’s skill IDs and checksums.");
      record({ kind: "transfer", label: "Offline file receipt", durationMs: performance.now() - started, bytes: receipt.bytes, outcome: "success", detail: `Receipt verification only; original delivery duration unavailable. ${receipt.agent}` });
      tell(`Receipt imported for ${receipt.accepted.length} instruction file(s). Agent loading and execution remain unverified.`);
      setTransfer(false);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not read receipt."); }
  }
  function archive(skill: SkillRecord) {
    setSkills(current => current.map(item => item.id === skill.id ? { ...item, status: "archived" } : item));
    setSelected(current => current.filter(id => id !== skill.id)); setUndo(skill); tell(`${skill.name} archived.`);
  }

  /** Save an edit and wait until the workspace has really stored it: the Save changes button shows Saving until then. */
  async function saveEdit(skill: SkillRecord, draft: SkillDraft) {
    const next = await applySkillEdit(skill, draft, skills);
    setSkills(current => current.map(item => (item.id === skill.id ? next : item)));
    await settled(entry);
  }
  /** Delete for good (Undo restores it to its place). Safe to run again after a failed save: it only removes what is still there. */
  async function deleteSkill(skill: SkillRecord) {
    const { removed, index } = withoutSkill(skills, skill.id);
    if (removed) {
      setSkills(current => withoutSkill(current, skill.id).next);
      setGhosts(current => new Map(current).set(skill.id, { skill: removed, index }));
      setSelected(current => current.filter(id => id !== skill.id)); setEditingId(current => (current === skill.id ? null : current));
    }
    await settled(entry);
  }
  async function undoDelete(skill: SkillRecord) {
    const ghost = ghosts.get(skill.id);
    setSkills(reinsertSkill(skills, ghost?.skill ?? skill, ghost?.index ?? 0));
    setGhosts(current => { const next = new Map(current); next.delete(skill.id); return next; });
    await settled(entry);
  }
  function settleDeleted(id: string) { setGhosts(current => { if (!current.has(id)) return current; const next = new Map(current); next.delete(id); return next; }); }

  function chooseSource(next: "github" | "write" | "file") {
    setSourceMode(next); setAttributes(true); setFieldError("");
    if (next !== "github") setUrl("");
    if (next === "file") inputFile.current?.click();
  }
  function toggleCard(id: string) {
    setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function restore(skill: SkillRecord) {
    if (skills.some(item => item.id !== skill.id && item.name === skill.name && item.status === "ready")) { setError("Archive the active version before restoring this one."); return; }
    setSkills(current => current.map(item => item.id === skill.id ? { ...item, status: "ready" } : item));
  }
  async function readLocalFile(file: File) {
    if (file.size > 200000) { setFieldError("Choose a SKILL.md smaller than 200 KB."); setAttributes(true); return; }
    try {
      const text = await file.text(); const metadata = parseSkillMarkdown(text);
      setInstructions(text); setName(metadata.name); setDescription(metadata.description); setUrl(""); setSourceMode("file"); setAttributes(true); setFieldError("");
      requestAnimationFrame(() => textarea.current?.focus());
    } catch (failure) { setFieldError(failure instanceof Error ? failure.message : "Invalid SKILL.md."); setAttributes(true); }
  }
  const filteredCandidates = candidates.filter(candidate => `${candidate.name} ${candidate.description} ${candidate.path}`.toLowerCase().includes(candidateSearch.toLowerCase()));

  if (sync.phase !== "ready") return <SectionSkeleton section="Skilled" />;
  return <div className="sk-workspace" role="region" aria-label={uiText("Skilled workspace")}>
    <div className="sk-content">
      <div className="sk-layout">
        <div className="sk-primary">
          <SkillOverview skills={skills} events={events} />
          <section className="sk-task-panel" aria-label={uiText("Skill library")}>
            <form className="sk-composer" onSubmit={submit} aria-label={uiText("Add a skill")} noValidate>
              <div className="sk-composer-field" data-busy={busy || undefined}>
                <label className="sk-sr-only" htmlFor="sk-instructions">{uiText("Skill instructions")}</label>
                <textarea ref={textarea} id="sk-instructions" rows={2} placeholder={url ? uiText("Additional instructions for this skill (optional)") : uiText("What should your agent know how to do?")} value={instructions} onChange={event => { setInstructions(event.target.value); setFieldError(""); if (!url) { setAttributes(true); setSourceMode("write"); } }} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void addSkill(); } }} maxLength={200000} />
                <div className="sk-composer-bar">
                  <div className="sk-chips">
                    <SkillMenu label={uiText("Skill source")} value={sourceMode} triggerLabel={url ? "GitHub source" : sourceMode === "file" ? "Local file" : sourceMode === "write" ? "Custom skill" : "Add source"} icon={url || sourceMode === "github" ? <Github size={14} /> : sourceMode === "file" ? <HardDrive size={14} /> : <FileCode2 size={14} />} actions options={[
                      { value: "github", label: "GitHub repository", icon: <Github size={16} />, description: "Scan a repository or a skill folder" },
                      { value: "file", label: "Local SKILL.md", icon: <HardDrive size={16} />, description: "Read an instruction file from your device" },
                      { value: "write", label: "Write instructions", icon: <FileCode2 size={16} />, description: "Create a skill in this workspace" },
                    ]} onSelect={chooseSource} focusAfterSelect={next => next === "github" ? document.getElementById("sk-source") : textarea.current} />
                    <SkillMenu label={uiText("Skill target")} value={target} icon={<Code2 size={14} />} options={[
                      { value: "Local AI", label: "Local AI", icon: <HardDrive size={16} /> },
                      { value: "AI Agent", label: "AI Agent", icon: <Code2 size={16} /> },
                    ]} onSelect={setTarget} />
                    <button type="button" className="sk-chip" aria-expanded={attributes} aria-controls="sk-attributes" onClick={() => setAttributes(!attributes)}><Settings2 size={14} /><span>{uiText("Attributes")}</span></button>
                  </div>
                  <div className="sk-start-slot"><kbd>{uiText("Ctrl / ⌘ ↵")}</kbd>{busy && abort.current ? <button className="sk-secondary" type="button" onClick={() => abort.current?.abort()}>{uiText("Cancel")}</button> : null}<button className="sk-start" type="submit" disabled={busy || Boolean(sync.error) || (!url.trim() && !instructions.trim())}>{busy ? <Loader2 size={14} className="sk-spin" /> : <Plus size={14} />}{uiText(busy ? uiText("Scanning...") : uiText("Add skill"))}</button></div>
                </div>
              </div>
              <AnimatePresence initial={false}>{attributes && <motion.div id="sk-attributes" className="sk-attributes" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: "spring", stiffness: 350, damping: 34 }}>
                <div>
                  <label htmlFor="sk-source">{uiText("GitHub repository or skill URL ")}<span>{uiText("optional")}</span></label>
                  <input id="sk-source" type="url" placeholder={uiText("https://github.com/owner/repo")} value={url} onChange={event => { setUrl(event.target.value); setSourceMode("github"); setFieldError(""); }} aria-invalid={Boolean(fieldError) && sourceMode === "github"} aria-describedby={fieldError ? "sk-field-error" : undefined} />
                  {!url && sourceMode !== "github" && <div className="sk-form-grid">
                    <label htmlFor="sk-name">{uiText("Skill name")}<input id="sk-name" placeholder={uiText("evidence-first-research")} value={name} maxLength={64} onChange={event => { setName(event.target.value); setFieldError(""); }} /></label>
                    <label htmlFor="sk-description">{uiText("Description")}<input id="sk-description" placeholder={uiText("When should the agent use this skill?")} value={description} maxLength={2048} onChange={event => { setDescription(event.target.value); setFieldError(""); }} /></label>
                  </div>}
                  <div className="sk-guardrails">{([["citeSources", "Cite sources"], ["verifyBeforeAnswer", "Verify before answering"], ["askWhenUncertain", "Ask when uncertain"]] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={guardrails[key]} onChange={event => setGuardrails({ ...guardrails, [key]: event.target.checked })} /><Check size={11} aria-hidden="true" /><span>{uiText(label)}</span></label>)}</div>
                  <button type="button" className="sk-text-button" onClick={() => inputFile.current?.click()}><FileCode2 size={13} />{uiText("Read a local SKILL.md")}</button>
                </div>
              </motion.div>}</AnimatePresence>
              <input type="file" accept=".md,text/markdown,text/plain" hidden ref={inputFile} onChange={event => { const file = event.target.files?.[0]; if (file) void readLocalFile(file); event.target.value = ""; }} />
              {fieldError && <div id="sk-field-error" className="sk-composer-error" role="alert"><CircleAlert size={15} /><span>{uiText(fieldError)}</span><button type="button" aria-label={uiText("Dismiss import error")} onClick={() => setFieldError("")}><X size={13} /></button></div>}
            </form>
            <div className="sk-library-toolbar">
              <div className="sk-tabs" role="tablist" aria-label={uiText("Filter skills")}>{([["all", "All skills"], ["ready", "Ready"], ["archived", "Archived"]] as const).map(([id, label], index) => <button key={id} role="tab" aria-selected={filter === id} tabIndex={filter === id ? 0 : -1} onKeyDown={event => {
                if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3; setFilter((["all", "ready", "archived"] as const)[next]); (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus(); }
              }} onClick={() => setFilter(id)}>{filter === id && <motion.span layoutId="skill-filter" transition={{ type: "spring", stiffness: 450, damping: 38 }} />}<span>{uiText(label)}</span><span className="sk-count"><AnimatePresence initial={false} mode="popLayout"><motion.span key={id === "all" ? skills.length : skills.filter(skill => skill.status === id).length} initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -6, opacity: 0 }} transition={{ duration: .18 }}>{uiText(id === "all" ? skills.length : skills.filter(skill => skill.status === id).length)}</motion.span></AnimatePresence></span></button>)}</div>
              <div className="sk-library-actions"><span className="sk-save-status">{uiText(sync.save === "saving" ? uiText("Saving...") : sync.error ? uiText("Save failed") : uiText("Saved"))}</span>{ready.length > 0 && <button className="sk-secondary sk-deliver-all" aria-label={uiText("Deliver skills")} onClick={() => { setSelected(ready.map(skill => skill.id)); setTransfer(true); }}><ArrowDownToLine size={14} /><span>{uiText("Deliver skills")}</span></button>}</div>
            </div>
            {skills.length > 0 && <label className="sk-search"><Search size={14} /><input aria-label={uiText("Search skills")} placeholder={uiText("Find a skill...")} value={query} onChange={event => setQuery(event.target.value)} /><span>{uiText(skills.length)}/200</span></label>}
            <div className="sk-cards"><AnimatePresence initial={false}>{visible.map(({ skill, ghost }) => <SkillCard key={skill.id} skill={skill} expanded={expanded.has(skill.id)} editing={editingId === skill.id} deleted={ghost} onToggle={() => toggleCard(skill.id)} onDeliver={() => { setSelected([skill.id]); setTransfer(true); }} onArchive={() => archive(skill)} onRestore={() => restore(skill)} onEdit={() => { setEditingId(skill.id); setExpanded(current => new Set([...current, skill.id])); }} onCloseEdit={() => setEditingId(null)} onSave={draft => saveEdit(skill, draft)} onDelete={() => deleteSkill(skill)} onUndoDelete={() => undoDelete(skill)} onDeleteSettled={() => settleDeleted(skill.id)} />)}</AnimatePresence>
              {!visible.length && <div className="sk-empty"><div className="sk-empty-icon"><BookOpen size={23} /><span><Plus size={10} /></span></div><h2>{uiText(skills.length ? uiText("No skills in this view") : uiText("No skills yet"))}</h2><p>{skills.length ? uiText("Try a different filter or search.") : uiText("Import from GitHub or add your own instructions.")}</p><button className="sk-secondary" onClick={() => chooseSource("github")}>{uiText("Add from GitHub")}<ArrowRight size={14} /></button></div>}
            </div>
          </section>
          <SkillTimeline skills={skills} events={events} />
        </div>
        <aside className="sk-observability" aria-label={uiText("Skill operations measurement")}>
          <section className="sk-monitor">
            <div className="sk-section-title"><h2><Radio size={15} />{uiText("Realtime stream")}</h2><span className="sk-observed">{uiText("Measured")}</span></div>
            <SkillMenu label={uiText("Measurement type")} value={metric} className="sk-metric-select" options={[{ value: "all", label: "All operations" }, { value: "save", label: "Storage writes" }, { value: "import", label: "Imports" }, { value: "export", label: "Bundle exports" }, { value: "transfer", label: "Agent transfers" }]} onSelect={setMetric} />
            <RealtimeStream points={measures.map(event => ({ t: event.t, value: event.durationMs, anomaly: event.outcome === "error" ? "Failed" : undefined }))} label={uiText("Operation duration")} emptyLabel="Add a skill to see your first measurement" unit="ms" />
            <div className="sk-metrics"><div><span>{uiText("Operations")}</span><strong>{uiText(measures.length)}</strong></div><div><span>{uiText("p95 duration")}</span><strong>{uiText(p95 === null ? "\u2014" : p95 < 10 ? p95.toFixed(1) : Math.round(p95))}<small>{uiText(p95 !== null && uiText(" ms"))}</small></strong></div><div><span>{uiText("Errors")}</span><strong>{uiText(measures.filter(event => event.outcome === "error").length)}</strong></div></div>
            <div className="sk-monitor-foot"><span><Database size={12} />{uiText(backend.remote ? uiText("Configured REST backend") : uiText("This browser only"))}</span><span>{uiText("Latest 200")}</span></div>
          </section>
          <section className="sk-activity"><div className="sk-section-title"><h2>{uiText("Activity")}</h2><span>{uiText(events.length)}</span></div>{!events.length ? <div className="sk-activity-empty"><span className="sk-quiet-dot" />{uiText("Waiting for your first operation.")}</div> : <ol>{events.slice(-5).reverse().map(event => <li key={event.id}><span className="sk-event-icon" data-error={event.outcome === "error"}>{event.outcome === "success" ? <Check size={12} /> : <X size={12} />}</span><div><strong>{uiText(event.label)}</strong><span title={uiText(event.detail)}>{uiText(event.outcome === "error" ? event.detail : uiText("{0} - {1}", [bytes(event.bytes), new Date(event.t).toLocaleTimeString("en-GB", { timeZone: "Asia/Ho_Chi_Minh" })]))}</span></div><small>{uiText(event.durationMs < 10 ? event.durationMs.toFixed(1) : Math.round(event.durationMs))} {uiText(" ms")}</small></li>)}</ol>}</section>
        </aside>
      </div>
      {(error || sync.error || eventsSync.error) && <div className="sk-error" role="alert"><CircleAlert size={16} /><span>{uiText(error || sync.error?.message || eventsSync.error?.message)}</span>{sync.error && <button onClick={sync.retry}>{uiText("Retry save")}</button>}{eventsSync.error && <button onClick={eventsSync.retry}>{uiText("Retry activity save")}</button>}<button aria-label={uiText("Dismiss error")} onClick={() => setError("")}><X size={14} /></button></div>}
      <div className="sk-notice" role="status">{notice && <><CheckCircle2 size={14} /><span>{uiText(notice)}</span>{undo && <button onClick={() => { const previous = undo; if (skills.some(item => item.name === previous.name && item.id !== previous.id && item.status === "ready")) { setError("Archive the active version before undoing."); return; } setSkills(current => current.map(item => item.id === previous.id ? previous : item)); setUndo(null); tell("Archive undone."); }}>{uiText("Undo")}</button>}<button aria-label={uiText("Dismiss notice")} onClick={() => { setNotice(""); setUndo(null); }}><X size={13} /></button></>}</div>
    </div>
    <WorkspaceDialog open={picking} onClose={() => setPicking(false)} title={uiText("Choose a skill")} wide><div className="sk-dialog-body"><label className="sk-candidate-search"><Search size={15} /><input aria-label={uiText("Search discovered skills")} placeholder={uiText("Find a skill in this repository...")} value={candidateSearch} onChange={event => setCandidateSearch(event.target.value)} autoFocus /></label><div className="sk-catalog sk-candidate-list">{filteredCandidates.map(candidate => <div key={candidate.path}><FileCode2 size={18} /><div><h3>{uiText(candidate.name)}</h3><p>{uiText(candidate.description)}</p><code>{candidate.path}</code></div><button className="sk-secondary" disabled={busy} onClick={() => { setUrl(candidate.url); setPicking(false); void addSkill(candidate.url); }}>{uiText("Import skill")}<Plus size={13} /></button></div>)}</div>{!filteredCandidates.length && <p>{uiText("No matching skills.")}</p>}</div></WorkspaceDialog>
    <WorkspaceDialog open={transfer} onClose={() => { if (!busy) setTransfer(false); }} title={uiText("Deliver skills")} wide><div className="sk-dialog-body"><p>{uiText("Choose the instructions to include. Agent delivery is confirmed by a matching receipt.")}</p><div className="sk-delivery-list">{ready.map(skill => <label key={skill.id}><input type="checkbox" checked={selected.includes(skill.id)} onChange={event => setSelected(current => event.target.checked ? [...current, skill.id] : current.filter(id => id !== skill.id))} /><span>{skill.name}<small>{uiText(skill.target)} - {uiText(bytes(totalSkillBytes(skill)))}</small></span><Fingerprint size={14} /></label>)}</div><div className="sk-delivery-method"><h3><ArrowDownToLine size={15} />{uiText("Local AI / portable bundle")}</h3><p>{uiText("Includes SKILL.md, supporting files, source metadata, checksums and guardrails.")}</p><code>node scripts/skilled/install-bundle.mjs bundle.json --dir ./agent-skills</code><p>{uiText("Your agent must load SKILL.md and LOGIO.md to use them.")}</p><button type="button" className="sk-text-button" onClick={() => receiptFile.current?.click()}><FileCode2 size={13} />{uiText("Import installer receipt")}</button><input ref={receiptFile} type="file" accept=".json,application/json" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void importReceipt(file); event.target.value = ""; }} /><button className="sk-start" disabled={!chosen.length || busy} onClick={() => void deliver(false)}>{busy ? <Loader2 size={14} className="sk-spin" /> : <ArrowDownToLine size={14} />}{uiText("Export ")}{uiText(chosen.length)} {uiText(" skill")}{uiText(chosen.length !== 1 ? "s" : "")}</button></div><div className="sk-delivery-method"><h3><Send size={15} />{uiText("Connected AI agent")}</h3><label>{uiText("Agent ID")}<input placeholder={uiText("e.g. research-agent")} value={agent} maxLength={128} onChange={event => setAgent(event.target.value)} disabled={!backend.remote} /></label><p>{uiText(backend.remote ? uiText("A receipt confirms delivery, not model execution.") : uiText("Configure a workspace backend to enable agent delivery."))}</p><button className="sk-secondary" disabled={!backend.remote || !backend.command || !chosen.length || !agent.trim() || busy} onClick={() => void deliver(true)}>{uiText("Transfer & verify receipt")}<ArrowRight size={14} /></button></div></div></WorkspaceDialog>
  </div>;
}
