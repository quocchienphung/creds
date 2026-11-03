"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowRight, Check, ChevronUp, FileSpreadsheet, RotateCcw, X } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import type { CollateralEngine } from "../../useCollateralEngine";
import type { OpenResult, SheetWindow } from "../../engine/protocol";
import { COLLAPSE_FRAMES, EXPAND_FRAMES, unfurlFrame, type UnfurlFrame } from "./import-motion";
import { useImportCopy } from "./import-copy";

export function WorkbookUnfurl({ engine, error, onReplace, onReview }: {
  engine: CollateralEngine; error?: string; onReplace: () => void; onReview: () => void;
}) {
  const { t, locale } = useWorkspaceI18n();
  const copy = useImportCopy();
  const reduce = useReducedMotion();
  const [expanded, setExpanded] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLButtonElement>(null);
  const lane = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  const plate = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const repaint = useRef<((frame: UnfurlFrame) => void) | null>(null);
  const currentFrame = useRef(unfurlFrame(Infinity, false));
  const drag = useRef<{ y: number; time: number; delta: number } | null>(null);
  const [settle, setSettle] = useState(0);
  const [snapshot, setSnapshot] = useState<{ result: OpenResult; sheet: SheetWindow } | null>(null);
  const result = engine.result, sheetWindow = engine.sheetWindow;
  const cardId = useId();
  const scanning = engine.phase === "scanning", ready = engine.phase === "ready";
  const shown = expanded && !scanning;
  const sheets = engine.result?.profile.sheets ?? [];
  const preview = snapshot?.result === engine.result ? snapshot?.sheet : null;
  const number = (n: number) => n.toLocaleString(locale === "vi" ? "vi-VN" : "en-US");
  const size = engine.fileSize < 1048576 ? `${number(Math.max(1, Math.round(engine.fileSize / 1024)))} KB` : `${(engine.fileSize / 1048576).toFixed(1)} MB`;
  const progress = Math.round(Math.max(0, Math.min(100, engine.progress.phase === "read" ? engine.progress.fraction * 45 : 45 + engine.progress.fraction * 55)));
  const status = scanning ? t(engine.progress.phase === "read" ? "Reading the workbook…" : "Checking every cell…") : ready ? copy("ready") : copy("failed");

  useLayoutEffect(() => { chip.current?.focus({ preventScroll: true }); }, []);

  useEffect(() => {
    const primary = result?.profile.sheets.find(sheet => sheet.name === result.profile.primary);
    if (!ready || !result || !primary) return;
    let active = true;
    // Existing local worker API, never a remote file/URL resolver. A late result is ignored.
    void sheetWindow((primary.headerRow ?? 1) + 1, primary.headers[0]?.col ?? 0)
      .then(sheet => { if (active && sheet) setSnapshot({ result, sheet }); })
      .catch(() => { /* The verified worksheet inventory remains available without a cell preview. */ });
    return () => { active = false; };
  }, [ready, result, sheetWindow]);

  useLayoutEffect(() => {
    const elements = { chip: chip.current, lane: lane.current, card: card.current, plate: plate.current, body: body.current };
    if (!elements.chip || !elements.lane || !elements.card || !elements.plate || !elements.body) return;
    const c = elements.chip, l = elements.lane, a = elements.card, p = elements.plate, b = elements.body;
    let raf = 0, start = 0, last = currentFrame.current, visible = true;
    const from = currentFrame.current;
    const duration = (shown ? EXPAND_FRAMES : COLLAPSE_FRAMES).at(-1)!.t;
    function paint(frame: UnfurlFrame) {
      last = frame;
      currentFrame.current = frame;
      // Read layout first. Clip/plate share the exact chip rectangle and favicon origin.
      const cr = c.getBoundingClientRect(), lr = l.getBoundingClientRect();
      const w = a.offsetWidth, h = a.offsetHeight, cw = Math.min(cr.width, w - 20), ch = cr.height;
      const left = 10 * (1 - frame.width), top = 10 * (1 - frame.height);
      const x = (cr.left - lr.left - 10) * (1 - frame.width), y = (cr.top - lr.top - 10) * (1 - frame.height);
      const radius = 13 + 5 * frame.radius;
      const present = frame.height > 0.0001 || shown;
      a.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      a.style.clipPath = `inset(${top}px ${(w - cw - 10) * (1 - frame.width)}px ${(h - ch - 10) * (1 - frame.height)}px ${left}px round ${radius}px)`;
      a.style.visibility = present ? "visible" : "hidden";
      l.style.height = `${(h + 10) * frame.height}px`;
      p.style.transform = `translate3d(${x + left}px, ${y + top}px, 0)`;
      p.style.width = `${cw + (w - cw) * frame.width}px`;
      p.style.height = `${ch + (h - ch) * frame.height}px`;
      p.style.borderRadius = `${radius}px`;
      p.style.opacity = String(frame.opacity);
      p.style.setProperty("--import-lift", String(frame.lift));
      b.style.opacity = String(frame.body);
    }
    function animate(now: number) {
      if (drag.current) return;
      if (!start) start = now;
      const frame = unfurlFrame(now - start, shown);
      const blend = (key: "width" | "height" | "body" | "radius" | "opacity") => shown ? from[key] + (1 - from[key]) * frame[key] : from[key] * frame[key];
      paint({ ...frame, width: blend("width"), height: blend("height"), body: blend("body"), radius: blend("radius"), opacity: blend("opacity") });
      if (now - start < duration) raf = requestAnimationFrame(animate);
    }
    function land() { cancelAnimationFrame(raf); paint(unfurlFrame(Infinity, shown)); }
    function visibility() {
      root.current?.toggleAttribute("data-paused", document.hidden || !visible);
      if (document.hidden || !visible) land();
    }
    repaint.current = paint;
    const resize = new ResizeObserver(() => paint(last));
    resize.observe(a); resize.observe(c);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; visibility(); });
    if (root.current) intersection.observe(root.current);
    document.addEventListener("visibilitychange", visibility);
    if (reduce || scanning || document.hidden) land();
    else { paint(unfurlFrame(0, shown)); raf = requestAnimationFrame(animate); }
    return () => { cancelAnimationFrame(raf); resize.disconnect(); intersection.disconnect(); document.removeEventListener("visibilitychange", visibility); repaint.current = null; };
  }, [shown, scanning, reduce, engine.result, error, settle]);

  function toggle() {
    if (scanning) return;
    if (shown) chip.current?.focus({ preventScroll: true });
    setExpanded(!expanded);
  }
  function dragStart(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    drag.current = { y: event.clientY, time: event.timeStamp, delta: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function dragMove(event: PointerEvent<HTMLElement>) {
    if (!drag.current) return;
    drag.current.delta = Math.max(0, drag.current.y - event.clientY);
    const progress = Math.min(1, drag.current.delta / Math.max(1, card.current?.offsetHeight ?? 1));
    repaint.current?.({ t: 0, width: Math.sqrt(1 - progress), height: 1 - progress, body: Math.max(0, 1 - progress * 2), radius: 1 - progress, lift: 0, opacity: 1 });
  }
  function dragEnd(event: PointerEvent<HTMLElement>, cancelled = false) {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (!cancelled && (d.delta > (card.current?.offsetHeight ?? 1) * 0.4 || d.delta > 24 && d.delta / Math.max(1, event.timeStamp - d.time) > 0.45)) {
      chip.current?.focus({ preventScroll: true }); setExpanded(false);
    } else setSettle(value => value + 1);
  }

  return <div className="import-unfurl" ref={root} data-scanning={scanning || undefined} data-interaction-own>
    <div className="import-unfurl__composer">
      <div className="import-unfurl__selected"><span>{copy("selected")}</span>
        <button type="button" ref={chip} className="import-unfurl__chip" onClick={toggle} aria-expanded={shown} aria-controls={cardId} aria-label={`${shown ? copy("collapse") : copy("expand")}: ${engine.fileName}`} title={engine.fileName}>
          <FileSpreadsheet size={16} aria-hidden="true" /><span>{engine.fileName}</span>
        </button>
      </div>
      <div className="import-unfurl__lane" ref={lane}>
        <div className="import-unfurl__plate" ref={plate} aria-hidden="true" />
        <article id={cardId} ref={card} className="import-unfurl__card" aria-label={copy("preview")} aria-hidden={!shown} inert={!shown}>
          <header className="import-unfurl__head" onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={event => dragEnd(event, true)}>
            <FileSpreadsheet size={16} aria-hidden="true" /><span>{ready ? "XLSX" : copy("failed")}</span>
            <button type="button" onClick={toggle} aria-label={copy("collapse")}><ChevronUp size={16} /></button>
            <button type="button" onClick={engine.close} aria-label={copy("remove")}><X size={16} /></button>
          </header>
          <div className="import-unfurl__body" ref={body}>
            <h2>{engine.fileName}</h2><p className="import-unfurl__description">{size}{ready && <> · {number(sheets.length)} {t("Worksheets")} · {number(sheets.reduce((sum, sheet) => sum + sheet.dataRows, 0))} {t("Data rows")}</>}</p>
            {error ? <p className="import-unfurl__error" role="alert">{t(error)}</p> : ready ? <div className="import-unfurl__media" role="region" aria-label={t("Worksheets")} tabIndex={0}>
              {preview && <div className="import-unfurl__grid"><table aria-label={preview.sheet}><thead><tr><th scope="col" aria-label={t("Row")}>#</th>{preview.columns.slice(0, 4).map(column => <th scope="col" key={column.col}>{column.letter}</th>)}</tr></thead><tbody>{preview.rows.slice(0, 5).map(row => <tr key={row.r} data-header={row.header || undefined}><th scope="row">{row.r}</th>{row.values.slice(0, 4).map((value, i) => <td key={i} title={value}>{value}</td>)}</tr>)}</tbody></table></div>}
              {sheets.map(sheet => <div className="import-unfurl__sheet" key={sheet.name}><div><FileSpreadsheet size={14} aria-hidden="true" /><b>{sheet.name}</b><span>{number(sheet.dataRows)} {t("Data rows")}</span></div>
                <p><span>{copy("detected")}: </span>{sheet.headers.length ? sheet.headers.slice(0, 5).map(h => h.text).join(" · ") + (sheet.headers.length > 5 ? " …" : "") : copy("noColumns")}</p>
              </div>)}
            </div> : <p>{copy("reading")}</p>}
          </div>
        </article>
      </div>
      <div className="import-unfurl__toolbar"><button type="button" className="import-unfurl__replace" onClick={onReplace} disabled={scanning}>{copy("replace")}</button>
        {scanning ? <button type="button" className="import-unfurl__action" onClick={engine.close}><X size={15} /><span>{t("Cancel")}</span></button>
          : ready ? <button type="button" className="import-unfurl__action" data-primary onClick={onReview}><span>{t("See what was found")}</span><ArrowRight size={16} /></button>
            : <button type="button" className="import-unfurl__action" onClick={engine.retry}><RotateCcw size={15} /><span>{t("Retry")}</span></button>}
      </div>
    </div>
    <div className="import-unfurl__status" role="status" aria-live="polite" aria-atomic="true">{ready && <Check size={14} aria-hidden="true" />}<span>{status}</span>{scanning && <span>{progress}%</span>}</div>
    {scanning && <progress className="import-unfurl__progress" max={100} value={progress} aria-label={status} />}
  </div>;
}
