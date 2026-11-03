"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { notesLayoutKey } from "./ArtworkNotes";
import { frameStyle, frameAttribute } from "./frame-style";
import { Mark } from "../affectui-agent-tree/tree-marks";
import { artistAgents } from "./studio-timeline";
import "./agent-comments.css";

type CommentId = "history" | "moonlight" | "brushwork" | "framing";
interface CommentNote {
  id: CommentId;
  agent: string;
  at: number;
  until: number;
  text: string;
}

const comments: readonly CommentNote[] = [
  { id: "history", agent: "researcher", at: 2400, until: 5200, text: "Saint-Rémy, June 1889 — not 1888. Updating the date in the story." },
  { id: "moonlight", agent: "colorist", at: 5500, until: 8300, text: "Keeping the moonlight warm. The blue strokes can flow around it." },
  { id: "brushwork", agent: "writer", at: 8600, until: 11300, text: "A quiet village, a sky alive with motion. The story and painting now move together." },
  { id: "framing", agent: "framer", at: 11500, until: 13800, text: "Hand-finished moulding, corner by corner. A frame worthy of this little world." },
];

export function AgentComments({ elapsed, reduced, onInteractionChange }: {
  elapsed: number;
  reduced: boolean;
  onInteractionChange: (active: boolean) => void;
}) {
  const held = useRef(new Set<CommentId>());
  const layer = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<CommentId | null>(null);
  const scheduled = comments.find(note => elapsed >= note.at && elapsed < note.until)?.id ?? null;
  useEffect(() => () => { onInteractionChange(false); }, [onInteractionChange]);

  const place = useCallback(() => {
    const node = layer.current;
    const page = node?.closest(".guide-intro");
    if (!node || !page) return;
    const bounds = node.getBoundingClientRect();
    const documentBounds = node.parentElement?.getBoundingClientRect() ?? bounds;
    const mobile = page.querySelector<HTMLElement>('[data-comment-space="mobile"]');
    const compact = Boolean(mobile?.offsetHeight);
    const painting = page.querySelector("[data-painting-frame]")?.getBoundingClientRect();
    if (!painting) return;
    const geometry = (["left", "right"] as const).map(side => {
      const space = compact ? mobile : page.querySelector<HTMLElement>(`[data-comment-space="${side}"]`);
      const prose = page.querySelector(`.artwork-note--${side} .artwork-note__body`);
      const detail = page.querySelector(`.artwork-note--${side} .artwork-note__detail`);
      if (!space || !prose || !detail) return null;
      const range = document.createRange(); range.selectNodeContents(prose);
      return {slot:space.getBoundingClientRect(), prose:prose.getBoundingClientRect(), detail:detail.getBoundingClientRect(), written:range.getBoundingClientRect()};
    });
    // Finish every layout read before changing any card width, position or pin style.
    const placements = comments.map(note => {
      const item = node.querySelector<HTMLElement>(`[data-comment="${note.id}"]`);
      const side = note.id === "moonlight" || note.id === "brushwork" ? "right" : "left";
      const g = geometry[side === "left" ? 0 : 1];
      if (!item || !g) return null;
      const {slot,prose,detail,written}=g;
      const width = Math.min(compact ? 330 : 282, slot.width + (compact ? 0 : 24));
      const x = compact ? slot.left + (slot.width - width) / 2 : slot.left - (side === "left" ? 24 : 0);
      let y = slot.top + 4;
      if (!compact) {
        const cardHeight = item.querySelector<HTMLElement>(".studio-comment__card")?.offsetHeight ?? 145;
        const lower = Math.max(prose.top, written.bottom) + 12;
        const upper = detail.top - cardHeight - 12;
        const desired = note.id === "framing" ? painting.top + painting.height * .5 - cardHeight / 2 : lower;
        y = Math.max(lower, Math.min(Math.max(lower, upper), desired));
      }
      const pinX = note.id === "framing" ? painting.left - (compact ? 24 : 28) : note.id === "moonlight" ? painting.right + 5 : prose.left - (compact ? 20 : 28);
      const pinY = note.id === "framing" ? painting.top + painting.height * .48 : note.id === "moonlight" ? painting.top + 28 : prose.top + 2;
      return {item,side,width,x,y,pinX,pinY};
    });
    for (const p of placements) {
      if (!p) continue;
      const {item,side,width,x,y,pinX,pinY}=p;
      frameStyle(item, "--comment-x", `${x - bounds.left}px`);
      frameStyle(item, "--comment-width", `${width}px`);
      frameStyle(item, "--comment-y", `${y - bounds.top}px`);
      frameStyle(item, "--pin-x", `${Math.max(documentBounds.left + 1, Math.min(documentBounds.right - 27, pinX)) - bounds.left}px`);
      frameStyle(item, "--pin-y", `${pinY - bounds.top}px`);
      frameAttribute(item, "data-placement", compact ? "beside-artwork" : side);
      frameStyle(item, "--comment-origin", `${Math.max(16, Math.min(width - 16, pinX - x + 13))}px top`);
    }
  }, []);
  const textLayout = notesLayoutKey("left", elapsed) + notesLayoutKey("right", elapsed);
  useLayoutEffect(place, [textLayout, selected, place]);
  useEffect(() => {
    const page = layer.current?.closest(".guide-intro");
    if (!page) return;
    const observer = new ResizeObserver(place); observer.observe(page);
    for (const card of page.querySelectorAll(".studio-comment__card")) observer.observe(card);
    return () => observer.disconnect();
  }, [place]);

  const interact = (id: CommentId, active: boolean) => {
    if (active) { held.current.add(id); setSelected(id); }
    else { held.current.delete(id); setSelected(current => current === id ? null : current); }
    onInteractionChange(held.current.size > 0);
  };

  return <div ref={layer} className="studio-comments" data-reduced={reduced} aria-label="Agent comments">
    {comments.map((note, index) => <AgentComment key={note.id} note={note} index={index} selected={(selected ?? scheduled) === note.id} elapsed={elapsed} reduced={reduced} onInteract={interact} />)}
  </div>;
}

function AgentComment({ note, index, selected, elapsed, reduced, onInteract }: {
  note: CommentNote;
  index: number;
  selected: boolean;
  elapsed: number;
  reduced: boolean;
  onInteract: (id: CommentId, active: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [draft, setDraft] = useState("");
  const [replies, setReplies] = useState<string[]>([]);
  const pin = useRef<HTMLButtonElement>(null);
  const collapsing = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current); }, []);
  const agent = artistAgents.find(item => item.id === note.agent) ?? artistAgents[0];
  const visible = elapsed >= note.at && elapsed < 14300 && !resolved && !reduced;
  const open = visible && !dismissed && selected;
  const body = hovered || focused || pinned ? note.text : note.text.slice(0, Math.floor(Math.max(0, elapsed - note.at - 140) / 18));
  const style = { "--comment-index": index, "--comment-color": agent.color } as CSSProperties;

  const close = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    collapsing.current = true;
    setDismissed(true); setPinned(false); setHovered(false); setFocused(false);
    onInteract(note.id, false);
    pin.current?.focus();
  };

  return <div className="studio-comment" style={style} data-comment={note.id} data-visible={visible} data-open={open} inert={!visible} aria-hidden={!visible}
    onPointerEnter={() => { if (!visible) return; collapsing.current = false; if (leaveTimer.current) clearTimeout(leaveTimer.current); setHovered(true); setDismissed(false); onInteract(note.id, true); }}
    onPointerLeave={() => {
      setHovered(false);
      if (!focused && !pinned) leaveTimer.current = setTimeout(() => onInteract(note.id, false), 280);
    }}
    onFocusCapture={() => { if (collapsing.current) return; setFocused(true); onInteract(note.id, true); }}
    onBlurCapture={event => {
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
      setFocused(false); if (!hovered && !pinned) onInteract(note.id, false);
    }}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <button ref={pin} type="button" className="studio-comment__pin" aria-label={`Comment from ${agent.name}: ${note.text}`} aria-expanded={open} aria-controls={`studio-comment-${note.id}`}
      tabIndex={open ? -1 : 0} onClick={() => {
        if (pinned) close(); else { collapsing.current = false; setPinned(true); setDismissed(false); onInteract(note.id, true); }
      }}><Mark id={agent.mark} /></button>
    <section id={`studio-comment-${note.id}`} className="studio-comment__card" role="dialog" aria-label={`Comment from ${agent.name}`} aria-hidden={!open} inert={!open}>
      <header className="studio-comment__header">
        <button type="button" className="studio-comment__mark" aria-label={`Collapse comment from ${agent.name}`} onClick={close}><Mark id={agent.mark} /></button>
        <strong>{agent.name}</strong><span>now</span>
      </header>
      <div className="studio-comment__discussion">
        <p className="studio-comment__text" aria-hidden="true">{body}<span className="studio-comment__caret" data-typing={body.length < note.text.length} /></p>
        <p className="guide-intro__sr">{note.text}</p>
        {replies.length > 0 && <div className="studio-comment__replies" aria-live="polite">{replies.map((reply, index) => <p key={`${index}-${reply}`}><span>You</span>{reply}</p>)}</div>}
      </div>
      <form className="studio-comment__reply" onSubmit={event => {
        event.preventDefault(); const text = draft.trim();
        if (!text) return;
        setReplies(previous => [...previous.slice(-1), text]); setDraft("");
      }}>
        <input aria-label={`Reply to ${agent.name}`} placeholder="Reply" value={draft} maxLength={240} onChange={event => setDraft(event.target.value)} autoComplete="off" />
        <button type="button" className="studio-comment__resolve" aria-label={`Resolve comment from ${agent.name}`} onClick={() => {
          if (leaveTimer.current) clearTimeout(leaveTimer.current);
          setResolved(true); setPinned(false); setHovered(false); setFocused(false); onInteract(note.id, false);
        }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 12 4 4 8-8" /></svg></button>
      </form>
    </section>
  </div>;
}
