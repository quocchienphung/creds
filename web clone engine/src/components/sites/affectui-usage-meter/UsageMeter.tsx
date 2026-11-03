"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

/*
 * affectUI Usage Meter (https://www.affectui.com/components/usage-meter), rebuilt from the shipped
 * component: a stacked credits meter by category, a daily sparkline, plan limits and a button that
 * speaks up near the limit. `look` picks the classic (`.ui-um`) or clean (`.ui-umc`) stylesheet;
 * both share the same markup and behaviour, only the class prefix differs.
 */

export type UsageMeterLook = "classic" | "clean";
export type UsageState = "ok" | "warn" | "limit";

export interface UsageCategory {
  label: string;
  value: number;
  color?: string;
}

export interface UsageLimit {
  label: string;
  used: number;
  total?: number | null;
  unit?: string;
  decimals?: number;
}

export interface UsagePeriod {
  id: string;
  label: string;
}

export interface UsageDay {
  label: string;
  value: number | null;
}

export interface UsageMeterProps {
  look?: UsageMeterLook;
  total: number;
  used: UsageCategory[];
  limits?: UsageLimit[];
  periods?: UsagePeriod[];
  period?: string;
  defaultPeriod?: string;
  onPeriodChange?: (id: string) => void;
  /** "Resets in N days" label, computed by the caller so rendering stays pure. */
  resetLabel?: string;
  /** Tooltip of the reset label, e.g. "Resets on Oct 28". */
  resetTitle?: string;
  resetAt?: Date;
  daily?: UsageDay[];
  onUpgrade?: (state: UsageState) => void;
  title?: string;
  plan?: string;
  unit?: string;
  warnAt?: number;
  upgradeLabel?: string;
  topUpLabel?: string;
  className?: string;
}

interface Row extends UsageCategory {
  color: string;
  leaving?: boolean;
}

const formatters = new Map<number, Intl.NumberFormat>();
function fmt(value: number, decimals = 0) {
  let f = formatters.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    formatters.set(decimals, f);
  }
  return f.format(value);
}
const withRawUnit = (value: string, unit?: string) => (unit ? `${value} ${unit}` : value);
const easeOutQuart = (t: number) => 1 - (1 - t) ** 4;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    const raf = requestAnimationFrame(sync);
    mq.addEventListener("change", sync);
    return () => {
      cancelAnimationFrame(raf);
      mq.removeEventListener("change", sync);
    };
  }, []);
  return reduced;
}

/**
 * Every number and width runs through one frame loop so they stay in step: the first non-zero target
 * counts up over `first` ms, later changes roll over `next` ms (ease-out quart).
 */
function useTween(targets: Record<string, number>, first: number, next: number, reduced: boolean) {
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(Object.keys(targets).map((k) => [k, 0])),
  );
  const current = useRef(values);
  const started = useRef(false);
  const key = JSON.stringify(targets);

  useEffect(() => {
    const goal = JSON.parse(key) as Record<string, number>;
    const from = { ...current.current };
    const live = Object.values(goal).some((v) => v !== 0);
    const duration = live && !started.current ? first : next;
    if (live) started.current = true;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = reduced ? 1 : Math.min(1, (now - t0) / duration);
      const e = easeOutQuart(p);
      const out: Record<string, number> = {};
      for (const k in goal) out[k] = (from[k] ?? 0) + (goal[k] - (from[k] ?? 0)) * e;
      current.current = out;
      setValues(out);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [key, first, next, reduced]);

  return (k: string) => values[k] ?? 0;
}

/** Glide the switch pill onto the checked option (no transition on the first placement). */
function placePill(group: HTMLElement | null, pill: HTMLElement | null) {
  if (!group || !pill) return;
  const target = group.querySelector<HTMLElement>('[aria-checked="true"]');
  if (!target || !target.offsetWidth) {
    pill.style.opacity = "0";
    return;
  }
  const first = !pill.dataset.ready;
  if (first) pill.style.transition = "none";
  pill.style.opacity = "1";
  pill.style.width = `${target.offsetWidth}px`;
  pill.style.height = `${target.offsetHeight}px`;
  pill.style.transform = `translate(${target.offsetLeft}px, ${target.offsetTop}px)`;
  if (first) {
    pill.dataset.ready = "1";
    void pill.offsetWidth;
    pill.style.transition = "";
  }
}

/** Keep categories that dropped out in place (value 0, `leaving`) so their row can fold away. */
function mergeLeaving(previous: Row[], next: Row[]) {
  const rows = [...next];
  previous.forEach((row, i) => {
    if (!next.some((n) => n.label === row.label)) rows.splice(Math.min(i, rows.length), 0, { ...row, value: 0, leaving: true });
  });
  return rows;
}

export function UsageMeter({
  look = "classic",
  total,
  used,
  limits = [],
  periods,
  period,
  defaultPeriod,
  onPeriodChange,
  resetLabel,
  resetTitle,
  resetAt,
  daily,
  onUpgrade,
  title = "Usage",
  plan,
  unit = "credits",
  warnAt = 0.8,
  upgradeLabel = "Upgrade",
  topUpLabel = "Add credits",
  className,
}: UsageMeterProps) {
  const { t: uiText } = useWorkspaceI18n();
  const withUnit = (value: string, suffix?: string) => withRawUnit(value, uiText(suffix));
  const p = look === "clean" ? "ui-umc" : "ui-um";
  const id = useId();
  const rootRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const switchRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const actionInnerRef = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  const [ownPeriod, setOwnPeriod] = useState(defaultPeriod ?? periods?.[0]?.id);
  const activePeriod = period ?? ownPeriod;
  const [seen, setSeen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [tipLabel, setTipLabel] = useState<string | null>(null);
  const [day, setDay] = useState<number | null>(null);

  const palette = [1, 2, 3, 4, 5].map((n) => `var(--${p}-c${n})`);
  const incoming: Row[] = used.map((u, i) => ({ ...u, color: u.color ?? palette[i % palette.length] }));
  const signature = used.map((u) => `${u.label}:${u.value}:${u.color ?? ""}`).join("|");
  const [rows, setRows] = useState<Row[]>(incoming);
  const [rowsSignature, setRowsSignature] = useState(signature);
  if (rowsSignature !== signature) {
    setRowsSignature(signature);
    setRows(mergeLeaving(rows.filter((r) => !r.leaving), incoming));
  }
  const hasLeaving = rows.some((r) => r.leaving);
  useEffect(() => {
    if (!hasLeaving) return;
    const t = window.setTimeout(() => setRows((rs) => rs.filter((r) => !r.leaving)), 460);
    return () => window.clearTimeout(t);
  }, [hasLeaving, rowsSignature]);

  // First view: the bar fills from zero and the numbers count up.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      const raf = requestAnimationFrame(() => setSeen(true));
      return () => cancelAnimationFrame(raf);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const usedTotal = used.reduce((s, u) => s + Math.max(0, u.value), 0);
  const ratio = total > 0 ? usedTotal / total : 0;
  const state: UsageState = ratio >= 1 ? "limit" : ratio >= warnAt ? "warn" : "ok";
  const scale = Math.max(total, usedTotal) || 1;

  const targets: Record<string, number> = { used: usedTotal, left: Math.max(0, total - usedTotal), pct: ratio * 100 };
  rows.forEach((r) => (targets[`r:${r.label}`] = r.leaving ? 0 : Math.max(0, r.value)));
  limits.forEach((l) => (targets[`l:${l.label}`] = l.used));
  daily?.forEach((d, i) => (targets[`d:${i}`] = d.value ?? 0));
  if (!seen) for (const k in targets) targets[k] = 0;
  const tween = useTween(targets, 1200, 650, reduced);

  const widths = rows.map((r) => (tween(`r:${r.label}`) / scale) * 100);
  const segments = rows.map((r, i) => ({
    ...r,
    left: widths.slice(0, i).reduce((a, b) => a + b, 0),
    width: widths[i],
  }));
  const activeRow = rows.find((r) => r.label === active && !r.leaving);
  const tipRow = rows.find((r) => r.label === tipLabel);
  const tipSeg = segments.find((s) => s.label === tipLabel);
  const tipX = tipSeg ? Math.min(100, Math.max(0, tipSeg.left + tipSeg.width / 2)) : 50;

  const highlight = (label: string | null) => {
    setActive(label);
    if (label) setTipLabel(label);
  };
  const labelAt = (e: PointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    return segments.find((s) => !s.leaving && s.width > 0 && x >= s.left && x <= s.left + s.width)?.label ?? null;
  };
  const onBarKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const parts = rows.filter((r) => !r.leaving && r.value > 0);
    if (!parts.length) return;
    const i = parts.findIndex((r) => r.label === active);
    if (e.key === "ArrowRight") highlight(parts[(i + 1) % parts.length].label);
    else if (e.key === "ArrowLeft") highlight(parts[(i - 1 + parts.length) % parts.length].label);
    else if (e.key === "Escape") highlight(null);
    else return;
    e.preventDefault();
  };

  const days = daily ?? [];
  const dayMax = Math.max(1, ...days.map((d) => d.value ?? 0));
  const pastDays = days.filter((d) => d.value !== null);
  const average = pastDays.length ? pastDays.reduce((s, d) => s + (d.value ?? 0), 0) / pastDays.length : 0;
  const dayAt = (e: PointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - rect.left) / rect.width) * days.length);
    return Math.min(days.length - 1, Math.max(0, i));
  };
  const onSparkKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!days.length) return;
    if (e.key === "ArrowRight") setDay((d) => Math.min(days.length - 1, d === null ? 0 : d + 1));
    else if (e.key === "ArrowLeft") setDay((d) => Math.max(0, d === null ? days.length - 1 : d - 1));
    else if (e.key === "Escape") setDay(null);
    else return;
    e.preventDefault();
  };
  const dayRead = day === null ? undefined : days[day];
  // A new number of days replays the bars' rise.
  const [dayCount, setDayCount] = useState(days.length);
  const [regrow, setRegrow] = useState(false);
  if (dayCount !== days.length) {
    setDayCount(days.length);
    setRegrow(true);
  }

  const pick = (next: string) => {
    if (next === activePeriod) return;
    if (period === undefined) setOwnPeriod(next);
    onPeriodChange?.(next);
    setActive(null);
    setDay(null);
  };
  const onSwitchKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!periods?.length) return;
    const i = periods.findIndex((o) => o.id === activePeriod);
    let n = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % periods.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + periods.length) % periods.length;
    if (n < 0) return;
    e.preventDefault();
    pick(periods[n].id);
    switchRef.current?.querySelectorAll<HTMLElement>("[role=radio]")[n]?.focus();
  };

  useLayoutEffect(() => placePill(switchRef.current, pillRef.current));
  useLayoutEffect(() => {
    const group = switchRef.current;
    if (!group) return;
    const ro = new ResizeObserver(() => placePill(group, pillRef.current));
    ro.observe(group);
    return () => ro.disconnect();
  }, []);
  // The card glides to its new height when rows come or go.
  useLayoutEffect(() => {
    const card = cardRef.current;
    const inner = innerRef.current;
    if (!card || !inner) return;
    const sync = () => (card.style.height = `${inner.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);
  // The button's width glides to its new label.
  useLayoutEffect(() => {
    const button = actionRef.current;
    const inner = actionInnerRef.current;
    if (!button || !inner) return;
    const sync = () => (button.style.width = `${inner.offsetWidth}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  // Running low and reaching the limit are announced politely.
  const [announcedState, setAnnouncedState] = useState(state);
  const [liveText, setLiveText] = useState("");
  if (announcedState !== state) {
    setAnnouncedState(state);
    setLiveText(
      state === "limit"
        ? `${title}: limit reached, ${fmt(usedTotal)} of ${fmt(total)} ${unit} used`
        : state === "warn"
          ? `${title}: running low, ${Math.round(ratio * 100)}% of ${unit} used`
          : `${title}: ${fmt(usedTotal)} of ${fmt(total)} ${unit} used`,
    );
  }

  const near = state !== "ok";
  const shownPct = tween("pct");

  return (
    <section
      ref={rootRef}
      className={[p, className].filter(Boolean).join(" ")}
      aria-labelledby={`${id}-title`}
      data-state={state}
    >
      <div ref={cardRef} className={`${p}__card`}>
        <div ref={innerRef} className={`${p}__inner`}>
          <header className={`${p}__head`}>
            <div className={`${p}__heading`}>
              <h3 id={`${id}-title`} className={`${p}__title`}>
                {uiText(title)}
              </h3>
              {(plan || resetLabel) && (
                <p className={`${p}__sub`}>
                  {uiText(plan)}
                  {plan && resetLabel && <span className={`${p}__sep`}>·</span>}
                  {resetLabel && (
                    <time dateTime={resetAt?.toISOString()} title={uiText(resetTitle)}>
                      {uiText(resetLabel)}
                    </time>
                  )}
                </p>
              )}
            </div>
            {periods && periods.length > 1 && (
              <div ref={switchRef} className={`${p}__switch`} role="radiogroup" aria-label={uiText("Period")} onKeyDown={onSwitchKey}>
                <span ref={pillRef} className={`${p}__pill`} aria-hidden="true" />
                {periods.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={o.id === activePeriod}
                    tabIndex={o.id === activePeriod ? 0 : -1}
                    className={`${p}__option`}
                    onClick={() => pick(o.id)}
                  >
                    {uiText(o.label)}
                  </button>
                ))}
              </div>
            )}
          </header>

          <div className={`${p}__figure`}>
            <p className={`${p}__amount`}>
              <span className={`${p}__big`}>{uiText(fmt(tween("used")))}</span>
              <span className={`${p}__of`}>{uiText("of ")}{uiText(withUnit(fmt(total), unit))}</span>
            </p>
            <span className={`${p}__pct`} data-state={state}>
              {near && <span className={`${p}__dot`} aria-hidden="true" />}
              {uiText(fmt(Math.min(shownPct, 999)))}%
            </span>
          </div>

          <div
            className={`${p}__bar`}
            tabIndex={0}
            role="group"
            aria-label={uiText("{0} of {1} {2} used – arrow keys read each category", [fmt(usedTotal), fmt(total), unit])}
            data-active={activeRow ? "" : undefined}
            onPointerMove={(e) => e.pointerType === "mouse" && highlight(labelAt(e))}
            onPointerLeave={(e) => e.pointerType === "mouse" && highlight(null)}
            onPointerUp={(e) => {
              if (e.pointerType === "mouse") return;
              const label = labelAt(e);
              highlight(label === active ? null : label);
            }}
            onKeyDown={onBarKey}
            onBlur={() => highlight(null)}
          >
            <div
              className={`${p}__track`}
              role="meter"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={Math.min(usedTotal, total)}
              aria-valuetext={uiText("{0} of {1} {2}", [fmt(usedTotal), fmt(total), unit])}
            >
              {segments.map((s) => (
                <span
                  key={s.label}
                  className={`${p}__seg`}
                  data-active={s.label === active || undefined}
                  style={{ width: `${s.width}%`, background: s.color }}
                />
              ))}
            </div>
            <div
              className={`${p}__tip`}
              data-open={activeRow ? "" : undefined}
              style={{ left: `${tipX}%`, [`--${p}-tip-x`]: `${-tipX}%` }}
              aria-live="polite"
            >
              {tipRow && (
                <>
                  <span className={`${p}__tip-label`}>
                    <span className={`${p}__swatch`} style={{ background: tipRow.color }} />
                    {uiText(tipRow.label)}
                  </span>
                  <span className={`${p}__tip-value`}>
                    {uiText(withUnit(fmt(tipRow.value), unit))}
                    <span className={`${p}__muted`}> · {uiText(fmt(usedTotal ? (tipRow.value / usedTotal) * 100 : 0))}%</span>
                  </span>
                </>
              )}
            </div>
          </div>

          <ul className={`${p}__legend`} aria-label={uiText("By category")} data-active={activeRow ? "" : undefined}>
            {rows.map((r) => {
              const value = tween(`r:${r.label}`);
              const sum = tween("used");
              return (
                <li key={r.label} className={`${p}__row`} data-leaving={r.leaving || undefined}>
                  <div
                    className={`${p}__item`}
                    data-active={r.label === active || undefined}
                    onPointerEnter={(e) => e.pointerType === "mouse" && !r.leaving && highlight(r.label)}
                    onPointerLeave={(e) => e.pointerType === "mouse" && highlight(null)}
                    onPointerUp={(e) => e.pointerType !== "mouse" && !r.leaving && highlight(r.label === active ? null : r.label)}
                  >
                    <span className={`${p}__swatch`} style={{ background: r.color }} />
                    <span className={`${p}__label`}>{uiText(r.label)}</span>
                    <span className={`${p}__value`}>{uiText(fmt(value))}</span>
                    <span className={`${p}__share`}>{uiText(fmt(sum ? (value / sum) * 100 : 0))}%</span>
                  </div>
                </li>
              );
            })}
          </ul>

          {days.length > 0 && (
            <div className={`${p}__daily`}>
              <div className={`${p}__daily-head`}>
                <span>{uiText("Per day")}</span>
                <span key={dayRead ? `d${day}` : "avg"} className={`${p}__daily-read`}>
                  {dayRead ? (
                    <>
                      {uiText(dayRead.label)} · <b>{uiText(dayRead.value === null ? "–" : withUnit(fmt(dayRead.value), unit))}</b>
                    </>
                  ) : (
                    <>
                      {uiText("Avg ")}<b>{uiText(fmt(average))}</b> {uiText(" / day")}</>
                  )}
                </span>
              </div>
              <div
                key={days.length}
                className={`${p}__spark`}
                tabIndex={0}
                role="img"
                aria-label={uiText("{0} per day, {1} {2} on average – arrow keys read each day", [title, fmt(average), unit])}
                data-hover={day !== null || undefined}
                data-regrow={regrow || undefined}
                data-few={days.length <= 14 || undefined}
                onPointerMove={(e) => setDay(dayAt(e))}
                onPointerDown={(e) => setDay(dayAt(e))}
                onPointerLeave={(e) => e.pointerType === "mouse" && setDay(null)}
                onKeyDown={onSparkKey}
                onBlur={() => setDay(null)}
              >
                {days.map((d, i) => (
                  <span
                    key={i}
                    className={`${p}__day`}
                    data-future={d.value === null || undefined}
                    data-active={i === day || undefined}
                    style={{ ["--i" as string]: i }}
                  >
                    <span
                      style={{ height: d.value === null ? undefined : `${Math.max(4, (tween(`d:${i}`) / dayMax) * 100)}%` }}
                    />
                  </span>
                ))}
              </div>
            </div>
          )}

          {limits.length > 0 && (
            <ul className={`${p}__limits`} aria-label={uiText("Plan limits")} style={{ ["--n" as string]: Math.min(3, limits.length) }}>
              {limits.map((l) => {
                const unlimited = l.total == null || !isFinite(l.total);
                const total = unlimited ? 0 : (l.total as number);
                const decimals = l.decimals ?? (Number.isInteger(l.used) && (unlimited || Number.isInteger(total)) ? 0 : 1);
                const share = unlimited ? 0 : l.used / Math.max(total, 1e-9);
                const limitState: UsageState = unlimited ? "ok" : share >= 1 ? "limit" : share >= warnAt ? "warn" : "ok";
                const shown = tween(`l:${l.label}`);
                const of = unlimited ? "∞" : fmt(total, Number.isInteger(total) ? 0 : decimals);
                return (
                  <li key={l.label} className={`${p}__limit`} data-state={limitState}>
                    <span className={`${p}__limit-label`}>
                      {uiText(l.label)}
                      {limitState !== "ok" && (
                        <span className={`${p}__dot`} aria-label={uiText(limitState === "limit" ? uiText("At the limit") : uiText("Close to the limit"))} />
                      )}
                    </span>
                    <span className={`${p}__limit-value`}>
                      {uiText(fmt(shown, decimals))}
                      <span className={`${p}__muted`}> {uiText(" of ")}{uiText(withUnit(of, unlimited ? undefined : l.unit))}</span>
                    </span>
                    {unlimited ? (
                      <span className={`${p}__thin`} data-unlimited="" aria-label={uiText("{0}: {1}, unlimited", [l.label, fmt(l.used, decimals)])} role="img" />
                    ) : (
                      <span
                        className={`${p}__thin`}
                        role="meter"
                        aria-label={uiText(l.label)}
                        aria-valuemin={0}
                        aria-valuemax={total}
                        aria-valuenow={Math.min(l.used, total)}
                        aria-valuetext={uiText("{0} of {1}", [fmt(l.used, decimals), withUnit(of, l.unit)])}
                      >
                        <span style={{ width: `${Math.min(100, (shown / Math.max(total, 1e-9)) * 100)}%` }} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className={`${p}__foot`}>
        <span key={state} className={`${p}__status`}>
          {near && <span className={`${p}__dot`} aria-hidden="true" />}
          {state === "limit" ? (
            <>
              <b>{uiText("Limit reached")}</b>
              {usedTotal > total && <span className={`${p}__muted`}>{uiText(withUnit(fmt(usedTotal - total), "over"))}</span>}
            </>
          ) : (
            <>
              {state === "warn" && <b>{uiText("Running low")}</b>}
              <span className={state === "warn" ? `${p}__muted` : undefined}>{uiText(withUnit(fmt(tween("left")), unit))} {uiText(" left")}</span>
            </>
          )}
        </span>
        <button
          ref={actionRef}
          type="button"
          className={`${p}__action`}
          data-strong={near || undefined}
          onClick={() => onUpgrade?.(state)}
        >
          <span ref={actionInnerRef} className={`${p}__action-inner`}>
            <span key={near ? "top-up" : "upgrade"} className={`${p}__action-text`}>
              {uiText(near ? topUpLabel : upgradeLabel)}
            </span>
          </span>
        </button>
      </div>
      <span className={`${p}__live`} aria-live="polite">
        {uiText(liveText)}
      </span>
    </section>
  );
}
