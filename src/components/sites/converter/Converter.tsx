"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { ArrowDownToLine, FileSpreadsheet, FlipHorizontal2 } from "lucide-react";
import { useCollateral } from "../collateral/CollateralProvider";
import { SectionHeader, FileChip } from "../collateral/shell";
import { Stepper, type StepSpec } from "../collateral/Stepper";
import { CollateralBoundary } from "../collateral/CollateralBoundary";
import { ImportStep } from "../collateral/excel-formation/steps/ImportStep";
import { AgentCursor } from "./AgentCursor";
import { GenerationStats, type StatCell, type StatsTable } from "./GenerationStats";
import { GhostText } from "./GhostText";
import { SegmentedControl } from "./primitives";
import { TldrToggle, type TldrLength, type TldrMode, type TldrParagraph, type TldrRequest, type TldrStreamEvent } from "./TldrToggle";
import { FORMATS, baseName, delimitedText, formatBytes, formatDuration, safeName, suggestName, trimRow } from "./flip-model";
import { flipDoc, flipFacts, rowId, workbookText, type Fact, type QuoteReason } from "./flip-plan";
import { THINK_MS, chunkFields, chunkWords, pointCountFor, streamResult } from "./tldr-model";
import "../affectui-settings/settings-reference.css";
import "../affectui-settings/settings-overrides.css";
import "../storage/storage-dropzone.css";
import "../collateral/collateral.css";
import "./flip-tokens.css";
import "./flip.css";

type Step = "upload" | "flip";
const LABEL: Record<Step, string> = { upload: "Upload", flip: "Convert" };
/** The header and twelve rows are what the cards show: enough to see the shape of the sheet, short enough to read and to stream in a couple of seconds. */
const PREVIEW_ROWS = 13;
/** The prediction plays the first rows, and at most this many columns of them. */
const AGENT_ROWS = 5, AGENT_COLUMNS = 8;
/** How many lines of the preview the CSV view shows at each length of the slider (the header counts). */
const ROWS_FOR = [4, 6, 8, 11, 13] as const;
const rowsFor = (length: TldrLength, total: number) => Math.min(total, ROWS_FOR[length - 1]);
const extensionOf = (format: string) => format === "tsv" ? ".tsv" : format === "psv" ? ".txt" : ".csv";
const DELIMITER_NAME: Record<string, string> = { ",": "comma", ";": "semicolon", "\t": "tab", "|": "pipe" };
const mark = <FlipHorizontal2 size={14} aria-hidden="true" />;

/** Converter (the Flip page): open a workbook (the Upload step of Excel formation), then see how its first rows turn into delimited text. Writing the whole file comes later. */
export function Converter({ notify }: { workspaceId: string; notify: (message: string) => void }) {
  const reduce = useReducedMotion();
  const { engine } = useCollateral();
  const [chosen, setStep] = useState<Step>("upload");
  const ready = engine.phase === "ready" && !!engine.fileName;
  const step: Step = ready ? chosen : "upload";
  const steps: StepSpec<Step>[] = (Object.keys(LABEL) as Step[]).map(id => ({ id, label: LABEL[id] }));
  return <LayoutGroup id="flip"><div className="ui-sb collateral cr-flip" data-upload-only={!ready}>
    <SectionHeader trail={["Converter", LABEL[step]]} title="Converter" file={ready ? <FileChip name={engine.fileName} detail={formatBytes(engine.fileSize)} onClose={engine.close} /> : undefined} />
    <AnimatePresence>{ready && <Stepper steps={steps} current={step} onChange={setStep} available={() => true} group="flip" reveal />}</AnimatePresence>
    <AnimatePresence mode="wait" initial={false}><motion.div className="ui-sb__body" id="flip-panel" role={ready ? "tabpanel" : undefined} aria-labelledby={ready ? `flip-tab-${step}` : undefined} key={step} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: reduce ? 0 : 0.16 }}>
      <CollateralBoundary resetKey={step}>
        {step === "upload" && <ImportStep engine={engine} onReview={() => setStep("flip")} />}
        {step === "flip" && ready && <FlipStage key={engine.fileName} fileName={engine.fileName} fileSize={engine.fileSize} notify={notify} />}
      </CollateralBoundary>
    </motion.div></AnimatePresence>
  </div></LayoutGroup>;
}

interface SheetPreview { sheet: string; rows: string[][]; /** The row number each preview row has in the workbook. */ excelRows: number[]; totalColumns: number }

function FlipStage({ fileName, fileSize, notify }: { fileName: string; fileSize: number; notify: (message: string) => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const { engine } = useCollateral();
  const result = engine.result;
  const sheets = useMemo(() => (result?.profile.sheets ?? []).filter(item => item.role !== "empty"), [result]);
  const [sheetName, setSheetName] = useState(() => result?.profile.primary ?? sheets[0]?.name ?? "");
  const [format, setFormat] = useState("csv");
  const [name, setName] = useState(() => safeName(baseName(fileName)));
  const [mode, setMode] = useState<TldrMode>("full");
  const [length, setLength] = useState<TldrLength>(2);
  const [loaded, setLoaded] = useState<{ sheet: string; preview: SheetPreview | null } | null>(null);
  const option = FORMATS.find(item => item.code === format) ?? FORMATS[0];
  const delimiter = option.delimiter, delimiterName = uiText(DELIMITER_NAME[delimiter] ?? "delimiter");
  const ext = extensionOf(format);
  const names = useMemo(() => [baseName(fileName), ...sheets.map(item => item.name)].map(safeName).filter(Boolean), [fileName, sheets]);
  const suggestRef = useRef({ names, ext });
  useEffect(() => { suggestRef.current = { names, ext }; });
  const finalName = `${name.trim() || safeName(baseName(fileName))}${name.trim().toLowerCase().endsWith(ext) ? "" : ext}`;

  // ---- the first rows of the chosen sheet, as the reader serves them: the cells as Excel shows them, untouched
  const reader = useRef(engine);
  useEffect(() => { reader.current = engine; });
  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const meta = await reader.current.gridMeta(sheetName);
        if (!meta) throw new Error("sheet unavailable");
        const got = await reader.current.gridRows(meta.headerRow, Math.min(200, PREVIEW_ROWS + meta.hiddenRows), sheetName);
        const visible = got.filter(row => !row.hidden).slice(0, PREVIEW_ROWS);
        const width = Math.max(1, ...visible.map(row => trimRow(row.values).length));
        const preview: SheetPreview = { sheet: sheetName, rows: visible.map(row => Array.from({ length: width }, (_, col) => row.values[col] ?? "")), excelRows: visible.map(row => row.r), totalColumns: meta.columns.length };
        if (current) setLoaded({ sheet: sheetName, preview });
      } catch { if (current) setLoaded({ sheet: sheetName, preview: null }); }
    })();
    return () => { current = false; };
  }, [sheetName]);
  const loading = loaded?.sheet !== sheetName, preview = loaded?.sheet === sheetName ? loaded.preview : null;
  const rows = useMemo(() => preview?.rows ?? [], [preview]);
  const excelRows = useMemo(() => preview?.excelRows ?? [], [preview]);
  const excelRow = useCallback((position: number) => excelRows[position - 1] ?? position, [excelRows]);
  const sheetInfo = sheets.find(item => item.name === sheetName);
  const totalRows = (sheetInfo?.dataRows ?? Math.max(0, rows.length - 1)) + 1;
  const columns = rows[0]?.length ?? 0, totalColumns = preview?.totalColumns ?? columns;

  // ---- the TL;DR card: the rows as paragraphs, their delimited text as the summary and what to know about them as the key points
  const article = useMemo(() => ({
    title: sheetName,
    source: { name: fileName, mark: <FileSpreadsheet size={14} aria-hidden="true" /> },
    date: uiText("First rows"),
    readingTime: uiText("{0} of {1} rows · {2} columns", [rows.length, totalRows, totalColumns]),
    paragraphs: rows.map<TldrParagraph>((row, index) => ({ id: rowId(index + 1), text: workbookText(row) })),
  }), [sheetName, rows, totalRows, totalColumns, fileName, uiText]);
  const factText = useCallback((fact: Fact) => {
    const [a, b] = fact.params, column = fact.column ?? "";
    switch (fact.id) {
      case "header": return uiText("Row {0} becomes the header line, {1} columns.", [excelRow(1), a]);
      case "delimiter": return uiText("In these rows, {0} cells hold a {1}, so they are written in quotes; the first is on row {2} ({3}).", [a, delimiterName, excelRow(b), column]);
      case "none": return uiText("No cell in these rows holds a {0}, so none needs quotes for it.", [delimiterName]);
      case "quote": return uiText("{0} cells hold a double quote: it is doubled inside the quotes (first on row {1}, {2}).", [a, excelRow(b), column]);
      case "break": return uiText("{0} cell holds a line break: it stays inside its quotes, so one record spans two lines (row {1}, {2}).", [a, excelRow(b), column]);
      case "zeros": return uiText("{0} codes start with zeros (first on row {1}): they are written as typed. Excel drops the zeros when it reopens a CSV unless the column is Text.", [a, excelRow(b)]);
      case "empty": return uiText("{0} empty cells stay empty fields, so every line keeps {1} columns.", [a, b]);
      case "accents": return uiText("{0} cells hold accents or other non-ASCII text: they are written as UTF-8 (first on row {1}).", [a, excelRow(b)]);
    }
  }, [uiText, delimiterName, excelRow]);
  const summarize = useCallback(async function* (request: TldrRequest): AsyncGenerator<TldrStreamEvent> {
    // the pause stands for the work of a real conversion; the result itself is computed from the rows read
    await new Promise<void>(resolve => { const timer = setTimeout(resolve, THINK_MS); request.signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true }); });
    if (request.signal.aborted) return;
    if (request.mode === "summary") {
      yield* streamResult(delimitedText(rows.slice(0, rowsFor(request.length, rows.length)), delimiter), request.signal, { chunker: chunkFields });
      return;
    }
    const facts = flipFacts(rows, delimiter).slice(0, pointCountFor(request.length));
    yield* streamResult(facts.map(fact => ({ text: factText(fact), source: fact.source })), request.signal, { chunker: chunkWords });
  }, [rows, delimiter, factText]);
  const renderRow = useCallback((paragraph: TldrParagraph, index: number) => <span className="fl-row" data-header={index === 0 ? "" : undefined}>
    <span className="fl-row__no" aria-hidden="true">{excelRow(index + 1)}</span>
    <span className="fl-row__cells" role="presentation">{rows[index]?.map((value, col) => <span key={col} className="fl-cell" data-empty={value === "" ? "" : undefined}>{value.replace(/\r?\n/g, "↵") || "·"}</span>)}</span>
    <span className="fp-sr">{paragraph.text}</span>
  </span>, [rows, excelRow]);

  // ---- the Agent cursor: the first rows (and columns), joined and quoted
  const agentColumns = Math.min(columns, AGENT_COLUMNS);
  const doc = useMemo(() => flipDoc(rows.slice(0, AGENT_ROWS).map(row => row.slice(0, AGENT_COLUMNS)), delimiter, {
    title: `${sheetName} → ${option.name}`, fileName: finalName, shown: AGENT_ROWS,
    labels: {
      join: row => row === 1 ? uiText("Joining the header") : uiText("Joining row {0}", [excelRow(row)]),
      quote: (reason: QuoteReason) => reason === "delimiter" ? uiText("Quoting a cell with a {0}", [delimiterName]) : reason === "quote" ? uiText("Doubling a quote") : uiText("Keeping a line break"),
      summary: uiText("{0} rows in all, {1} columns.", [totalRows, totalColumns]), summaryLabel: uiText("Adding a summary line"),
    },
  }), [rows, delimiter, sheetName, option.name, finalName, totalRows, totalColumns, uiText, delimiterName, excelRow]);

  // ---- real figures: what opening the workbook measured. The output's own time and size are not made up before there is an output.
  const allRows = sheets.reduce((sum, item) => sum + item.dataRows, 0);
  const cells: StatCell[] = [
    { id: "read", label: uiText("Read in"), value: engine.openMs, format: value => formatDuration(value), unit: uiText("on this device"), unitInline: uiText("to read") },
    { id: "rows", label: uiText("Rows"), value: allRows, format: value => Math.round(value).toLocaleString(), unit: uiText("data rows"), unitInline: uiText("rows") },
    { id: "cells", label: uiText("Cells"), value: result?.stats.cellsScanned ?? 0, format: value => Math.round(value).toLocaleString(), unit: uiText("read"), unitInline: uiText("cells") },
    { id: "size", label: uiText("Size"), value: result?.size ?? fileSize, format: value => formatBytes(value), unit: uiText("workbook"), unitInline: uiText("on disk") },
  ];
  const table: StatsTable = {
    caption: uiText("Sheets in this workbook"), head: [uiText("Sheet"), uiText("Rows"), uiText("Columns")],
    rows: sheets.map(item => ({ label: item.name, cells: [item.dataRows.toLocaleString(), String(item.headers.length)] })),
    total: sheets.length > 1 ? { label: uiText("Total"), cells: [allRows.toLocaleString(), ""] } : undefined,
  };
  const copyValue = { file: fileName, sizeBytes: result?.size ?? fileSize, readMs: engine.openMs, rows: allRows, cells: result?.stats.cellsScanned ?? 0, sheets: sheets.map(item => ({ name: item.name, rows: item.dataRows, columns: item.headers.length })) };
  const ghostLabels = useMemo(() => ({ hint: uiText("Suggestions appear when you pause. Right Arrow accepts, Command or Control Right Arrow accepts one word, Escape dismisses."), thinking: uiText("Thinking"), toAccept: uiText("to accept"), accepted: uiText("Accepted"), noSuggestion: uiText("No suggestion"), retry: uiText("Retry"), byModel: (model: string) => uiText("Suggested from {0}", [model]) }), [uiText]);
  const tldrLabels = useMemo(() => ({
    mode: uiText("View"), full: uiText("Sheet"), summary: option.name, points: uiText("Notes"), length: uiText("Lines"),
    readingParagraphs: (count: number) => uiText("Reading {0} rows", [count]), findingPoints: uiText("Checking the cells"), thinking: uiText("Thinking"), writing: uiText("Writing"),
    stop: uiText("Stop"), stopped: uiText("Stopped"), failed: uiText("Failed"), tryAgain: uiText("Try again"), regenerate: uiText("Write again"), copySummary: uiText("Copy as text"), copyPoints: uiText("Copy notes"), copied: uiText("Copied"),
    jump: (index: number, text: string) => uiText("Jump to row {0}: {1}", [excelRow(index), text]), empty: uiText("This sheet has no rows."), errorTitle: (m: "summary" | "points") => m === "points" ? uiText("Couldn’t check the cells") : uiText("Couldn’t write the text"), defaultError: uiText("Something went wrong."),
    announceStart: (m: "summary" | "points") => m === "points" ? uiText("Checking the cells.") : uiText("Flipping to {0}.", [option.name]),
    announceDone: (m: "summary" | "points", _words: number, points: number) => m === "points" ? uiText("{0} notes ready.", [points]) : uiText("{0} lines ready.", [rowsFor(length, rows.length)]),
    announceSaved: (m: "summary" | "points") => m === "points" ? uiText("Showing the saved notes.") : uiText("Showing the saved text."), announceStopped: uiText("Stopped. What arrived is kept."),
    announceShowing: (index: number) => uiText("Showing row {0} in the sheet.", [excelRow(index)]), announceFailed: (m: "summary" | "points", message: string) => `${m === "points" ? uiText("Couldn’t check the cells") : uiText("Couldn’t write the text")}. ${message}`,
  }), [uiText, option.name, length, rows.length, excelRow]);
  const agentLabels = useMemo(() => ({
    reading: uiText("Reading the sheet"), stop: uiText("Stop"), runAgain: uiText("Run again"), ask: uiText("Show me"), retry: uiText("Retry"), undo: uiText("Undo"), accept: uiText("Accept changes"),
    ready: (count: number) => uiText("{0} changes ready for review", [count]), accepted: (count: number) => uiText("Accepted {0} changes", [count]), reverted: (count: number) => uiText("Undid {0} changes", [count]),
    stoppedEarly: uiText("Stopped before any changes"), stoppedAfter: (count: number) => uiText("Stopped after {0} changes", [count]), failed: uiText("Connection lost"), empty: uiText("Nothing to change"),
    barCount: (count: number) => uiText("{0} changes", [count]), by: (agent: string) => uiText("by {0}", [agent]), review: uiText("Review changes"),
    rewrite: uiText("Joining a row"), insert: () => uiText("Adding a line"), fix: uiText("Quoting a cell"),
  }), [uiText]);

  return <div className="fl-stage">
    <section className="fl-block" aria-labelledby="fl-name-title">
      <header className="fl-block__head"><h2 id="fl-name-title">{uiText("Output file")}</h2><p>{uiText("Name the file the sheet will become, and pick how its cells are separated.")}</p></header>
      <GhostText acceptKey="ArrowRight" value={name} onValueChange={setName} multiline={false} rows={1} delay={450} minLength={3} placeholder={uiText("File name")} aria-label={uiText("Output file name")} model={{ name: uiText("This workbook"), mark }}
        suggest={text => suggestName(text, suggestRef.current.names, suggestRef.current.ext)} labels={ghostLabels} />
      <p className="fl-ext">{uiText("Saved as")} <b>{finalName}</b></p>
      <div className="fl-format"><SegmentedControl label={uiText("Format")} value={format} onChange={setFormat} options={FORMATS.map(item => ({ value: item.code, label: item.name }))} /><span className="fl-format__note">{uiText("Separated by a {0}", [delimiterName])}</span></div>
    </section>

    <section className="fl-block" aria-labelledby="fl-preview-title">
      <header className="fl-block__head fl-block__head--row"><div><h2 id="fl-preview-title">{uiText("Preview")}</h2><p>{uiText("The first rows of the sheet, the text Flip writes for them and what to know about their cells. A note links back to the row it comes from.")}</p></div>
        {sheets.length > 1 && <SegmentedControl label={uiText("Sheet")} value={sheetName} onChange={setSheetName} options={sheets.map(item => ({ value: item.name, label: item.name }))} />}</header>
      {loading ? <div className="fl-loading" aria-busy="true"><i /><i /><i /><i /></div> : !preview ? <p className="fl-note" role="alert">{uiText("This sheet could not be read.")}</p>
        : <TldrToggle article={article} summarize={summarize} model={{ name: uiText("Flip · on this device"), mark }} layout="lines" chunker={chunkFields} resetKey={`${sheetName}|${delimiter}`}
          mode={mode} onModeChange={setMode} length={length} onLengthChange={setLength} renderParagraph={renderRow} jumpLabel={(index) => uiText("Row {0}", [excelRow(index + 1)])}
          readout={(m, l) => m === "points" ? uiText("{0} notes", [pointCountFor(l)]) : uiText("{0} lines", [rowsFor(l, rows.length)])} count={(m, _w, p) => m === "points" ? uiText("{0} notes", [p]) : uiText("{0} lines", [rowsFor(length, rows.length)])} labels={tldrLabels} />}
    </section>

    <section className="fl-block" aria-labelledby="fl-predict-title">
      <header className="fl-block__head"><h2 id="fl-predict-title">{uiText("Watch it flip")}</h2><p>{uiText("A prediction on the first rows: each is joined with the {0}, then every cell that needs quotes gets them. Accept or undo; nothing is saved.", [delimiterName])}</p></header>
      {loading ? <div className="fl-loading" aria-busy="true"><i /><i /><i /><i /></div> : preview && <AgentCursor blocks={doc.blocks} edits={doc.edits} meta={uiText("First {0} rows · first {1} columns", [doc.shown, agentColumns])} agent={{ name: "Flip", mark, color: "oklch(0.6 0.15 255)" }} collaborator={null} title={uiText("Prediction")} labels={agentLabels} />}
    </section>

    <section className="fl-block" aria-label={uiText("Figures")}>
      <GenerationStats status="done" statusLabel={uiText("Read in {0}", [formatDuration(engine.openMs)])} model={{ name: uiText("Read on this device"), mark }} cells={cells} table={table} copyValue={copyValue}
        note={uiText("The time and size of the output appear here once Flip writes your file.")}
        labels={{ details: uiText("Details"), showDetails: uiText("Show details"), hideDetails: uiText("Hide details"), copy: uiText("Copy figures as JSON"), copied: uiText("Copied"), copyFailed: uiText("Copy failed") }} />
    </section>

    <footer className="fl-foot">
      <button type="button" className="ui-button" data-variant="primary" data-size="md" disabled aria-describedby="fl-download-note" onClick={() => notify(uiText("Download is not wired yet."))}><ArrowDownToLine size={15} aria-hidden="true" /><span className="ui-button__label">{uiText("Download")} {finalName}</span></button>
      <p id="fl-download-note" className="fl-note">{uiText("Download comes with the conversion step. Nothing leaves this device.")}</p>
    </footer>
  </div>;
}
