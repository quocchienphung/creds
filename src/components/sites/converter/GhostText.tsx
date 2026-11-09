"use client";

import { useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { AlertTriangle, Check } from "lucide-react";
import "./flip-tokens.css";
import "./ghost-text.css";

export type GhostStatus = "idle" | "loading" | "ready" | "error";
export interface GhostTextHandle { focus: () => void; acceptAll: () => void; acceptWord: () => void; dismiss: () => void; request: () => void; getState: () => { status: GhostStatus; suggestion: string; streaming: boolean } }
export interface GhostTextLabels { thinking: string; toAccept: string; tapToAccept: string; accepted: string; noSuggestion: string; retry: string; byModel: (name: string) => string; acceptSuggestion: string; retrySuggestion: string; hint: string; announceReady: (text: string) => string; announceAccepted: string; announceDismissed: string; announceFailed: string; word: string; escape: string }
const DEFAULT_LABELS: GhostTextLabels = { thinking: "Thinking", toAccept: "to accept", tapToAccept: "Tap to accept", accepted: "Accepted", noSuggestion: "No suggestion", retry: "Retry", byModel: name => `Autocomplete by ${name}`, acceptSuggestion: "Accept suggestion", retrySuggestion: "Retry suggestion",
  hint: "Suggestions appear when you pause. Tab accepts, Command or Control Right Arrow accepts one word, Escape dismisses.", announceReady: text => `Suggestion: ${text}. Press Tab to accept.`, announceAccepted: "Suggestion accepted.", announceDismissed: "Suggestion dismissed.", announceFailed: "Couldn't get a suggestion.", word: "word", escape: "Esc" };
export interface GhostTextProps {
  /** A continuation for the text before the caret: a string or a promise of one, an async iterable to stream it, or null (at once) to skip without a "Thinking" state. */
  suggest: (text: string, signal: AbortSignal) => string | null | Promise<string | null> | AsyncIterable<string>;
  value?: string; defaultValue?: string; onValueChange?: (value: string) => void;
  /** Milliseconds of pause before `suggest` is called. Every keystroke resets it. */
  delay?: number; minLength?: number; multiline?: boolean; variant?: "field" | "plain"; rows?: number; maxRows?: number;
  placeholder?: string; label?: ReactNode; footer?: ReactNode; model?: { name: string; mark?: ReactNode }; hint?: boolean;
  onAccept?: (accepted: string, mode: "all" | "word") => void; onDismiss?: (suggestion: string) => void; onStatusChange?: (status: GhostStatus) => void;
  /** The key that accepts the whole suggestion. Tab is the preview's; an app that keeps bare Tab for itself uses ArrowRight (at the end of the text). */
  acceptKey?: "Tab" | "ArrowRight";
  disabled?: boolean; name?: string; id?: string; autoFocus?: boolean; "aria-label"?: string; notice?: string; labels?: Partial<GhostTextLabels>; className?: string; ref?: Ref<GhostTextHandle>;
}

const EASE = [0.22, 1, 0.36, 1] as const;
const LINE = 22;
interface Piece { id: number; text: string; leaving?: boolean }
const isIterable = (value: unknown): value is AsyncIterable<string> => !!value && typeof (value as AsyncIterable<string>)[Symbol.asyncIterator] === "function";
/** What the Tab-less ways of accepting take: the next word of the ghost with the spaces before it. */
const nextWord = (ghost: string) => ghost.match(/^\s*\S+/)?.[0] ?? ghost;

/**
 * Inline autocomplete: muted ghost text continues the sentence right at the caret and Tab turns it solid in place; Cmd/Ctrl+Right takes one word,
 * Escape fades it away, a chip shows what is behind it. Rebuilt from the open preview of UIArc's Ghost text (a Pro component: DOM, declared CSS and
 * a recording of the rendered page's autoplay; docs/research/ghost-text/). The ghost lives in an aria-hidden mirror with the field's exact metrics
 * behind a native textarea, so typing stays native (spellcheck, IME, undo). It suggests only what `suggest` returns.
 */
export function GhostText(props: GhostTextProps) {
  const { suggest, delay = 450, minLength = 3, multiline = true, variant = "field", rows = 3, maxRows = 10, placeholder, label, footer, hint = true, disabled, className, acceptKey = "Tab" } = props;
  const model = props.model ?? { name: "Autocomplete" };
  const labels = useMemo<GhostTextLabels>(() => ({ ...DEFAULT_LABELS, ...props.labels }), [props.labels]);
  const reduce = useReducedMotion() ?? false;
  const uid = useId();
  const [inner, setInner] = useState(props.defaultValue ?? "");
  const value = props.value ?? inner;
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [status, setStatusRaw] = useState<GhostStatus>("idle");
  const [accepted, setAccepted] = useState(false);
  const [merge, setMerge] = useState<{ base: string; text: string } | null>(null);
  const [announce, setAnnounce] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [pressed, setPressed] = useState<"tab" | "word" | "esc" | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const control = useRef<AbortController | null>(null);
  const ids = useRef(0);
  const composing = useRef(false);
  const skip = useRef(false);
  const ghost = pieces.filter(p => !p.leaving).map(p => p.text).join("");
  const live = useRef({ value, ghost, status, suggest, props });
  useLayoutEffect(() => { live.current = { value, ghost, status, suggest, props }; });

  const setStatus = useCallback((next: GhostStatus) => { setStatusRaw(next); live.current.props.onStatusChange?.(next); }, []);
  const write = useCallback((next: string) => { if (live.current.props.value === undefined) setInner(next); live.current.props.onValueChange?.(next); }, []);
  const press = useCallback((key: "tab" | "word" | "esc") => { setPressed(key); setTimeout(() => setPressed(current => current === key ? null : current), 160); }, []);
  const clear = useCallback((fade: boolean) => {
    control.current?.abort(); control.current = null; setStreaming(false);
    setPieces(current => { if (!current.length) return current; return fade && !reduce ? current.map(p => ({ ...p, leaving: true })) : []; });
    if (fade && !reduce) setTimeout(() => setPieces(current => current.filter(p => !p.leaving)), 110);
    setStatus("idle");
  }, [reduce, setStatus]);

  const request = useCallback(async () => {
    const { value: text, suggest: ask } = live.current;
    control.current?.abort();
    const controller = new AbortController(); control.current = controller;
    const { signal } = controller;
    setAccepted(false);
    let result: ReturnType<typeof ask>;
    try { result = ask(text, signal); } catch { setStatus("error"); setAnnounce(labels.announceFailed); return; }
    if (result === null) { setStatus("idle"); return; }
    const put = (chunk: string) => { if (!chunk) return; const piece = { id: ++ids.current, text: chunk }; setPieces(current => [...current.filter(p => !p.leaving), piece]); setStatus("ready"); };
    try {
      if (typeof result === "string") { put(result.replace(/^\s+/, text === "" || /\s$/.test(text) ? "" : " ")); }
      else if (isIterable(result)) {
        setStatus("loading"); setStreaming(true); setPieces([]);
        let first = true;
        for await (const delta of result) { if (signal.aborted) return; put(first && /\s$/.test(text) ? delta.replace(/^\s+/, "") : delta); first = false; }
        if (signal.aborted) return;
        setStreaming(false);
      } else {
        setStatus("loading"); setPieces([]);
        const full = await result;
        if (signal.aborted) return;
        if (full === null) { setStatus("idle"); return; }
        put(/\s$/.test(text) ? full.replace(/^\s+/, "") : full);
      }
      if (signal.aborted) return;
      if (!live.current.ghost && !(typeof result === "string" && result)) { /* an empty answer is "no suggestion" without an error */ }
      setAnnounce(live.current.ghost ? labels.announceReady(live.current.ghost.trim()) : "");
    } catch { if (!signal.aborted) { setStreaming(false); setPieces([]); setStatus("error"); setAnnounce(labels.announceFailed); } }
    finally { if (control.current === controller && !signal.aborted) control.current = null; }
  }, [labels, setStatus]);

  // A pause after an edit asks for a suggestion, when the caret is at the end and the field is long enough.
  useEffect(() => {
    if (disabled || composing.current) return;
    if (skip.current) { skip.current = false; return; }
    if (value.trim().length < minLength) return;
    const timer = setTimeout(() => { const node = area.current; if (!node || document.activeElement !== node || node.selectionStart !== node.value.length || node.selectionEnd !== node.value.length) return; void request(); }, delay);
    return () => clearTimeout(timer);
  }, [value, delay, minLength, disabled, request]);
  useEffect(() => () => { control.current?.abort(); }, []);

  const commit = useCallback((text: string, mode: "all" | "word") => {
    const base = live.current.value;
    const remaining = live.current.ghost.slice(text.length);
    skip.current = true;
    write(base + text);
    live.current.props.onAccept?.(text, mode);
    if (!reduce) { setMerge({ base, text }); setTimeout(() => setMerge(null), 200); }
    if (mode === "all" || !remaining.trim()) { control.current?.abort(); control.current = null; setStreaming(false); setPieces([]); setStatus("idle"); setAccepted(true); setAnnounce(labels.announceAccepted); setTimeout(() => setAccepted(false), 1000); }
    else { setPieces(current => { let left = text.length; const out: Piece[] = []; for (const p of current) { if (p.leaving) { out.push(p); continue; } if (left >= p.text.length) { left -= p.text.length; continue; } out.push({ ...p, text: p.text.slice(left) }); left = 0; } return out; }); }
    requestAnimationFrame(() => { const node = area.current; if (node) { node.focus(); node.setSelectionRange(node.value.length, node.value.length); } });
  }, [labels.announceAccepted, reduce, setStatus, write]);
  const acceptAll = useCallback(() => { if (live.current.ghost) { press("tab"); commit(live.current.ghost, "all"); } }, [commit, press]);
  const acceptWord = useCallback(() => { if (live.current.ghost) { press("word"); commit(nextWord(live.current.ghost), "word"); } }, [commit, press]);
  const dismiss = useCallback(() => { const text = live.current.ghost; if (!text) return; press("esc"); live.current.props.onDismiss?.(text); setAnnounce(labels.announceDismissed); clear(true); }, [clear, labels.announceDismissed, press]);
  useImperativeHandle(props.ref, () => ({ focus: () => area.current?.focus(), acceptAll, acceptWord, dismiss, request: () => void request(), getState: () => ({ status: live.current.status, suggestion: live.current.ghost, streaming }) }), [acceptAll, acceptWord, dismiss, request, streaming]);

  const onInput = (raw: string) => {
    const next = multiline ? raw : raw.replace(/\r?\n/g, " ");
    const previous = live.current.value, typed = next.startsWith(previous) ? next.slice(previous.length) : "";
    if (live.current.ghost && typed && live.current.ghost.startsWith(typed)) {
      // the person typed what the ghost says: it is consumed in place, no new question
      skip.current = true;
      setPieces(current => { let left = typed.length; const out: Piece[] = []; for (const p of current) { if (left >= p.text.length && !p.leaving) { left -= p.text.length; continue; } out.push(!p.leaving && left ? { ...p, text: p.text.slice(left) } : p); left = 0; } return out; });
      if (!live.current.ghost.slice(typed.length)) { setStatus("idle"); }
    } else if (live.current.ghost || live.current.status !== "idle") clear(false);
    setAccepted(false);
    write(next);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const node = event.currentTarget, atEnd = node.selectionStart === node.value.length && node.selectionEnd === node.value.length;
    if (event.key === acceptKey && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && ghost && atEnd) { event.preventDefault(); acceptAll(); }
    else if (event.key === "ArrowRight" && (event.metaKey || event.ctrlKey || event.altKey) && !event.shiftKey && ghost && atEnd) { event.preventDefault(); acceptWord(); }
    else if (event.key === "Escape" && ghost) { event.preventDefault(); event.stopPropagation(); dismiss(); }
    else if (event.key === "Enter" && !multiline) event.preventDefault();
  };
  const onCaret = () => { const node = area.current; if (node && live.current.ghost && (node.selectionStart !== node.value.length || node.selectionEnd !== node.value.length)) clear(false); };

  // ---- the height follows the text, ghost included, on a 180 ms tween; the box is clipped while it grows
  const height = useMotionValue<number | "auto">("auto");
  const mirror = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(false);
  useEffect(() => {
    const node = mirror.current; if (!node || !multiline) return;
    const pad = (variant === "plain" ? 26 : 18) + (label ? -8 : 0);
    const observer = new ResizeObserver(() => {
      const natural = node.getBoundingClientRect().height, cap = maxRows * LINE + pad, next = Math.min(natural, cap);
      setScroll(natural > cap + 0.5);
      const from = height.get();
      if (reduce || from === "auto") height.set(next); else animate(height as ReturnType<typeof useMotionValue<number>>, next, { duration: 0.18, ease: EASE });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [height, maxRows, multiline, reduce, variant, label]);
  useLayoutEffect(() => { const node = viewport.current; if (!multiline && node) node.scrollLeft = node.scrollWidth; }, [value, ghost, multiline]);

  const key = status === "error" ? "error" : accepted ? "accepted" : status === "ready" && ghost ? "ready" : status === "loading" ? "loading" : "idle";
  const labelId = `${uid}-label`, hintId = `${uid}-hint`;
  const chipLabel = key === "ready" ? labels.acceptSuggestion : key === "error" ? labels.retrySuggestion : labels.byModel(model.name);
  const layer = (
    <span key={key} className="gt-chipLayer" ref={node => { if (node) setChipWidth(Math.ceil(node.getBoundingClientRect().width)); }}>
      <span className="gt-mark" aria-hidden="true" style={{ color: undefined }}>{model.mark}</span>
      {key === "idle" && <span className="gt-chipName">{model.name}</span>}
      {key === "loading" && <span className="gt-thinking">{labels.thinking}</span>}
      {key === "ready" && <><span className="gt-desk"><kbd className="gt-kbd" data-pressed={pressed === "tab" || undefined}>{acceptKey === "Tab" ? "Tab" : "→"}</kbd><span>{labels.toAccept}</span></span><span className="gt-touch">{labels.tapToAccept}</span></>}
      {key === "accepted" && <><Check className="gt-okIcon" aria-hidden="true" /><span>{labels.accepted}</span></>}
      {key === "error" && <><AlertTriangle className="gt-alertIcon" aria-hidden="true" /><span>{labels.noSuggestion}</span><span className="gt-retry">{labels.retry}</span></>}
    </span>
  );
  const [chipWidth, setChipWidth] = useState<number | undefined>(undefined);
  const chip = <motion.button type="button" className="gt-chip" data-state={key} tabIndex={key === "error" ? 0 : -1} aria-label={chipLabel} aria-disabled={key === "idle" || key === "loading" || key === "accepted" || undefined}
    initial={false} animate={{ width: chipWidth }} transition={reduce ? { duration: 0 } : { duration: 0.2, ease: EASE }}
    onMouseDown={event => event.preventDefault()} onClick={() => { if (key === "ready") acceptAll(); else if (key === "error") { area.current?.focus(); void request(); } }}>
    <span className="gt-chipStack"><AnimatePresence initial={false} mode="popLayout">{
      <motion.span key={key} style={{ display: "contents" }} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1, transition: { duration: reduce ? 0 : 0.16, ease: EASE } }} exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.1, ease: EASE } }}>{layer}</motion.span>
    }</AnimatePresence></span>
  </motion.button>;
  const keys = hint && <span className="gt-keys" aria-hidden="true">
    <AnimatePresence initial={false}>{key === "ready" && <motion.span key="keys" style={{ display: "inline-flex", gap: 10 }} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1, transition: { duration: reduce ? 0 : 0.16, ease: EASE } }} exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.1 } }}>
      <span><kbd className="gt-kbd" data-pressed={pressed === "word" || undefined}>⌘→</kbd>{labels.word}</span><span><kbd className="gt-kbd" data-pressed={pressed === "esc" || undefined}>{labels.escape}</kbd></span></motion.span>}</AnimatePresence></span>;
  const style = { "--gt-rows": multiline ? rows : 1, "--gt-max-rows": maxRows } as CSSProperties;
  return <div className={`gt-root${className ? ` ${className}` : ""}`} data-multiline={multiline} data-variant={variant} data-disabled={disabled || undefined} data-labelled={label ? "" : undefined} data-merging={merge ? "" : undefined} style={style}>
    {multiline && label && <div className="gt-label" id={labelId}>{label}</div>}
    <motion.div ref={viewport} className="gt-viewport" data-scroll={scroll} style={multiline ? { height } : undefined}>
      <div className="gt-stack">
        <div ref={mirror} className="gt-mirror" aria-hidden="true">
          {merge ? <>{merge.base}<span className="gt-merge">{merge.text}</span></> : value}
          {pieces.map(p => <span key={p.id} className={p.leaving ? "gt-ghostOut" : "gt-ghost"}>{p.text}</span>)}
          {"​"}
        </div>
        <textarea ref={area} className="gt-input" rows={1} value={value} placeholder={placeholder} disabled={disabled} name={props.name} id={props.id} autoFocus={props.autoFocus} spellCheck autoComplete="off" wrap={multiline ? "soft" : "off"}
          aria-label={props["aria-label"]} aria-labelledby={!props["aria-label"] && label ? labelId : undefined} aria-describedby={hint ? hintId : undefined}
          onChange={event => onInput(event.target.value)} onKeyDown={onKeyDown} onKeyUp={onCaret} onClick={onCaret} onSelect={onCaret} onBlur={() => { if (live.current.ghost || live.current.status === "loading") clear(false); }}
          onCompositionStart={() => { composing.current = true; clear(false); }} onCompositionEnd={() => { composing.current = false; }} />
      </div>
    </motion.div>
    <div className="gt-footer">{multiline && <div className="gt-footerStart">{footer}</div>}{keys}{chip}</div>
    {hint && <span id={hintId} className="fl-srOnly">{labels.hint}</span>}
    <span className="fl-srOnly" role="status" aria-live="polite" aria-atomic="true">{[announce, props.notice].filter(Boolean).join(" ")}</span>
  </div>;
}
