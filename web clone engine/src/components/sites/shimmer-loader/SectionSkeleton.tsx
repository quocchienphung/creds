import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import type { CSSProperties } from "react";
import { ShimmerText, Skeleton } from "./Shimmer";
import { loadingLabel, skeletonKindOf } from "./skeleton-kind";
import type { SkeletonKind } from "./skeleton-kind";
import { AsciiLoading } from "../ascii-reveal/AsciiReveal";
import "./shimmer-loader.css";

/**
 * The skeleton of a workspace page: its frame drawn in the shapes of what will arrive, shown while the page's code or its data loads.
 * Every workspace section has one (`skeletonKindOf`). It appears after a short delay (so a fast load never flashes it) and tells assistive
 * technology that the area is busy. Pass `immediate` where the person has already been waiting (a screen that failed over to a retry).
 */
export function SectionSkeleton({ section, immediate = false, label }: { section: string; immediate?: boolean; label?: string }) {
  const { t: uiText } = useWorkspaceI18n();
  const kind = skeletonKindOf(section);
  return <div className={`shm-page shm-page--${kind}${kind === "canvas" || kind === "preferences" ? "" : " workspace-page"}`} data-immediate={immediate ? "" : undefined} data-kind={kind} role="status" aria-busy="true" aria-live="polite" style={kind === "canvas" ? { height: "100%", gap: 0 } : undefined}>
    <span className="shm-sr">{uiText(label ?? loadingLabel(section))}</span>
    <AsciiLoading />
    {kind === "home" ? <Home /> : kind === "table" ? <Table /> : kind === "reports" ? <Reports /> : kind === "chat" ? <Chat /> : kind === "files" ? <Files /> : kind === "run" ? <Run />
      : kind === "canvas" ? <Canvas text={label ?? loadingLabel(section)} /> : kind === "trace" ? <Trace /> : kind === "invoice" ? <Invoice /> : kind === "preferences" ? <Preferences /> : <Settings />}
  </div>;
}

const Title = ({ withButton = true }: { withButton?: boolean }) => <div className="shm-head">
  <div className="shm-col" style={{ flex: "0 1 320px" }}><Skeleton width={180} height={22} radius={6} /><Skeleton width="80%" height={12} /></div>
  {withButton && <Skeleton width={104} height={32} radius={8} />}
</div>;

const Stat = () => <div className="shm-card"><Skeleton width={70} height={10} /><Skeleton width={96} height={24} radius={6} /><Skeleton width="60%" height={10} /></div>;
const Person = ({ lines = 2 }: { lines?: number }) => <div className="shm-row"><Skeleton circle width={32} /><div className="shm-col"><Skeleton width="55%" height={11} />{lines > 1 && <Skeleton width="35%" height={9} />}</div></div>;

function Home() {
  return <>
    <Title />
    <div className="shm-grid" data-cols="4">{[0, 1, 2, 3].map(index => <Stat key={index} />)}</div>
    <div className="shm-grid" data-cols="2">
      <div className="shm-card" style={{ gap: 16 }}><Skeleton width={120} height={14} />{[0, 1, 2, 3, 4].map(index => <Person key={index} />)}</div>
      <div className="shm-card" style={{ gap: 16 }}><Skeleton width={140} height={14} />{[0, 1, 2, 3].map(index => <Person key={index} />)}</div>
    </div>
  </>;
}

function Table() {
  return <>
    <div className="shm-row" style={{ gap: 8 }}><Skeleton width={16} height={16} radius={4} /><Skeleton width={56} height={12} /><Skeleton width={4} height={12} /><Skeleton width={132} height={28} radius={8} /><span style={{ flex: 1 }} /><Skeleton width={28} height={28} radius={8} /><Skeleton width={28} height={28} radius={8} /></div>
    <div className="shm-row" style={{ gap: 10 }}>{[84, 72, 96, 64].map((width, index) => <Skeleton key={index} width={width} height={26} radius={8} />)}</div>
    <div className="shm-table">
      <div className="shm-row" style={{ minHeight: 36 }}>{[80, 60, 70, 56].map((width, index) => <Skeleton key={index} width={width} height={9} />)}</div>
      {Array.from({ length: 9 }, (_, index) => <div className="shm-row" key={index}>
        <div className="shm-row"><Skeleton circle width={24} /><Skeleton width={`${46 + (index * 13) % 30}%`} height={11} /></div>
        <Skeleton width={`${50 + (index * 17) % 35}%`} height={10} /><Skeleton width="55%" height={10} /><Skeleton width={56} height={20} radius={5} />
      </div>)}
    </div>
  </>;
}

function Reports() {
  return <>
    <Title />
    <div className="shm-grid" data-cols="4">{[0, 1, 2, 3].map(index => <Stat key={index} />)}</div>
    <div className="shm-grid" data-cols="2">
      {[0, 1].map(index => <div className="shm-card" key={index} style={{ gap: 14 }}><Skeleton width={150} height={14} /><div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 160 }}>{[40, 64, 52, 90, 72, 120, 96, 140, 110, 130].map((height, bar) => <Skeleton key={bar} width="100%" height={height} radius={4} />)}</div></div>)}
    </div>
  </>;
}

function Chat() {
  return <div style={{ display: "grid", justifyItems: "center", gap: 22, paddingTop: "10vh" }}>
    <Skeleton circle width={44} />
    <div className="shm-col" style={{ justifyItems: "center", width: "min(100%, 460px)" }}><Skeleton width={260} height={24} /><Skeleton width={340} height={12} /></div>
    <div className="shm-card" style={{ width: "min(100%, 640px)", gap: 14, padding: 14 }}><Skeleton width="70%" height={12} /><div className="shm-row"><Skeleton width={28} height={28} radius={8} /><Skeleton width={28} height={28} radius={8} /><span style={{ flex: 1 }} /><Skeleton width={32} height={32} radius={16} /></div></div>
    <div className="shm-row" style={{ flexWrap: "wrap", justifyContent: "center" }}>{[132, 112, 148, 120].map((width, index) => <Skeleton key={index} width={width} height={32} radius={16} />)}</div>
  </div>;
}

function Files() {
  return <>
    <Title />
    <div className="shm-row" style={{ gap: 8 }}><Skeleton width={220} height={32} radius={8} /><span style={{ flex: 1 }} /><Skeleton width={72} height={32} radius={8} /><Skeleton width={72} height={32} radius={8} /></div>
    <div className="shm-grid" data-cols="4">{Array.from({ length: 8 }, (_, index) => <div className="shm-card" key={index}><Skeleton height={96} radius={8} /><Skeleton width="70%" height={11} /><Skeleton width="40%" height={9} /></div>)}</div>
  </>;
}

function Run() {
  return <>
    <Title />
    <div className="shm-card" style={{ gap: 16, maxWidth: 760 }}>
      <Skeleton width="45%" height={16} />
      {[0, 1, 2, 3, 4].map(index => <div className="shm-row" key={index}><Skeleton circle width={20} /><div className="shm-col"><Skeleton width={`${50 + (index * 11) % 40}%`} height={11} /><Skeleton width="30%" height={9} /></div><Skeleton width={52} height={20} radius={5} /></div>)}
    </div>
  </>;
}

/** A map or process page: a dotted canvas with its floating controls and a few blocks, which is what arrives. */
function Canvas({ text }: { text: string }) {
  const { t: uiText } = useWorkspaceI18n();
  const block = (style: CSSProperties, key: number) => <div className="shm-block" style={style} key={key}><div className="shm-row"><Skeleton width={22} height={22} radius={6} /><div className="shm-col"><Skeleton width="60%" height={10} /><Skeleton width="38%" height={8} /></div></div><Skeleton width="92%" height={9} /><Skeleton width="64%" height={9} /></div>;
  return <div className="shm-canvas" style={{ flex: 1 }}>
    <div className="shm-float" style={{ left: 14, top: 14, width: 300 }}><Skeleton width={150} height={14} /><span style={{ flex: 1 }} /><Skeleton width={56} height={20} radius={5} /><Skeleton width={24} height={24} radius={6} /></div>
    <div className="shm-float" style={{ right: 14, top: 14 }}><Skeleton width={56} height={14} /><Skeleton width={56} height={28} radius={8} /><Skeleton width={64} height={12} /></div>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden="true"><g fill="none" stroke="rgba(128,128,128,.28)" strokeWidth="1.5" strokeDasharray="6 6" vectorEffect="non-scaling-stroke"><path vectorEffect="non-scaling-stroke" d="M50 46 C50 34 38 30 32 28" /><path vectorEffect="non-scaling-stroke" d="M50 46 C58 40 62 36 70 34" /><path vectorEffect="non-scaling-stroke" d="M50 46 C52 58 56 64 60 70" /><path vectorEffect="non-scaling-stroke" d="M50 46 C42 56 38 62 30 68" /></g></svg>
    {uiText([{ left: "calc(50% - 116px)", top: "38%" }, { left: "calc(22% - 40px)", top: "18%" }, { left: "calc(66% - 20px)", top: "22%" }, { left: "calc(54% - 40px)", top: "64%" }, { left: "calc(18% - 20px)", top: "58%" }].map((style, index) => block(style, index)))}
    <div style={{ position: "absolute", left: "50%", top: "calc(38% + 150px)", transform: "translateX(-50%)", fontSize: 13, whiteSpace: "nowrap" }} aria-hidden="true"><ShimmerText>{uiText(text)}</ShimmerText></div>
    <div className="shm-float" style={{ left: "50%", bottom: 14, transform: "translateX(-50%)", padding: "8px 10px" }}><Skeleton width={92} height={28} radius={8} /><Skeleton width={28} height={28} radius={8} /><Skeleton width={28} height={28} radius={8} /><Skeleton width={96} height={28} radius={8} /></div>
    <div className="shm-float" style={{ left: 14, bottom: 14, padding: "6px 8px" }}><Skeleton width={28} height={22} radius={6} /><Skeleton width={36} height={12} /><Skeleton width={28} height={22} radius={6} /></div>
  </div>;
}

function Trace() {
  return <>
    <Title />
    <div className="shm-card" style={{ padding: 0, gap: 0, overflow: "hidden" }}>
      <div className="shm-row" style={{ padding: "12px 16px", borderBottom: ".5px solid rgba(128,128,128,.2)" }}><Skeleton width={16} height={16} radius={4} /><Skeleton width={48} height={13} /><Skeleton width="40%" height={12} /><span style={{ flex: 1 }} /><Skeleton width={44} height={20} radius={5} /></div>
      <div className="shm-grid" data-cols="4" style={{ gap: 0, padding: "12px 16px", borderBottom: ".5px solid rgba(128,128,128,.2)" }}>{[0, 1, 2, 3].map(index => <div className="shm-col" key={index} style={{ padding: "0 8px" }}><Skeleton width={56} height={9} /><Skeleton width={64} height={20} radius={5} /></div>)}</div>
      <div style={{ display: "grid", padding: "8px 10px 18px" }}>{Array.from({ length: 9 }, (_, index) => <div className="shm-row" key={index} style={{ minHeight: 30, paddingLeft: 14 * Math.min(2, index % 3) }}>
        <div className="shm-row" style={{ width: 232, flex: "0 0 auto", gap: 8 }}><Skeleton width={20} height={20} radius={5} /><Skeleton width={`${50 + (index * 9) % 40}%`} height={11} /></div>
        <div style={{ flex: 1, paddingLeft: `${(index * 7) % 40}%` }}><Skeleton width={`${18 + (index * 11) % 40}%`} height={14} radius={4} /></div>
      </div>)}</div>
    </div>
  </>;
}

function Invoice() {
  return <div style={{ display: "grid", justifyItems: "center" }}><div className="shm-card" style={{ width: "min(100%, 760px)", gap: 22, padding: 28 }}>
    <div className="shm-head"><Skeleton width={150} height={22} /><Skeleton width={90} height={22} radius={5} /></div>
    <div className="shm-grid" data-cols="2"><div className="shm-col"><Skeleton width={60} height={9} /><Skeleton width="80%" height={12} /><Skeleton width="60%" height={12} /></div><div className="shm-col"><Skeleton width={60} height={9} /><Skeleton width="70%" height={12} /><Skeleton width="50%" height={12} /></div></div>
    <div className="shm-table">{[0, 1, 2, 3].map(index => <div className="shm-row" key={index}><Skeleton width="70%" height={11} /><Skeleton width={40} height={11} /><Skeleton width={60} height={11} /></div>)}</div>
    <div style={{ display: "grid", justifyItems: "end", gap: 8 }}><Skeleton width={160} height={12} /><Skeleton width={200} height={20} radius={5} /></div>
  </div></div>;
}

/** The Settings page: its header with the search field, a navigation column and rows of a label, a hint and a control. */
function Preferences() {
  return <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 208px) minmax(0, 1fr)", gridTemplateRows: "56px minmax(0, 1fr)", height: "100%", minHeight: 420 }}>
    <div className="shm-row" style={{ gridColumn: "1 / -1", justifyContent: "space-between", padding: "0 12px 0 20px", borderBottom: ".5px solid rgba(128,128,128,.2)" }}><Skeleton width={64} height={14} /><Skeleton width={300} height={34} radius={10} /></div>
    <div className="shm-col" style={{ padding: "12px 8px", gap: 10, borderRight: ".5px solid rgba(128,128,128,.2)" }}>{[0, 1, 2, 3, 4, 5].map(index => <Skeleton key={index} height={28} radius={8} />)}</div>
    <div className="shm-col" style={{ padding: "28px 32px", gap: 22, maxWidth: 684 }}>
      <div className="shm-col"><Skeleton width={90} height={14} /><Skeleton width="70%" height={11} /></div>
      {[0, 1, 2, 3, 4].map(index => <div className="shm-row" key={index} style={{ justifyContent: "space-between", gap: 24 }}><div className="shm-col" style={{ flex: 1 }}><Skeleton width={`${34 + (index * 9) % 30}%`} height={12} /><Skeleton width="70%" height={10} /></div><Skeleton width={index % 2 ? 42 : 200} height={index % 2 ? 24 : 32} radius={index % 2 ? 12 : 9} /></div>)}
    </div>
  </div>;
}

function Settings() {
  return <>
    <Title withButton={false} />
    <div className="shm-row" style={{ gap: 18 }}>{[64, 72, 96, 60].map((width, index) => <Skeleton key={index} width={width} height={14} />)}</div>
    <div className="shm-card" style={{ maxWidth: 640, gap: 18 }}>{[0, 1, 2, 3].map(index => <div className="shm-col" key={index}><Skeleton width={90} height={10} /><Skeleton width="100%" height={34} radius={8} /></div>)}<Skeleton width={96} height={32} radius={8} /></div>
  </>;
}

export type { SkeletonKind };
