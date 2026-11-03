"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { MenuSurface } from "@/components/interaction/MenuSurface";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { NotificationStack } from "../affectui-notification-stack/NotificationStack";
import type { Notice } from "../affectui-notification-stack/stack-model";
import { isUnseen, outlastsReading, placePopover, placeSpark, sparkTone } from "./notice-spark-model";
import type { Placed, ScreenBox, ScreenInset, ScreenSize } from "./notice-spark-model";
import "./notice-spark.css";

/**
 * Run notifications on the map: a block that has something to say carries a small blinking four-point star beside it. Clicking the star
 * opens that block's notices (the Notification Stack) in a card right next to the block, so nothing keeps a corner of the map for itself.
 * The star blinks until it has been opened once, takes the colour of the loudest notice behind it (a failure is red), shows how many there
 * are, and stays at the edge of the map when its block is out of view. Escape or a click anywhere else closes the card.
 */
export interface NoticeSparksProps {
  groups: readonly Placed<Notice>[];
  /** The block's box in screen coordinates of the map (null when it is not drawn). */
  screenBox: (blockId: string) => ScreenBox | null;
  nameOf: (blockId: string) => string;
  viewport: ScreenSize;
  inset?: ScreenInset;
  /** Notices that were opened already: their star stops blinking. */
  seen: ReadonlySet<string>;
  onSeen: (ids: string[]) => void;
  onDismiss: (id: string) => void;
}

/** The four-point star with concave sides, as drawn by Gemini's mark. */
const STAR = "M12 1.5C12 7.6 16.4 12 22.5 12C16.4 12 12 16.4 12 22.5C12 16.4 7.6 12 1.5 12C7.6 12 12 7.6 12 1.5Z";

export function NoticeSparks({ groups, screenBox, nameOf, viewport, inset, seen, onSeen, onDismiss }: NoticeSparksProps) {
  const { t: uiText } = useWorkspaceI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  const gradient = useId();
  const sparks = useRef(new Map<string, HTMLButtonElement>());
  const card = useRef<HTMLDivElement | null>(null);
  const layer = useRef<HTMLDivElement | null>(null);
  const open = groups.find(group => group.blockId === openId) ?? null;

  // Closing is what counts as having read the notices that were in the card; the star then stops blinking
  const close = (restoreFocus: boolean) => {
    if (!open) return;
    onSeen(open.notices.map(notice => notice.id).filter(id => !seen.has(id)));
    setOpenId(null);
    // The focus goes back to the star; a star that is about to go (its notices were quiet) leaves it on the block
    if (restoreFocus) (open.notices.some(outlastsReading) ? sparks.current.get(open.blockId) : layer.current?.parentElement?.querySelector<HTMLElement>(`[data-block="${CSS.escape(open.blockId)}"]`))?.focus({ preventScroll: true });
  };
  const latest = useRef(close);
  useEffect(() => { latest.current = close; });

  // A click anywhere outside the card and its star closes it
  const openBlock = open?.blockId;
  useEffect(() => {
    if (!openBlock) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (card.current?.contains(target) || sparks.current.get(openBlock)?.contains(target)) return;
      latest.current(false);
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [openBlock]);
  // The card takes the focus when it opens, so Tab goes through its buttons
  useEffect(() => { if (openBlock) card.current?.querySelector<HTMLElement>(".nsc__btn, .nsc__close")?.focus({ preventScroll: true }); }, [openBlock]);

  const shown = groups.flatMap(group => {
    const box = screenBox(group.blockId);
    return box ? [{ group, box, spark: placeSpark(box, viewport, inset) }] : [];
  });
  const current = open ? shown.find(item => item.group.blockId === open.blockId) : undefined;
  const place = current ? placePopover(current.spark.pinned ? { x: current.spark.x - 14, y: current.spark.y - 14, w: 28, h: 28 } : current.box, viewport, inset) : null;

  return <div className="pmap__sparks" ref={layer} onKeyDownCapture={(event: ReactKeyboardEvent) => { if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(true); } }}>
    {shown.map(({ group, spark }) => {
      const count = group.notices.length, isOpen = group.blockId === openId, loud = sparkTone(group.notices);
      const blinking = !isOpen && isUnseen(group.notices, seen);
      const label = `${count} notification${count === 1 ? "" : "s"} about ${nameOf(group.blockId)}: ${group.notices.slice(0, 3).map(notice => notice.title).join("; ")}`;
      const id = `${gradient}-${group.blockId}`.replace(/[^\w-]/g, "");
      return <button
        key={group.blockId} type="button" ref={element => { if (element) sparks.current.set(group.blockId, element); else sparks.current.delete(group.blockId); }}
        className="pmap__spark" data-tone={loud} data-blinking={blinking ? "" : undefined} data-open={isOpen ? "" : undefined} data-pinned={spark.pinned ? "" : undefined}
        style={{ left: spark.x, top: spark.y }} aria-label={uiText("{0}. {1}", [label, isOpen ? "Close" : "Open"])} aria-expanded={isOpen} aria-haspopup="dialog"
        onClick={() => { if (isOpen) close(false); else { close(false); setOpenId(group.blockId); } }}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <defs><linearGradient id={id} x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse"><stop offset="0" style={{ stopColor: "var(--spark-a)" }} /><stop offset="1" style={{ stopColor: "var(--spark-b)" }} /></linearGradient></defs>
          <path d={STAR} fill={`url(#${id})`} />
        </svg>
        {count > 1 && <span className="pmap__spark-count" aria-hidden="true">{uiText(count)}</span>}
      </button>;
    })}
    <AnimatePresence>{open && place && <MenuSurface key={open.blockId} ref={card} className="pmap__notice" role="dialog" aria-label={uiText("Notifications for {0}", [nameOf(open.blockId)])} data-side={place.side}
      style={{ left: place.left, width: place.width, top: place.top, bottom: place.bottom }}>
      <NotificationStack notices={open.notices} label={uiText("Notifications for {0}", [nameOf(open.blockId)])}
        onDismiss={notice => onDismiss(notice.id)}
        // "Dismiss all" in the card calls onDismiss for each of its notices first; nothing is left to do here
        onDismissAll={() => {}} />
    </MenuSurface>}</AnimatePresence>
  </div>;
}
