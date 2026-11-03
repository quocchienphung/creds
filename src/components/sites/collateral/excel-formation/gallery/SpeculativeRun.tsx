"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, CircleHelp, Pause, Play, RotateCcw, X } from "lucide-react";
import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import type { WordPrediction } from "../engine/predict";
import { simulate } from "../engine/speculative";
import { FLIGHT_SPRING, TIMING, shimmerAt, snapshotAt, timelineOf, type Snapshot, type StatusKind } from "../engine/run-timeline";
import { RollingNumber } from "./RollingNumber";
import "./speculative-run.css";

const MIN_DRAFT = 2, MAX_DRAFT = 8, DEFAULT_DRAFT = 4;
/** The comparison line writes one word per pass: first one 620 ms after the start, then every 640 ms (recorded on the preview). */
const BASE_FIRST = 620, BASE_STEP = 640;
const EASE_ENTER = [0.16, 1, 0.3, 1] as const;

/** Put a word where it came from (so it waits there during its delay), then let the fitted spring bring it home. */
function fly(token: HTMLElement, dx: number, dy: number, delay: number) {
  token.style.transform = `translate(${dx}px, ${dy}px)`;
  token.style.willChange = "transform";
  animate(token, { x: [dx, 0], y: [dy, 0] }, { ...FLIGHT_SPRING, delay }).then(() => { token.style.transform = ""; token.style.willChange = ""; });
}

/**
 * The replay of a guess-and-check over the words of one cell, after UIArc's Speculative decoding: a quick draft proposes a few words, the target
 * checks them all in one pass, accepted words fly into the answer, the first miss is struck through and the target writes its own. It plays the
 * real draft and target of the cell's words; it does not measure whether a word is right, only where the two agree. The table below still
 * decides: nothing here changes the value.
 */
/** `confirmed`: the card replays a correction a person has just approved (what the file had, what was written) instead of guessing one; it has no draft-length or compare controls. */
export type RunVariant = "suggest" | "confirmed";
export function SpeculativeRun({ predictions, picks, text, variant = "suggest", title, onClose: onDismiss }: { predictions: WordPrediction[]; picks: Record<number, string>; text: string; variant?: RunVariant; title?: string; onClose?: () => void }) {
  const confirmed = variant === "confirmed";
  const { t } = useWorkspaceI18n();
  const sliderId = useId();
  const [open, setOpen] = useState(true);
  const [draftLength, setDraftLength] = useState(confirmed ? MAX_DRAFT : DEFAULT_DRAFT);
  const [compare, setCompare] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const id = useId();
  const restart = () => setEpoch(value => value + 1);
  if (!open) return <section className="sdr" data-closed="" aria-label={t(title ?? "Guess and check")}><div className="sdr-header"><button type="button" className="sdr-title" aria-expanded="false" aria-controls={id} onClick={() => setOpen(true)}><ChevronDown size={14} aria-hidden="true" />{t(title ?? "Guess and check")}</button></div></section>;
  return <section className="sdr" id={id} data-variant={variant} aria-label={t(title ?? "Guess and check")}>
    <Replay key={`${text}\u0001${draftLength}\u0001${compare}\u0001${epoch}`} predictions={predictions} picks={picks} draftLength={draftLength} compare={compare}
      variant={variant} title={title} onRestart={restart} onClose={() => { if (onDismiss) onDismiss(); else setOpen(false); }} />
    {!confirmed && <div className="sdr-controls">
      <div className="sdr-sliderSlot">
        <div className="sdr-sliderHead"><label htmlFor={sliderId}>{t("Draft length")}</label><output htmlFor={sliderId}>{plural(t, draftLength, "{0} word", "{0} words")}</output></div>
        <input id={sliderId} className="sdr-slider" type="range" min={MIN_DRAFT} max={MAX_DRAFT} step={1} value={draftLength} aria-valuetext={plural(t, draftLength, "{0} word", "{0} words")} onChange={event => setDraftLength(Number(event.target.value))} />
      </div>
      <label className="sdr-switch"><button type="button" role="switch" aria-checked={compare} aria-label={t("Compare with one word at a time")} onClick={() => setCompare(value => !value)} /><span>{t("Compare with one word at a time")}</span></label>
    </div>}
  </section>;
}

type T = ReturnType<typeof useWorkspaceI18n>["t"];
const plural = (t: T, n: number, one: string, many: string, rest: (string | number)[] = []) => t(n === 1 ? one : many, [n, ...rest]);

function Replay({ predictions, picks, draftLength, compare, variant, title, onRestart, onClose }: {
  predictions: WordPrediction[]; picks: Record<number, string>; draftLength: number; compare: boolean; variant: RunVariant; title?: string;
  onRestart: () => void; onClose: () => void;
}) {
  const { t, locale } = useWorkspaceI18n();
  const confirmed = variant === "confirmed";
  const reduce = useReducedMotion() ?? false;
  const run = useMemo(() => simulate(predictions, draftLength), [predictions, draftLength]);
  const timeline = useMemo(() => timelineOf(run), [run]);
  const baseEnd = BASE_FIRST + (predictions.length - 1) * BASE_STEP;
  const startAt = reduce ? Math.max(timeline.doneAt, compare ? baseEnd : 0) + 1 : 0;
  const clock = useRef(startAt);
  const [playing, setPlaying] = useState(!reduce);
  const [snap, setSnap] = useState<Snapshot>(() => snapshotAt(run, timeline, startAt));
  const [baseLanded, setBaseLanded] = useState(() => reduce && compare ? predictions.length : 0);
  const columnsRef = useRef<HTMLDivElement>(null);
  const tokens = useRef(new Map<number, HTMLElement>());
  // What was last written to the screen, so a frame that changes nothing costs nothing: no state update, no style write.
  const shown = useRef({ key: snap.key, base: baseLanded, sweep: -1, labels: [] as HTMLElement[], paint: [] as number[] });
  const byIndex = useMemo(() => new Map(predictions.map(word => [word.index, word])), [predictions]);
  const source = useMemo(() => new Map(run.output.map(entry => [entry.index, entry.source])), [run]);
  const finished = snap.phase === "done" && (!compare || baseLanded >= predictions.length);

  // One frame loop for the whole replay. Pause stops it; Play carries on from the same elapsed time.
  useEffect(() => {
    if (!playing || reduce) return;
    let frame = 0, last = performance.now(), alive = true;
    const paint = (next: Snapshot, now: number) => {
      const columns = columnsRef.current, mem = shown.current;
      if (!columns) return;
      if (next.sweep !== mem.sweep) { mem.sweep = next.sweep; columns.style.setProperty("--sweep", String(next.sweep)); }
      const clockPass = timeline.passes[next.pass];
      if (!clockPass || next.phase === "done") return;
      // Only the chips still being checked shimmer; each is written when its band has moved at least a tenth of a percent.
      mem.labels.forEach((label, j) => {
        if (next.states[j]) return;
        const p = Math.round(shimmerAt(clockPass.appearAt[j], null, now) * 10) / 10;
        if (mem.paint[j] !== p) { mem.paint[j] = p; label.style.setProperty("--p", String(p)); }
      });
    };
    const tick = (nowFrame: number) => {
      if (!alive) return;
      clock.current += Math.min(64, nowFrame - last); last = nowFrame;
      const now = clock.current, next = snapshotAt(run, timeline, now), mem = shown.current;
      if (next.key !== mem.key) { mem.key = next.key; setSnap(next); }
      if (compare) { const landed = now < BASE_FIRST ? 0 : Math.min(predictions.length, 1 + Math.floor((now - BASE_FIRST) / BASE_STEP)); if (landed !== mem.base) { mem.base = landed; setBaseLanded(landed); } }
      paint(next, now);
      if (next.phase === "done" && (!compare || now >= baseEnd)) { setPlaying(false); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(frame); };
  }, [playing, reduce, run, timeline, compare, predictions.length, baseEnd]);

  useLayoutEffect(() => {
    const mem = shown.current;
    mem.labels = [...(columnsRef.current?.querySelectorAll<HTMLElement>(".sdr-shim__label") ?? [])];
    mem.paint = [];
  }, [snap.key]);

  // Words fly from their chip (or the target's cell) into the answer, 20 ms apart, with the spring fitted to the preview.
  const flown = useRef(reduce ? run.output.length : 0);
  useLayoutEffect(() => {
    const from = flown.current;
    flown.current = snap.landed;
    if (reduce || snap.landed <= from) return;
    // Read every position first, then write: one layout for the whole batch instead of one per word.
    const flights: { token: HTMLElement; dx: number; dy: number; delay: number }[] = [];
    for (let n = from; n < snap.landed; n++) {
      const entry = run.output[n];
      const token = entry && tokens.current.get(entry.index);
      const column = columnsRef.current?.querySelector<HTMLElement>(`[data-column="${entry?.index}"]`) ?? columnsRef.current?.lastElementChild as HTMLElement | null;
      const origin = column?.querySelector<HTMLElement>(entry?.source === "draft" ? ".sdr-chip" : ".sdr-cell") ?? column;
      if (!token || !origin) continue;
      const a = origin.getBoundingClientRect(), b = token.getBoundingClientRect();
      flights.push({ token, dx: a.left - b.left, dy: a.top - b.top, delay: (n - from) * TIMING.fly / 1000 });
    }
    for (const item of flights) fly(item.token, item.dx, item.dy, item.delay);
  }, [snap.landed, reduce, run.output]);
  // A word the person chooses in the table flies from the chosen chip into its place in the answer.
  const previousPicks = useRef(picks);
  useLayoutEffect(() => {
    const before = previousPicks.current;
    previousPicks.current = picks;
    if (reduce) return;
    const root = columnsRef.current?.closest(".sd-card") ?? document;
    for (const key of Object.keys(picks)) {
      const index = Number(key);
      if (before[index] === picks[index]) continue;
      const token = tokens.current.get(index), chip = root.querySelector<HTMLElement>(`[data-pick-chip="${index}"][aria-pressed="true"]`);
      const position = run.output.findIndex(entry => entry.index === index);
      if (!token || !chip || position < 0 || position >= snap.landed) continue;
      const a = chip.getBoundingClientRect(), b = token.getBoundingClientRect();
      fly(token, a.left - b.left, a.top - b.top, 0);
    }
  }, [picks, reduce, run.output, snap.landed]);

  const pass = run.passes[Math.min(snap.pass, Math.max(0, run.passes.length - 1))];
  const statusText = (status: StatusKind): string => {
    const columns = pass?.columns.length ?? 0;
    if (confirmed) {
      const fixed = predictions.filter(word => word.broken).length;
      if (status === "done") return plural(t, fixed, "Applied: {0} word fixed", "Applied: {0} words fixed", [predictions.length - fixed]);
      if (status === "draft") return plural(t, columns, "The file has {0} word here", "The file has {0} words here");
      if (status === "verify") return t("Checking each word against your fix");
      if (status === "rejected") return t("A word changed: your fix is written in its place");
      if (status === "accepted") return t("Every word already matched");
      return t("Getting ready…");
    }
    if (status === "done") return plural(t, run.stats.passes, "Done in {0} pass", "Done in {0} passes");
    if (status === "draft") return plural(t, columns, "Draft proposes {0} word", "Draft proposes {0} words");
    if (status === "verify") return t("Target checks all {0} in one pass", [columns]);
    if (status === "rejected") return t("First guess rejected, target writes its own");
    if (status === "accepted") return t("All {0} guesses accepted", [columns]);
    return t("Getting ready…");
  };
  const status = statusText(snap.status);
  const number = (value: number) => new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US").format(value);

  // Numbers that roll up as passes settle.
  let drafted = 0, accepted = 0;
  for (const settled of run.passes.slice(0, snap.passesDone)) { drafted += settled.columns.length; accepted += settled.accepted; }
  const acceptedPercent = drafted ? Math.round(accepted / drafted * 100) : null;
  const perCheck = snap.passesDone ? snap.landed / snap.passesDone : null;

  const tokenOf = (word: WordPrediction) => {
    const origin = source.get(word.index) ?? "target";
    const pick = picks[word.index];
    if (pick !== undefined) return { text: pick, origin: "you" as const, unsure: false };
    if (!word.broken) return { text: word.text, origin, unsure: false };
    if (word.confident && word.target) return { text: word.target, origin, unsure: false };
    return { text: word.text, origin, unsure: true };
  };
  const landedAt = (index: number) => { const position = run.output.findIndex(entry => entry.index === index); return position >= 0 && position < snap.landed; };
  const columnIcon = (state: string | null, word: WordPrediction | undefined) => state === "accepted" ? (word?.broken && !word.confident ? <CircleHelp size={13} className="sdr-unsureIcon" aria-hidden="true" /> : <Check size={13} className="sdr-hitIcon" aria-hidden="true" />) : state === "rejected" ? <X size={13} className="sdr-missIcon" aria-hidden="true" /> : null;

  const restartNow = () => { onRestart(); };
  const toggle = () => { if (finished) restartNow(); else setPlaying(value => !value); };
  const showPause = playing && !finished;

  return <>
    <div className="sdr-header">
      <div className="sdr-heading">
        <button type="button" className="sdr-title" aria-expanded="true" onClick={onClose}><ChevronDown size={14} aria-hidden="true" />{t(title ?? "Guess and check")}</button>
        <p className="sdr-status" role="status"><span className="sdr-swap"><AnimatePresence initial={false}>
          <motion.span key={status} initial={reduce ? false : { opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transition: { duration: 0.1, ease: "easeOut" } }} transition={{ duration: reduce ? 0 : 0.16, ease: EASE_ENTER }}>
            {snap.status === "done" && <Check size={14} className="sdr-statusCheck" aria-hidden="true" />}{status}
          </motion.span>
        </AnimatePresence></span></p>
      </div>
      <div className="sdr-actions">
        <button type="button" className="sdr-iconButton" aria-label={showPause ? t("Pause") : t("Play")} onClick={toggle}>
          <span className="sdr-iconStack" aria-hidden="true"><Pause size={15} strokeWidth={1.75} data-on={showPause || undefined} /><Play size={15} strokeWidth={1.75} data-on={!showPause || undefined} /></span>
        </button>
        <button type="button" className="sdr-iconButton" aria-label={t("Restart")} onClick={restartNow}><RotateCcw size={15} strokeWidth={1.75} aria-hidden="true" /></button>
      </div>
    </div>

    <div className="sdr-lanes">
      <div className="sdr-laneLabels" aria-hidden="true">
        <div className="sdr-laneLabel" data-lane="draft"><span className="sdr-laneDot" /><span className="sdr-laneText"><span className="sdr-laneName">{t(confirmed ? "In the file" : "Draft")}</span><span className="sdr-laneDetail">{t(confirmed ? "Before your fix" : "Frequency, fast")}</span></span></div>
        <div className="sdr-laneLabel" data-lane="target"><span className="sdr-laneDot" /><span className="sdr-laneText"><span className="sdr-laneName">{t(confirmed ? "Confirmed" : "Target")}</span><span className="sdr-laneDetail">{t(confirmed ? "What you approved" : "Context, careful")}</span></span></div>
      </div>
      <div className="sdr-track">
        {snap.phase === "done"
          ? <div className="sdr-summary" key="summary"><span className="sdr-summaryRow">{confirmed ? t("{0} of {1} words stayed as they were", [predictions.filter(word => !word.broken).length, predictions.length]) : t("{0} words drafted, {1} agreed", [run.passes.reduce((sum, item) => sum + item.columns.length, 0), run.stats.accepted])}</span><span className="sdr-summaryRow">{confirmed ? plural(t, predictions.filter(word => word.broken).length, "{0} word replaced by your fix", "{0} words replaced by your fix") : plural(t, run.stats.passes, "{0} check for {1} words", "{0} checks for {1} words", [run.stats.words])}</span></div>
          : <div className="sdr-columns" key="columns" ref={columnsRef} data-phase={snap.phase} aria-hidden="true" style={{ "--sweep": snap.sweep } as React.CSSProperties}>
            {pass?.columns.slice(0, snap.visible).map((column, j) => {
              const state = snap.states[j] ?? null;
              return <div className="sdr-column" key={`${snap.pass}-${column.index}`} data-column={column.index} data-state={state ?? undefined} data-leaving={snap.leaving || undefined} style={{ "--j": j } as React.CSSProperties}>
                <span className="sdr-chip"><span className="sdr-chipText"><span className="sdr-shim" data-state={state ? "idle" : "active"}><span className="sdr-shim__label">{column.draft || "?"}</span></span></span><span className="sdr-strike" aria-hidden="true" /></span>
                <span className="sdr-cell"><span className="sdr-fill" /><span className="sdr-cellContent" data-on={state ? true : undefined}>{columnIcon(state, byIndex.get(column.index))}<span className="sdr-targetText">{state === "discarded" ? "" : column.target}</span></span></span>
              </div>;
            })}
          </div>}
      </div>
    </div>

    <div className="sdr-outputs">
      <div className="sdr-line">
        <div className="sdr-lineLabel"><span className="sdr-lineName">{t(confirmed ? "Result" : "Output")}</span><span className="sdr-lineMeta">{snap.phase === "done" && <Check size={12} className="sdr-metaCheck" aria-hidden="true" />}{plural(t, snap.passesDone, "{0} pass", "{0} passes")}</span></div>
        <p className="sdr-lineText" aria-live="polite">
          {predictions.map(word => {
            const token = tokenOf(word), on = landedAt(word.index);
            const jump = word.broken;
            return <span className="sdr-word" key={word.index}><span ref={node => { if (node) tokens.current.set(word.index, node); else tokens.current.delete(word.index); }} className="sdr-tok" data-word={jump ? word.index : undefined} data-jump={jump || undefined}
              data-on={on || undefined} data-origin={token.origin} data-unsure={token.unsure || undefined} tabIndex={jump ? 0 : undefined} role={jump ? "button" : undefined}
              aria-label={jump ? `${token.text}: ${token.unsure ? t("Needs your choice") : t("Chosen")}` : undefined}>{token.text}</span>{" "}</span>;
          })}
        </p>
      </div>
      <AnimatePresence>
        {compare && <motion.div className="sdr-baselineWrap" key="base" initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={reduce ? undefined : { height: 0, opacity: 0 }}
          transition={reduce ? { duration: 0 } : { height: FLIGHT_SPRING, opacity: { duration: 0.16, ease: EASE_ENTER, delay: 0.15 } }}>
          <div className="sdr-line" data-line="base">
            <div className="sdr-lineLabel"><span className="sdr-lineName">{t("One word at a time")}</span><span className="sdr-lineMeta">{plural(t, baseLanded, "{0} pass", "{0} passes")}</span></div>
            <p className="sdr-lineText" aria-hidden="true">{predictions.map((word, i) => <span className="sdr-word" key={word.index}><span className="sdr-tok" data-on={i < baseLanded || undefined} data-origin="target">{word.broken ? (word.confident && word.target ? word.target : word.text) : word.text}</span>{" "}</span>)}</p>
          </div>
        </motion.div>}
      </AnimatePresence>
    </div>

    <div className="sdr-footer">
      <dl className="sdr-stats">
        <div className="sdr-stat"><dt className="sdr-statLabel">{t(confirmed ? "Checks" : "Checks made")}</dt><dd className="sdr-statValue"><RollingNumber value={snap.passesDone ? snap.passesDone : null} intDigits={2} label={plural(t, snap.passesDone, "{0} check", "{0} checks")} /></dd></div>
        <div className="sdr-stat"><dt className="sdr-statLabel">{t(confirmed ? "Words kept" : "Drafts accepted")}</dt><dd className="sdr-statValue"><RollingNumber value={acceptedPercent} intDigits={3} suffix="%" label={t("{0} percent", [acceptedPercent ?? 0])} /></dd></div>
        <div className="sdr-stat"><dt className="sdr-statLabel">{t("Words per check")}</dt><dd className="sdr-statValue"><RollingNumber value={perCheck} decimals={1} intDigits={2} label={number(perCheck ?? 0)} /></dd></div>
      </dl>
      <p className="sdr-note">{confirmed ? t("This replays the change you approved: words the file already had right stay, the others are replaced by your fix. You can undo it.") : t("These numbers describe the replay: how often the quick guess matched the careful check. They do not say whether a word is right; the table and your approval do.")}</p>
    </div>
  </>;
}
