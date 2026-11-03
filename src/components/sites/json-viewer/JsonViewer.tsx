"use client";

import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type FocusEvent, type KeyboardEvent, type Ref } from "react";
import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, ChevronRight, ChevronUp, ChevronsDownUp, ChevronsUpDown, Copy, Link2, Search, X } from "lucide-react";
import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { ANIMATED_ROW_LIMIT, ROW_HEIGHT, SEARCH_LIMIT, TREE_PADDING, buildRows, isBranch, markPieces, memorySource, revealFor, scrollTarget, typeLine, type JsonNodeInfo, type JsonSource, type JsonValueType, type RowModel, type SearchHit, type SearchResult } from "./json-model";
import "./json-viewer.css";

export interface JsonViewerCopyDetail { kind: "value" | "path"; path: string; text: string }
export interface JsonViewerProps {
  /** Any JSON-like value. Give `source` instead for a document that is too large to hold here. */
  data?: unknown;
  source?: JsonSource;
  rootName?: string;
  defaultExpandDepth?: number;
  expanded?: string[];
  defaultExpanded?: string[];
  onExpandedChange?: (paths: string[]) => void;
  searchable?: boolean;
  query?: string;
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;
  pageSize?: number;
  copyable?: boolean;
  onCopy?: (detail: JsonViewerCopyDetail) => void;
  onSelect?: (detail: { path: string; value: unknown; type: JsonValueType }) => void;
  showPath?: boolean;
  maxHeight?: number | string;
  label?: string;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

/** Fitted to the preview's recorded positions: a row unfolding (rmse 1.5%), the highlight gliding (0.15%) and the tree scrolling (1.2%). */
const ROW_SPRING = { type: "spring", stiffness: 220, damping: 32 } as const;
const HIGHLIGHT_SPRING = { type: "spring", stiffness: 170, damping: 26 } as const;
const SCROLL_SPRING = { type: "spring", stiffness: 370, damping: 50 } as const;
const EASE_STANDARD = [0.22, 1, 0.36, 1] as const, EASE_ENTER = [0.16, 1, 0.3, 1] as const;
const COPY_RESET_MS = 1400;
const NONE_PATHS: string[] = [], NO_HITS: SearchHit[] = [];

function initialOpen(source: JsonSource, depth: number): string[] {
  const root = source.root();
  if (!root || depth < 1 || !isBranch(root.type)) return [];
  const open = [root.path];
  const walk = (info: JsonNodeInfo, level: number) => {
    if (level >= depth) return;
    const children = source.children(info.path, 0, Math.min(info.count, 50));
    for (const child of children ?? []) if (isBranch(child.type)) { open.push(child.path); walk(child, level + 1); }
  };
  walk(root, 1);
  return open;
}

/**
 * A collapsible JSON tree with type colours, search that opens the branches that hold a match, paged long branches and copy value or path per
 * row. Rebuilt from the public preview of UIArc's JSON viewer (DOM, declared CSS and frame-by-frame recordings; `docs/research/json-viewer/`)
 * and from its public API reference; the springs are fitted to the recorded positions. Its data can come from memory or, for a document too
 * large to parse here, from a worker that serves one page of children at a time.
 */
export function JsonViewer(props: JsonViewerProps) {
  const { data, source: given, rootName = "root", defaultExpandDepth = 1, searchable = true, pageSize = 50, copyable = true, showPath = true, maxHeight = 420, label = "JSON", className, onCopy, onSelect, onExpandedChange, onQueryChange } = props;
  const { t } = useWorkspaceI18n();
  const reduce = useReducedMotion() ?? false;
  const uid = useId();
  const memory = useMemo(() => given ? null : memorySource(data, rootName), [given, data, rootName]);
  const source = given ?? memory!;
  const rootPath = source.root()?.path ?? rootName;
  const version = useSyncExternalStore(source.subscribe, source.version, source.version);

  // ---- open branches, pages and the query (each controllable from outside)
  const [innerExpanded, setInnerExpanded] = useState<string[]>(() => props.defaultExpanded ?? initialOpen(source, defaultExpandDepth));
  const expandedList = props.expanded ?? innerExpanded;
  const setExpanded = useCallback((next: string[]) => { if (props.expanded === undefined) setInnerExpanded(next); onExpandedChange?.(next); }, [props.expanded, onExpandedChange]);
  const [visible, setVisible] = useState<Record<string, number>>({});
  const [allOpen, setAllOpen] = useState(false);
  const [innerQuery, setInnerQuery] = useState(props.defaultQuery ?? "");
  const query = props.query ?? innerQuery;
  const setQuery = (next: string) => { if (props.query === undefined) setInnerQuery(next); onQueryChange?.(next); };
  const q = query.trim();
  const [closedBox, setClosedBox] = useState<{ query: string; paths: string[] }>({ query: "", paths: [] });
  const closedBySearch = useMemo(() => closedBox.query === q ? closedBox.paths : NONE_PATHS, [closedBox, q]);

  // ---- search: at once for a value in memory, a moment after typing for a document in a worker
  const syncResult = useMemo<SearchResult | null>(() => source.sync && q ? source.search(q, SEARCH_LIMIT) as SearchResult : null, [source, q]);
  const [asyncBox, setAsyncBox] = useState<{ query: string; result: SearchResult } | null>(null);
  useEffect(() => {
    if (source.sync || !q) return;
    let alive = true;
    const timer = setTimeout(() => { void Promise.resolve(source.search(q, SEARCH_LIMIT)).then(result => { if (alive) setAsyncBox({ query: q, result }); }); }, 140);
    return () => { alive = false; clearTimeout(timer); };
  }, [source, q]);
  const result = !q ? null : source.sync ? syncResult : asyncBox?.query === q ? asyncBox.result : null;
  const hits = useMemo(() => result?.hits ?? NO_HITS, [result]);
  const [cursorBox, setCursorBox] = useState({ query: "", index: 0 });
  const cursor = cursorBox.query === q ? Math.min(cursorBox.index, Math.max(0, hits.length - 1)) : 0;
  const hit = hits[cursor];
  const hitKey = hit ? `${q}\u0001${cursor}\u0001${hit.path}` : "";

  const reveal = useMemo(() => {
    const open = new Set<string>(), pages: Record<string, number> = {};
    for (const item of source.sync ? hits : hit ? [hit] : []) { const r = revealFor(item, rootPath, pageSize); r.open.forEach(path => open.add(path)); for (const [path, count] of Object.entries(r.visible)) pages[path] = Math.max(pages[path] ?? 0, count); }
    return { open, pages };
  }, [hits, hit, source.sync, rootPath, pageSize]);
  const expanded = useMemo(() => { const set = new Set([...expandedList, ...reveal.open]); for (const path of closedBySearch) set.delete(path); return set; }, [expandedList, reveal.open, closedBySearch]);
  const pages = useMemo(() => { const merged = { ...visible }; for (const [path, count] of Object.entries(reveal.pages)) merged[path] = Math.max(merged[path] ?? 0, count); return merged; }, [visible, reveal.pages]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` is how a source says "I have new pages".
  const { rows, missing } = useMemo(() => buildRows({ source, all: allOpen, expanded, visible: pages, pageSize }), [source, allOpen, expanded, pages, pageSize, version]);
  useEffect(() => { for (const item of missing) source.request(item.path, item.from, item.to); }, [missing, source]);
  const animated = !reduce && rows.length <= ANIMATED_ROW_LIMIT;

  // ---- the current row. While a search is on it follows the current match until the person moves on their own.
  const [activeBox, setActiveBox] = useState({ id: rootPath, consumed: "" });
  const followsHit = hitKey !== "" && activeBox.consumed !== hitKey;
  const wantedId = followsHit ? hit!.path : activeBox.id;
  const active: RowModel | undefined = rows.find(row => row.id === wantedId) ?? rows[0];
  const activeIndex = active ? Math.max(0, rows.indexOf(active)) : 0;
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const treeRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const intent = useRef({ scroll: false, focus: false });
  const select = useCallback((row: RowModel, how: { scroll?: boolean; focus?: boolean } = {}) => {
    setActiveBox({ id: row.id, consumed: hitKey });
    intent.current = { scroll: how.scroll ?? false, focus: how.focus ?? false };
    if (row.kind === "node" && row.info) onSelect?.({ path: row.path, value: source.valueOf?.(row.path), type: row.info.type });
  }, [hitKey, onSelect, source]);

  // ---- copy
  const [copyStates, setCopyStates] = useState<Record<string, "done" | "error">>({});
  const [status, setStatus] = useState("");
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => { const held = timers.current; return () => held.forEach(timer => clearTimeout(timer)); }, []);
  const copy = useCallback(async (path: string, kind: "value" | "path", slot: string) => {
    let state: "done" | "error" = "done", text = "";
    try { text = await source.copyText(path, kind); await navigator.clipboard.writeText(text); } catch { state = "error"; }
    setCopyStates(current => ({ ...current, [slot]: state }));
    setStatus(state === "done" ? (kind === "path" ? t("Path copied") : t("Value copied")) : t("Copy failed"));
    clearTimeout(timers.current.get(slot));
    timers.current.set(slot, setTimeout(() => { setCopyStates(current => { const next = { ...current }; delete next[slot]; return next; }); setStatus(""); }, COPY_RESET_MS));
    if (state === "done") onCopy?.({ kind, path, text });
  }, [source, onCopy, t]);

  // ---- opening, closing, paging
  const toggle = useCallback((row: RowModel) => {
    if (row.kind !== "node" || !row.info || !isBranch(row.info.type)) return;
    if (row.open) { if (allOpen) { setAllOpen(false); setExpanded(rows.filter(item => item.open && item.path !== row.path).map(item => item.path)); return; } setExpanded(expandedList.filter(path => path !== row.path)); if (q) setClosedBox({ query: q, paths: [...closedBySearch, row.path] }); }
    else { setExpanded([...expandedList, row.path]); setClosedBox(current => ({ ...current, paths: current.paths.filter(path => path !== row.path) })); }
  }, [expandedList, setExpanded, q, closedBySearch, allOpen, rows]);
  const showMore = useCallback((row: RowModel) => setVisible(current => ({ ...current, [row.path]: (current[row.path] ?? pageSize) + pageSize })), [pageSize]);
  const expandAll = () => {
    if (!source.sync) { setAllOpen(true); return; }
    const open: string[] = [], root = source.root();
    const walk = (info: JsonNodeInfo) => { if (!isBranch(info.type) || open.length >= 5000) return; open.push(info.path); const kids = source.children(info.path, 0, Math.min(info.count, pages[info.path] ?? pageSize)); for (const kid of kids ?? []) walk(kid); };
    if (root) walk(root);
    setExpanded(open);
  };
  const collapseAll = () => { setAllOpen(false); setExpanded([rootPath]); setVisible({}); setClosedBox({ query: "", paths: [] }); if (rows[0]) select(rows[0], { scroll: true }); };

  // ---- what happens on the screen after a change of the current row: focus it, and spring the tree to where it will sit once the rows settle
  const scrollAnimation = useRef<{ stop: () => void } | null>(null);
  useLayoutEffect(() => {
    const tree = treeRef.current;
    // An intention is used once: a focus asked for by an arrow key must not follow the person into the search field.
    const { scroll: wantScroll, focus: wantFocus } = intent.current;
    intent.current = { scroll: false, focus: false };
    if (!active) return;
    if (wantFocus) rowRefs.current.get(active.id)?.focus({ preventScroll: true });
    if (!tree || !wantScroll && !followsHit) return;
    const to = scrollTarget(activeIndex, tree.scrollTop, tree.clientHeight, TREE_PADDING * 2 + rows.length * ROW_HEIGHT);
    scrollAnimation.current?.stop();
    if (Math.abs(to - tree.scrollTop) < 0.5) return;
    if (!animated) { tree.scrollTop = to; return; }
    scrollAnimation.current = animate(tree.scrollTop, to, { ...SCROLL_SPRING, onUpdate: value => { tree.scrollTop = value; } });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the current row or the number of rows changes, not on every render
  }, [active?.id, followsHit, hitKey, rows.length]);

  const move = (index: number) => { const row = rows[Math.max(0, Math.min(rows.length - 1, index))]; if (row) select(row, { scroll: true, focus: true }); };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const row = active;
    if (!row) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
      if (!copyable || window.getSelection()?.toString() || row.kind !== "node") return;
      event.preventDefault(); void copy(row.path, event.shiftKey ? "path" : "value", `${row.path}\u0001${event.shiftKey ? "path" : "value"}`); return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "ArrowDown") { event.preventDefault(); move(activeIndex + 1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); move(activeIndex - 1); }
    else if (event.key === "Home") { event.preventDefault(); move(0); }
    else if (event.key === "End") { event.preventDefault(); move(rows.length - 1); }
    else if (event.key === "ArrowRight") {
      event.preventDefault();
      if (row.kind === "node" && row.info && isBranch(row.info.type)) { if (!row.open) toggle(row); else if (rows[activeIndex + 1]?.parent === row.path) move(activeIndex + 1); }
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (row.open) toggle(row);
      else if (row.parent !== null) { const parent = rows.find(item => item.path === row.parent && item.kind === "node"); if (parent) select(parent, { scroll: true, focus: true }); }
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (row.kind === "more") showMore(row); else toggle(row);
    } else if (event.key === "/" && searchable) { event.preventDefault(); searchRef.current?.focus(); }
  };
  const gotoHit = (delta: number) => { if (!hits.length) return; const index = (cursor + delta + hits.length) % hits.length; setCursorBox({ query: q, index }); setActiveBox(box => ({ ...box, consumed: "" })); intent.current = { scroll: true, focus: false }; };

  const maxHeightStyle = typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight;
  const total = hits.length;
  const copyGlyph = (slot: string, idle: typeof Copy) => {
    const state = copyStates[slot], Glyph = state === "done" ? Check : state === "error" ? X : idle;
    return <AnimatePresence mode="popLayout" initial={false}>
      <motion.span key={state ?? "idle"} className="jv-actionGlyph" initial={reduce ? false : { opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1, transition: { duration: reduce ? 0 : 0.16, ease: EASE_ENTER } }} exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.1, ease: EASE_STANDARD } }}><Glyph size={14} strokeWidth={1.75} aria-hidden="true" /></motion.span>
    </AnimatePresence>;
  };
  const actionLabel = (slot: string, kind: "value" | "path") => copyStates[slot] === "done" ? t("Copied") : copyStates[slot] === "error" ? t("Copy failed") : kind === "value" ? t("Copy value") : t("Copy path");
  const actionButton = (path: string, kind: "value" | "path", slot: string, extra = "") => {
    const state = copyStates[slot] ?? "idle", name = actionLabel(slot, kind);
    return <button type="button" className={`jv-action${extra}`} tabIndex={-1} data-state={state} aria-label={name} title={name} onClick={event => { event.stopPropagation(); void copy(path, kind, slot); }}>{copyGlyph(slot, kind === "value" ? Copy : Link2)}</button>;
  };

  // Rows are components that redraw only when something about them changed; what they call lives in one object that always holds the latest handlers.
  const api = useRef<RowApi>({ select: () => {}, toggle: () => {}, showMore: () => {}, copy: () => {}, setRef: () => {} });
  useLayoutEffect(() => { api.current = { select, toggle, showMore, copy: (path, kind, slot) => void copy(path, kind, slot), setRef: (id, node) => { if (node) rowRefs.current.set(id, node); else rowRefs.current.delete(id); } }; });
  const keyOf = (path: string, kind: "value" | "path") => `${path}\u0001${kind}`;
  return <div ref={props.ref} className={`jv-root${className ? ` ${className}` : ""}`} style={{ "--json-max-height": maxHeightStyle } as CSSProperties}>
    {searchable && <div className="jv-toolbar">
      <label className="jv-search">
        <Search size={15} strokeWidth={1.75} className="jv-searchIcon" aria-hidden="true" />
        <input ref={searchRef} className="jv-input" type="search" placeholder={t("Search keys and values")} aria-label={t("Search JSON")} aria-controls={`${uid}-tree`} spellCheck={false} autoComplete="off" value={query}
          onChange={event => { setQuery(event.target.value); setCursorBox({ query: event.target.value.trim(), index: 0 }); }}
          onKeyDown={event => {
            if (event.key === "Enter") { event.preventDefault(); gotoHit(event.shiftKey ? -1 : 1); }
            else if (event.key === "Escape") { event.preventDefault(); setQuery(""); setCursorBox({ query: "", index: 0 }); }
            else if (event.key === "ArrowDown") { event.preventDefault(); const row = rows[activeIndex]; if (row) select(row, { focus: true }); }
          }} />
        <AnimatePresence initial={false}>{q && <motion.span key="matches" className="jv-matches" initial={reduce ? false : { opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0, transition: { duration: reduce ? 0 : 0.16, ease: EASE_ENTER } }} exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.1 } }}>
          <span className="jv-count" aria-live="polite">{total ? `${cursor + 1}/${total}${result?.capped ? "+" : ""}` : result ? "0/0" : "…"}</span>
          <button type="button" className="jv-tool" aria-label={t("Previous match")} disabled={!total} onClick={() => gotoHit(-1)}><ChevronUp size={15} strokeWidth={1.75} aria-hidden="true" /></button>
          <button type="button" className="jv-tool" aria-label={t("Next match")} disabled={!total} onClick={() => gotoHit(1)}><ChevronDown size={15} strokeWidth={1.75} aria-hidden="true" /></button>
        </motion.span>}</AnimatePresence>
      </label>
      <span className="jv-divider" aria-hidden="true" />
      <button type="button" className="jv-tool" aria-label={t("Expand all")} title={t("Expand all")} onClick={expandAll}><ChevronsUpDown size={15} strokeWidth={1.75} aria-hidden="true" /></button>
      <button type="button" className="jv-tool" aria-label={t("Collapse all")} title={t("Collapse all")} onClick={collapseAll}><ChevronsDownUp size={15} strokeWidth={1.75} aria-hidden="true" /></button>
    </div>}
    <div id={`${uid}-tree`} ref={treeRef} className="jv-tree" role="tree" aria-label={label} onKeyDown={onKeyDown}>
      <AnimatePresence initial={false}>{rows.map(row => <RowView key={row.id} row={row} api={api} uid={uid} isActive={row.id === active?.id} current={!!hit && hit.path === row.path} query={q} animated={animated} reduce={reduce} copyable={copyable}
        copyValue={copyStates[keyOf(row.path, "value")]} copyPath={copyStates[keyOf(row.path, "path")]} t={t} />)}</AnimatePresence>
    </div>
    {showPath && active && <div className="jv-pathBar">
      <code className="jv-path" title={active.path}>{active.path}</code>
      {active.info && <span className="jv-pathType">{typeLine(active.info)}</span>}
      {copyable && actionButton(active.path, "path", `${active.path}\u0001bar`, " jv-pathCopy")}
    </div>}
    <span className="jv-srOnly" role="status">{status}</span>
  </div>;
}

interface RowApi { select: (row: RowModel, how?: { scroll?: boolean; focus?: boolean }) => void; toggle: (row: RowModel) => void; showMore: (row: RowModel) => void; copy: (path: string, kind: "value" | "path", slot: string) => void; setRef: (id: string, node: HTMLElement | null) => void }
type Translate = ReturnType<typeof useWorkspaceI18n>["t"];
interface RowViewProps { row: RowModel; api: { current: RowApi }; uid: string; isActive: boolean; current: boolean; query: string; animated: boolean; reduce: boolean; copyable: boolean; copyValue?: "done" | "error"; copyPath?: "done" | "error"; t: Translate }

const sameInfo = (a?: JsonNodeInfo, b?: JsonNodeInfo) => a === b || (!!a && !!b && a.path === b.path && a.count === b.count && a.text === b.text && a.preview === b.preview && a.type === b.type);
const rowEqual = (a: RowViewProps, b: RowViewProps) => a.row.id === b.row.id && a.row.kind === b.row.kind && a.row.level === b.row.level && a.row.open === b.row.open && a.row.posinset === b.row.posinset && a.row.setsize === b.row.setsize && a.row.label === b.row.label
  && a.row.next === b.row.next && a.row.hidden === b.row.hidden && sameInfo(a.row.info, b.row.info) && a.isActive === b.isActive && a.current === b.current && a.query === b.query && a.animated === b.animated && a.reduce === b.reduce
  && a.copyable === b.copyable && a.copyValue === b.copyValue && a.copyPath === b.copyPath && a.t === b.t && a.uid === b.uid;

function CopyGlyph({ state, idle: Idle, reduce }: { state?: "done" | "error"; idle: typeof Copy; reduce: boolean }) {
  const Glyph = state === "done" ? Check : state === "error" ? X : Idle;
  return <AnimatePresence mode="popLayout" initial={false}>
    <motion.span key={state ?? "idle"} className="jv-actionGlyph" initial={reduce ? false : { opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1, transition: { duration: reduce ? 0 : 0.16, ease: EASE_ENTER } }} exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.1, ease: EASE_STANDARD } }}><Glyph size={14} strokeWidth={1.75} aria-hidden="true" /></motion.span>
  </AnimatePresence>;
}
const RowView = memo(function RowView({ row, api, uid, isActive, current, query, animated, reduce, copyable, copyValue, copyPath, t }: RowViewProps) {
  const info = row.info;
  const mark = (text: string, isCurrent: boolean) => { let first = true; return markPieces(text, query).map((piece, i) => piece.mark ? <mark key={i} className="jv-mark" data-current={isCurrent && first ? (first = false, "true") : undefined}>{piece.text}</mark> : piece.text); };
  const button = (kind: "value" | "path", state: "done" | "error" | undefined) => {
    const name = state === "done" ? t("Copied") : state === "error" ? t("Copy failed") : kind === "value" ? t("Copy value") : t("Copy path");
    return <button type="button" className="jv-action" tabIndex={-1} data-state={state ?? "idle"} aria-label={name} title={name} onClick={event => { event.stopPropagation(); api.current.copy(row.path, kind, `${row.path}\u0001${kind}`); }}><CopyGlyph state={state} idle={kind === "value" ? Copy : Link2} reduce={reduce} /></button>;
  };
  const common = {
    role: "treeitem" as const, tabIndex: isActive ? 0 : -1, "aria-level": row.level + 1, "aria-posinset": row.posinset, "aria-setsize": row.setsize, "aria-selected": isActive,
    "aria-expanded": row.kind === "node" && info && isBranch(info.type) ? row.open : undefined, "aria-label": row.kind === "more" ? t("Show {0} more, {1} hidden", [row.next ?? 0, row.hidden ?? 0]) : row.kind === "loading" ? t("Loading") : row.label,
    className: "jv-row", "data-kind": row.kind, "data-active": isActive || undefined,
    style: { "--level": row.level, overflow: row.kind === "more" ? "hidden" : "visible" } as CSSProperties,
    ref: (node: HTMLElement | null) => api.current.setRef(row.id, node),
    initial: animated ? { height: 0, opacity: 0, overflow: "hidden" } : false, animate: { height: ROW_HEIGHT, opacity: 1, transitionEnd: { overflow: row.kind === "more" ? "hidden" : "visible" } },
    exit: animated ? { height: 0, opacity: 0, overflow: "hidden" } : undefined,
    transition: animated ? { height: ROW_SPRING, opacity: { duration: 0.16, ease: EASE_STANDARD } } : { duration: 0 },
    onFocus: (event: FocusEvent<HTMLElement>) => { if (event.target === event.currentTarget && !isActive) api.current.select(row); },
    onClick: () => { api.current.select(row, { focus: true }); if (row.kind === "more") api.current.showMore(row); else api.current.toggle(row); },
  };
  if (row.kind === "more") return <motion.div {...common}><span className="jv-line"><span className="jv-more"><span className="jv-moreLabel">{t("Show {0} more", [row.next ?? 0])}</span><span className="jv-muted">{t("{0} hidden", [row.hidden ?? 0])}</span></span></span></motion.div>;
  if (row.kind === "loading") return <motion.div {...common}><span className="jv-line"><span className="jv-loading">{t("Loading")}</span></span></motion.div>;
  const branch = !!info && isBranch(info.type);
  const keyHit = !!query && !!info && !info.isIndex && info.key.toLowerCase().includes(query.toLowerCase());
  return <motion.div {...common}>
    {isActive && <motion.span layoutId={`${uid}-highlight`} className="jv-highlight" aria-hidden="true" transition={reduce ? { duration: 0 } : HIGHLIGHT_SPRING} />}
    <span className="jv-line">
      <span className="jv-chevron" data-open={row.open || undefined} data-branch={branch || undefined} aria-hidden="true">{branch && <ChevronRight size={14} strokeWidth={1.75} />}</span>
      {info!.isIndex ? <span className="jv-index">{info!.key}</span> : <span className="jv-key">{mark(info!.key, current)}</span>}
      <span className="jv-colon" aria-hidden="true">{row.level === 0 ? "" : ":"}</span>
      {branch
        ? <span className="jv-summary">{!row.open && <span className="jv-preview">{info!.preview}</span>}<span className="jv-countLabel">{t(info!.type === "array" ? (info!.count === 1 ? "{0} item" : "{0} items") : (info!.count === 1 ? "{0} key" : "{0} keys"), [info!.count])}</span></span>
        : <span className="jv-value" data-type={info!.type} title={info!.plain.length > 40 ? info!.plain : undefined}>{info!.type === "string" ? <>&quot;{mark(info!.plain, current && !keyHit)}&quot;</> : mark(info!.text, current && !keyHit)}</span>}
      {copyable && <span className="jv-actions">{button("value", copyValue)}{button("path", copyPath)}</span>}
    </span>
  </motion.div>;
}, rowEqual);
