"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useEffectEvent, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useReducedMotion, type Variants } from "motion/react";
import { Download, FileUp, Lock } from "lucide-react";
import { StorageDropzone } from "../storage/StorageDropzone";
import { SectionHeader, FileChip } from "../collateral/shell";
import { downloadBlob } from "../collateral/download";
import { LIMITS } from "../collateral/excel-formation/engine/limits.ts";
import { Skeleton } from "../shimmer-loader/Shimmer";
import { motionTokens } from "../uiarc/motion-tokens";
import SegmentedControl from "../uiarc/segmented-control/SegmentedControl";
import { FloatingButtonGroup } from "../uiarc/floating-button-group/FloatingButtonGroup";
import { ChevronIcon } from "../uiarc/icon-morph/IconMorph";
import { csvField, fileNameOf, ghostOf, suggestName, type Delimiter } from "./convert.ts";
import { useConverter, type Converted } from "./useConverter";
import "../affectui-settings/settings-reference.css";
import "../affectui-settings/settings-overrides.css";
import "../storage/storage-dropzone.css";
import "../collateral/collateral.css";
import "./converter.css";

const enter = [...motionTokens.ease.enter] as [number, number, number, number];
const GLYPH: Record<Delimiter, string> = { ",": ",", ";": ";", "\t": "→" };
const bytesText = (n: number) => n < 1024 ? `${Math.round(n)} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
const timeText = (ms: number) => ms < 1000 ? `${Math.max(1, Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`;

/** Converter: open a workbook, pick a worksheet, watch it become CSV, download. Everything runs in a worker on this device. */
export function Converter({ notify }: { workspaceId: string; notify: (message: string) => void }) {
  const { t } = useWorkspaceI18n();
  const converter = useConverter();
  const { phase, file, error } = converter;
  const receive = (files: File[]) => { const picked = files.find(item => /\.xlsx$/i.test(item.name)) ?? files[0]; if (picked) void converter.open(picked); };
  return <div className="ui-sb collateral cv">
    <SectionHeader trail={["Converter", "Excel to CSV"]} title="Converter" file={file ? <FileChip name={file.name} detail={bytesText(file.size)} onClose={converter.close} /> : undefined} />
    <div className="ui-sb__body">
      <AnimatePresence mode="wait" initial={false}>
        {phase === "idle" && <Stage key="idle">
          <div className="cv-intro"><h2>{t("Turn a workbook into a CSV file")}</h2><p>{t("Drop an .xlsx file, pick a worksheet, check the preview, then download. Nothing leaves this device.")}</p></div>
          {error && <div className="cr-alert" role="alert"><span>{t(error)}</span><button type="button" className="ui-button" data-variant="ghost" data-size="sm" onClick={converter.dismissError}><span className="ui-button__label">{t("Dismiss")}</span></button></div>}
          <StorageDropzone entries={[]} multiple={false} accept=".xlsx" badges={["XLSX", "CSV"]} inputLabel="Choose an Excel workbook" hint={t("Excel .xlsx up to {0} MB", [LIMITS.fileBytes / 1048576])} onFiles={receive} />
          <p className="cr-local"><Lock size={13} aria-hidden="true" /> {t("Processed on this device")}</p>
        </Stage>}
        {phase === "reading" && file && <Stage key="reading"><Reading name={file.name} fraction={converter.reading} /></Stage>}
        {phase === "ready" && file && <Stage key="ready"><Ready key={file.name} converter={converter} fileName={file.name} notify={notify} /></Stage>}
      </AnimatePresence>
    </div>
  </div>;
}

function Stage({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return <motion.div className="cv-stage" initial={{ opacity: 0, y: reduce ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduce ? 0 : -4 }} transition={{ duration: reduce ? 0 : .2, ease: enter }}>{children}</motion.div>;
}

/** The real fraction the reader reports: the bar is only as full as the work done. */
function Reading({ name, fraction }: { name: string; fraction: number }) {
  const { t, locale } = useWorkspaceI18n();
  const percent = Math.round(fraction * 100);
  return <div className="cv-card cv-reading" role="status" aria-live="polite">
    <p className="cv-reading__name" title={name}>{name}</p>
    <div className="cv-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={t("Reading workbook")}><motion.span style={{ transformOrigin: "left" }} animate={{ scaleX: Math.max(.03, fraction) }} transition={motionTokens.spring.smooth} /></div>
    <p className="cv-muted">{t("Reading workbook… {0}%", [percent.toLocaleString(locale === "vi" ? "vi-VN" : "en-US")])}</p>
  </div>;
}

const group: Variants = { hidden: {}, show: { transition: { staggerChildren: .07 } } };

function Ready({ converter, fileName, notify }: { converter: ReturnType<typeof useConverter>; fileName: string; notify: (message: string) => void }) {
  const { t } = useWorkspaceI18n();
  const reduce = useReducedMotion();
  const { sheets, options, result, converting, error } = converter;
  const [typed, setTyped] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const suggestion = suggestName(fileName, options.sheet, sheets.length > 1);
  const name = fileNameOf(typed || suggestion);
  const canDownload = !!result && result.rows > 0 && !!name && !converting;
  const block: Variants = { hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 14, filter: "blur(4px)" }, show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: reduce ? .01 : .52, ease: enter } } };

  function download() {
    if (!canDownload || !result || !name) return;
    downloadBlob(name, result.blob);
    setDownloaded(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDownloaded(false), 1800);
    notify(t("Downloaded {0}", [name]));
  }

  return <motion.div className="cv-ready" variants={group} initial="hidden" animate="show">
    <motion.section className="cv-card cv-options" variants={block} aria-label={t("Output")}>
      <div className="cv-field cv-field--wide"><span className="cv-label">{t("Worksheet")}</span>
        <div data-interaction-own><SegmentedControl label={t("Worksheet")} value={options.sheet} onValueChange={sheet => converter.change({ sheet })} options={sheets.map(sheet => ({ value: sheet.name, label: sheet.hidden ? t("{0} (hidden)", [sheet.name]) : sheet.name }))} /></div></div>
      <div className="cv-field"><span className="cv-label">{t("Delimiter")}</span>
        <div data-interaction-own><SegmentedControl label={t("Delimiter")} value={options.delimiter} onValueChange={delimiter => converter.change({ delimiter: delimiter as Delimiter })} options={[{ value: ",", label: t("Comma") }, { value: ";", label: t("Semicolon") }, { value: "\t", label: t("Tab") }]} /></div></div>
      <div className="cv-field"><span className="cv-label" id="cv-bom">{t("Encoding")}</span>
        <label className="cr-switch-row cv-switch"><button type="button" role="switch" className="cr-switch" aria-labelledby="cv-bom" aria-checked={options.bom} onClick={() => converter.change({ bom: !options.bom })}><span className="cr-switch__thumb" /></button><span>{t("UTF-8 with BOM")}<small>{t("Lets Excel show accented text correctly.")}</small></span></label></div>
      <NameField typed={typed} suggestion={suggestion} valid={!!name} onChange={setTyped} />
    </motion.section>
    <motion.div variants={block}><Stats result={result} converting={converting} bom={options.bom} /></motion.div>
    {error && <motion.div className="cr-alert" role="alert" variants={block}><span>{t(error)}</span></motion.div>}
    <motion.div variants={block}><Preview key={`${fileName}\u0001${options.sheet}`} result={result} converting={converting} delimiter={options.delimiter} /></motion.div>
    <motion.div className="cv-tray" initial={reduce ? false : { opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={reduce ? { duration: 0 } : { ...motionTokens.spring.smooth, delay: .45 }} data-interaction-own>
      <FloatingButtonGroup variant="floating" label={t("Converter actions")} items={[
        { id: "another", label: t("Another file"), icon: <FileUp />, onSelect: converter.close },
        { type: "separator" },
        { id: "download", label: downloaded ? t("Downloaded") : t("Download CSV"), reserveLabels: [t("Download CSV"), t("Downloaded")], icon: <Download />, primary: true, disabled: !canDownload, onSelect: download },
      ]} />
    </motion.div>
  </motion.div>;
}

/**
 * The file name with a quiet completion at the caret: the suggestion (workbook name, plus the sheet's when there are several) continues what is
 * typed. The right arrow at the end takes it, Escape fades it (bare Tab is the workspace's own shortcut for the page switcher, so it is not used here). Left empty, the suggested name is what is saved. It is a prefix match on our own text, not a model.
 */
function NameField({ typed, suggestion, valid, onChange }: { typed: string; suggestion: string; valid: boolean; onChange: (value: string) => void }) {
  const { t } = useWorkspaceI18n();
  const id = useId(), input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false), [atEnd, setAtEnd] = useState(true), [fits, setFits] = useState(true), [dismissed, setDismissed] = useState<string | null>(null);
  // shortcut: the completion is hidden once the typed name outgrows the box (it does not scroll with the input), upgrade by mirroring scrollLeft.
  useLayoutEffect(() => { const el = input.current; if (el) setFits(el.scrollWidth <= el.clientWidth); }, [typed, suggestion]);
  const ghost = ghostOf(typed, suggestion);
  const visible = !!ghost && fits && dismissed !== typed && (typed === "" || (focused && atEnd));
  const offersTab = visible && typed !== "";
  const caret = () => { const el = input.current; setAtEnd(!!el && el.selectionStart === el.value.length && el.selectionEnd === el.value.length); };
  function key(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowRight" && !event.shiftKey && !event.metaKey && !event.altKey && !event.ctrlKey && offersTab) { event.preventDefault(); onChange(typed + ghost); }
    else if (event.key === "Escape" && offersTab) { event.preventDefault(); event.stopPropagation(); setDismissed(typed); }
  }
  return <div className="cv-field cv-field--wide cv-name" data-invalid={!valid || undefined}>
    <label className="cv-label" htmlFor={id}>{t("File name")}</label>
    <div className="cv-name__box">
      <span className="cv-name__mirror" aria-hidden="true"><span className="cv-name__typed">{typed}</span>
        <AnimatePresence initial={false}>{visible && <motion.span className="cv-name__ghost" key="ghost" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: motionTokens.duration.fast }}>{ghost}</motion.span>}</AnimatePresence></span>
      <input ref={input} id={id} className="cv-name__input" value={typed} spellCheck={false} autoComplete="off" aria-invalid={!valid} aria-describedby={`${id}-hint`} aria-keyshortcuts={offersTab ? "ArrowRight Escape" : undefined}
        onChange={event => { onChange(event.target.value); setDismissed(null); caret(); }} onKeyDown={key} onKeyUp={caret} onClick={caret} onSelect={caret} onFocus={() => { setFocused(true); caret(); }} onBlur={() => setFocused(false)} />
      <AnimatePresence initial={false}>{offersTab && <motion.span className="cv-name__keys" aria-hidden="true" initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: motionTokens.duration.fast }}><kbd>→</kbd></motion.span>}</AnimatePresence>
    </div>
    <p className="cv-hint" id={`${id}-hint`} role={valid ? undefined : "alert"}>{valid ? (offersTab ? t("Right arrow accepts the suggested ending, Escape hides it.") : typed ? t("Saved as {0}", [fileNameOf(typed)]) : t("Suggested from the workbook and worksheet. Type to use another name.")) : t("A file name cannot contain \\ / : * ? \" < > | and cannot start with a dot.")}</p>
  </div>;
}

/** A number that counts from where it was to where it is now, in tabular figures. The final value is what assistive technology reads. */
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const node = useRef<HTMLSpanElement>(null), shown = useRef(0);
  const paint = useEffectEvent((n: number) => { shown.current = n; if (node.current) node.current.textContent = format(n); });
  useEffect(() => {
    if (reduce) { paint(value); return; }
    const controls = animate(shown.current, value, { duration: .7, ease: enter, onUpdate: paint });
    return () => controls.stop();
  }, [value, reduce]);
  return <><span className="cv-sr">{format(value)}</span><span ref={node} aria-hidden="true">{format(0)}</span></>;
}

function Stats({ result, converting, bom }: { result: Converted | null; converting: boolean; bom: boolean }) {
  const { t, locale } = useWorkspaceI18n();
  const nf = useMemo(() => new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US"), [locale]);
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const id = useId();
  const count = (n: number) => nf.format(Math.round(n));
  const tiles: [string, number, (n: number) => string][] = [[t("Rows"), result?.rows ?? 0, count], [t("Columns"), result?.cols ?? 0, count], [t("File size"), result?.bytes ?? 0, bytesText], [t("Time"), result?.ms ?? 0, timeText]];
  return <section className="cv-card cv-stats" aria-label={t("Conversion result")} aria-busy={converting || undefined} data-busy={converting || undefined}>
    <dl className="cv-tiles">{tiles.map(([label, value, format]) => <div key={label}><dt>{label}</dt><dd><CountUp value={value} format={format} /></dd></div>)}</dl>
    <div className="cv-details" data-interaction-own>
      <button type="button" className="cv-details__toggle" aria-expanded={open} aria-controls={id} disabled={!result} onClick={() => setOpen(value => !value)}>{t("Details")}<ChevronIcon state={open} size={14} /></button>
      <AnimatePresence initial={false}>{open && result && <motion.ul id={id} className="cv-details__list" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={reduce ? { duration: 0 } : { height: motionTokens.spring.smooth, opacity: { duration: motionTokens.duration.standard } }}>
        <li>{t("{0} rows written, {1} empty rows skipped.", [count(result.rows), count(Math.max(0, result.skipped))])}</li>
        {result.dates > 0 && <li>{t("{0} date cells written as ISO dates (YYYY-MM-DD).", [count(result.dates)])}</li>}
        {result.formulas > 0 && <li>{t("{0} formulas exported as their last calculated value.", [count(result.formulas)])}</li>}
        <li>{bom ? t("UTF-8 with a byte order mark; Excel reads accented text correctly.") : t("UTF-8 without a byte order mark; Excel may misread accented text.")}</li>
        <li>{t("Numbers and codes keep the exact text stored in the file, including leading zeros.")}</li>
      </motion.ul>}</AnimatePresence>
    </div>
  </section>;
}

/** The first rows, converted in place: each row's original cells give way to its CSV line, one after another. Show source reverses it. */
function Preview({ result, converting, delimiter }: { result: Converted | null; converting: boolean; delimiter: Delimiter }) {
  const { t, locale } = useWorkspaceI18n();
  const reduce = useReducedMotion();
  const [face, setFace] = useState<"csv" | "source">("csv");
  const nf = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US");
  const csv = face === "csv";
  const cols = Math.min(result?.cols ?? 1, 6);
  return <section className="cv-card cv-preview" aria-label={t("Preview")} data-busy={(converting && !!result) || undefined}>
    <header className="cv-preview__head">
      <div><h3>{t("Preview")}</h3>
        <p className="cv-muted" role="status" aria-live="polite">{!result ? t("Converting…") : result.rows === 0 ? t("This worksheet has no values, so there is nothing to export.") : csv ? t("The first {0} of {1} rows, as they will be written.", [nf.format(result.sample.length), nf.format(result.rows)]) : t("The original cells of the first {0} rows.", [nf.format(result.sample.length)])}</p></div>
      <div data-interaction-own><SegmentedControl label={t("Preview shows")} value={face} onValueChange={value => setFace(value as typeof face)} options={[{ value: "csv", label: "CSV" }, { value: "source", label: t("Source") }]} /></div>
    </header>
    <div className="cv-rows" style={{ "--cv-cols": cols } as CSSProperties}>
      {!result && Array.from({ length: 5 }, (_, i) => <div className="cv-row" key={i}><Skeleton width={`${88 - i * 11}%`} height={12} /></div>)}
      {result?.sample.map((values, row) => {
        const timing = { duration: reduce ? .01 : .4, delay: reduce ? 0 : .12 + row * .07, ease: enter };
        return <div className="cv-row" key={row} data-head={row === 0 || undefined}>
          <motion.div className="cv-row__layer cv-row__src" aria-hidden={csv} initial={{ opacity: 1 }} animate={{ opacity: csv ? 0 : 1, filter: csv && !reduce ? "blur(3px)" : "blur(0px)" }} transition={timing}>
            {values.slice(0, 6).map((value, col) => <span key={col} title={value}>{value}</span>)}{values.length > 6 && <span className="cv-more">+{values.length - 6}</span>}
          </motion.div>
          <motion.div className="cv-row__layer cv-row__csv" aria-hidden={!csv} initial={reduce ? false : { opacity: 0, y: 6, filter: "blur(4px)" }} animate={{ opacity: csv ? 1 : 0, y: 0, filter: csv || reduce ? "blur(0px)" : "blur(3px)" }} transition={timing}>
            {values.map((value, col) => <span key={col}>{col > 0 && <motion.i key={delimiter} className="cv-d" aria-hidden="true" initial={reduce ? false : { opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: motionTokens.duration.standard, ease: enter }}>{GLYPH[delimiter]}</motion.i>}{csvField(value, delimiter)}</span>)}
          </motion.div>
        </div>;
      })}
    </div>
  </section>;
}
