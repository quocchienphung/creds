/** Reparent the live sheet before its old frame unmounts. append() can reset native scroll. */
export function moveSheetHost(host: HTMLDivElement, slot: HTMLDivElement) {
  if (host.parentElement === slot) return;
  const scroller = host.querySelector<HTMLElement>(".sv-scroll");
  const x = scroller?.scrollLeft ?? 0, y = scroller?.scrollTop ?? 0;
  slot.append(host);
  if (scroller) { scroller.scrollLeft = x; scroller.scrollTop = y; }
}
