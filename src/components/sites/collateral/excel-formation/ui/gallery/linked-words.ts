import { useEffect, type RefObject } from "react";

/**
 * Ties the replay to the table of words under it, without either knowing about the other: a word hovered or focused in one lights the same word
 * in the other; a click on a word of the answer jumps to its row; 1 to 4 choose a candidate and the arrows move between rows. Nothing here
 * changes a value by itself: choosing still goes through the table's own buttons.
 */
export function useLinkedWords(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const wordOf = (target: EventTarget | null) => (target as HTMLElement | null)?.closest?.<HTMLElement>("[data-word], [data-word-row]") ?? null;
    const indexOf = (element: HTMLElement | null) => element?.getAttribute("data-word") ?? element?.getAttribute("data-word-row") ?? null;
    const mark = (index: string | null) => {
      node.querySelectorAll("[data-hot]").forEach(element => element.removeAttribute("data-hot"));
      if (index !== null) node.querySelectorAll(`[data-word="${index}"], [data-word-row="${index}"]`).forEach(element => element.setAttribute("data-hot", ""));
    };
    const rows = () => [...node.querySelectorAll<HTMLElement>("[data-word-row]")];
    const entry = (row: HTMLElement | undefined) => row?.querySelector<HTMLElement>('.sd-alt[aria-pressed="true"], .sd-keep[aria-pressed="true"]') ?? row?.querySelector<HTMLElement>(".sd-alt, .sd-keep, input");
    const jump = (index: string | null) => {
      const row = index === null ? null : node.querySelector<HTMLElement>(`[data-word-row="${index}"]`);
      if (!row) return;
      entry(row)?.focus({ preventScroll: true });
      row.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      row.removeAttribute("data-flash"); void row.offsetWidth; row.setAttribute("data-flash", "");
      window.setTimeout(() => row.removeAttribute("data-flash"), 950);
    };
    const over = (event: Event) => mark(indexOf(wordOf(event.target)));
    const out = () => mark(null);
    const click = (event: MouseEvent) => { const token = (event.target as HTMLElement).closest<HTMLElement>(".sdr-tok[data-jump]"); if (token) jump(indexOf(token)); };
    const keys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches(".sdr-tok[data-jump]") && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); jump(indexOf(target)); return; }
      const row = target.closest<HTMLElement>("[data-word-row]");
      if (!row || target.matches("input, textarea, select") || event.ctrlKey || event.metaKey || event.altKey) return;
      if (/^[1-4]$/.test(event.key)) { const chip = row.querySelectorAll<HTMLElement>(".sd-alt")[Number(event.key) - 1]; if (chip) { event.preventDefault(); chip.click(); chip.focus({ preventScroll: true }); } return; }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const all = rows(), at = all.indexOf(row), next = all[at + (event.key === "ArrowDown" ? 1 : -1)];
        if (next) { event.preventDefault(); entry(next)?.focus(); }
      }
    };
    node.addEventListener("mouseover", over); node.addEventListener("focusin", over); node.addEventListener("mouseout", out); node.addEventListener("focusout", out);
    node.addEventListener("click", click); node.addEventListener("keydown", keys);
    return () => { node.removeEventListener("mouseover", over); node.removeEventListener("focusin", over); node.removeEventListener("mouseout", out); node.removeEventListener("focusout", out); node.removeEventListener("click", click); node.removeEventListener("keydown", keys); mark(null); };
  });
}
