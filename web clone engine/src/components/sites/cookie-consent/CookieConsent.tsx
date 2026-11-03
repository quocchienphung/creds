"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { Cookie, X } from "lucide-react";
import { useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, Ref } from "react";
import {
  FADE, SIZE, SPRING, allowAll, defaultCookieCategories, defaultLabels, faceGeometry, initialValue, normalizeValue, readCookieConsent, rejectAll,
  springFor, stacks, summaryText, writeCookieConsent,
} from "./consent-model";
import type { ConsentFace, ConsentPosition, CookieCategory, CookieConsentAction, CookieConsentLabels, CookieConsentValue } from "./consent-model";
import "../affectui-fonts.css";
import "./cookie-consent.css";

export interface CookieConsentHandle { openPreferences(): void; closePreferences(): void; reset(): void }
export interface CookieConsentProps {
  categories?: CookieCategory[];
  /** Controlled saved choice (category id to allowed). `null` means the visitor has not decided. */
  value?: CookieConsentValue | null;
  defaultValue?: CookieConsentValue | null;
  onChange?: (value: CookieConsentValue | null, detail: { action: CookieConsentAction; updatedAt: Date }) => void;
  /** Remembers the choice in localStorage under this key. */
  storageKey?: string;
  /** Bump when categories or policy change: a choice stored for another version is ignored and the bar asks again. */
  version?: string;
  preferencesOpen?: boolean;
  defaultPreferencesOpen?: boolean;
  onPreferencesOpenChange?: (open: boolean) => void;
  policy?: { label: string; href?: string; onClick?: () => void };
  position?: ConsentPosition;
  /** `fixed` pins to the viewport; `absolute` fills the nearest positioned ancestor (previews). */
  strategy?: "fixed" | "absolute";
  showReopenButton?: boolean;
  reopenSide?: "left" | "right";
  labels?: Partial<CookieConsentLabels>;
  className?: string;
  theme?: "light" | "dark";
  ref?: Ref<CookieConsentHandle>;
}

/** One face of the surface: it fades through a short blur (opacity and blur share the value; the incoming one trails). */
function useFace() {
  const opacity = useMotionValue(0), clear = useMotionValue(0);
  const filter = useTransform(clear, value => (value >= 0.999 ? "none" : `blur(${((1 - value) * FADE.blur).toFixed(3)}px)`));
  return { opacity, clear, filter };
}
type FaceMotion = ReturnType<typeof useFace>;

function Switch({ id, checked, onChange, describedBy, reduced }: { id: string; checked: boolean; onChange: (next: boolean) => void; describedBy: string; reduced: boolean }) {
  const shift = useMotionValue(checked ? 18 : 0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reduced) { shift.set(checked ? 18 : 0); return; }
    const controls = animate(shift, checked ? 18 : 0, SPRING.thumb);
    return () => controls.stop();
  }, [checked, reduced, shift]);
  return <button type="button" role="switch" id={id} aria-checked={checked} data-state={checked ? "checked" : "unchecked"} aria-describedby={describedBy} className="cc-switch" onClick={() => onChange(!checked)}>
    <span className="cc-switch__track"><motion.span className="cc-switch__thumb" style={{ x: shift }} /></span>
  </button>;
}

function Button({ tone, children, onClick, autoFocus, describedBy, className = "" }: { tone: "ghost" | "secondary" | "primary"; children: ReactNode; onClick: () => void; autoFocus?: boolean; describedBy?: string; className?: string }) {
  return <button type="button" className={`cc-button cc-button--${tone} ${className}`} onClick={onClick} data-autofocus={autoFocus ? "true" : undefined} aria-describedby={describedBy}>{children}</button>;
}

export function CookieConsent({
  categories = defaultCookieCategories, value: controlledValue, defaultValue = null, onChange, storageKey, version = "1", preferencesOpen, defaultPreferencesOpen = false, onPreferencesOpenChange,
  policy, position = "bottom", strategy = "fixed", showReopenButton = true, reopenSide, labels, className = "", theme, ref,
}: CookieConsentProps) {
  const text: CookieConsentLabels = { ...defaultLabels, ...labels };
  const id = useId();
  const reduced = !!useReducedMotion();
  const layer = useRef<HTMLDivElement>(null);
  const faceNodes = useRef<Record<ConsentFace, HTMLDivElement | null>>({ bar: null, panel: null, chip: null });
  const [loaded, setLoaded] = useState(false);
  const [innerValue, setInnerValue] = useState<CookieConsentValue | null>(defaultValue);
  const [innerOpen, setInnerOpen] = useState(defaultPreferencesOpen);
  const [draft, setDraft] = useState<CookieConsentValue>(() => initialValue(categories));
  const [layerWidth, setLayerWidth] = useState(0);
  const [heights, setHeights] = useState<{ bar: number; panel: number }>({ bar: 0, panel: 0 });
  const value = controlledValue !== undefined ? controlledValue : innerValue;
  const open = preferencesOpen !== undefined ? preferencesOpen : innerOpen;
  const face: ConsentFace | null = open ? "panel" : value === null ? "bar" : showReopenButton ? "chip" : null;
  const focusRequest = useRef(false);

  // Nothing renders until hydration and the stored choice have been read, so a decided visitor never sees the bar flash.
  useEffect(() => {
    if (storageKey && controlledValue === undefined) {
      const stored = readCookieConsent(storageKey, version);
      if (stored) setInnerValue(normalizeValue(stored.value, categories));
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once per key and version
  }, [storageKey, version]);

  const setOpen = useCallback((next: boolean, options: { focus?: boolean } = {}) => {
    focusRequest.current = options.focus ?? true;
    if (preferencesOpen === undefined) setInnerOpen(next);
    onPreferencesOpenChange?.(next);
  }, [onPreferencesOpenChange, preferencesOpen]);

  const openPreferences = useCallback(() => {
    setDraft(normalizeValue(value ?? initialValue(categories), categories));
    setOpen(true);
  }, [categories, setOpen, value]);
  const closePreferences = useCallback(() => setOpen(false), [setOpen]);

  const commit = useCallback((action: CookieConsentAction, next: CookieConsentValue | null) => {
    if (controlledValue === undefined) setInnerValue(next);
    if (storageKey) writeCookieConsent(storageKey, next ? { value: next, version, updatedAt: new Date().toISOString() } : null);
    onChange?.(next, { action, updatedAt: new Date() });
    if (open) setOpen(false);
    else focusRequest.current = true;
  }, [controlledValue, onChange, open, setOpen, storageKey, version]);
  const reset = useCallback(() => { focusRequest.current = true; commit("reset", null); }, [commit]);

  useImperativeHandle(ref, () => ({ openPreferences, closePreferences, reset }), [openPreferences, closePreferences, reset]);

  // ----- geometry: one surface that springs between the three shapes -----
  const geometry = face ? faceGeometry(face, layerWidth, position, reopenSide) : null;
  const target = face && geometry ? { width: geometry.width, height: face === "chip" ? SIZE.chip : heights[face], radius: geometry.radius, x: geometry.x } : null;
  const measured = layerWidth > 0;
  const ready = loaded && !!target && target.height > 0 && layerWidth > 0;
  const width = useMotionValue(0), height = useMotionValue(0), radius = useMotionValue(SIZE.barRadius), shift = useMotionValue(0);
  const enterOpacity = useMotionValue(0), rise = useMotionValue(SIZE.enterRise), grow = useMotionValue(SIZE.enterScale);
  const faces: Record<ConsentFace, FaceMotion> = { bar: useFace(), panel: useFace(), chip: useFace() };
  const placed = useRef(false);
  const previous = useRef<{ face: ConsentFace | null; width: number; height: number; layerWidth: number }>({ face: null, width: 0, height: 0, layerWidth: 0 });
  const targetKey = target ? `${face}|${target.width}|${target.height}|${target.radius}|${target.x}` : "";

  useLayoutEffect(() => {
    if (!ready || !target || !face) return;
    const before = previous.current;
    const jump = () => { width.set(target.width); height.set(target.height); radius.set(target.radius); shift.set(target.x); };
    // Only the morph springs are stopped when the target changes again (they restart from where they are). Entrance and fades run to the end:
    // a new animation on the same value replaces them, and stopping them on a re-measure would leave a face half faded.
    const stops: { stop(): void }[] = [];
    if (!placed.current) {
      placed.current = true;
      jump();
      faces[face].opacity.set(1); faces[face].clear.set(1);
      if (reduced) { enterOpacity.set(1); rise.set(0); grow.set(1); }
      else {
        animate(enterOpacity, 1, { ...FADE.enterOpacity, ease: FADE.ease }); animate(rise, 0, SPRING.enter); animate(grow, 1, SPRING.enter);
      }
    } else {
      const faceChanged = before.face !== face;
      if (reduced || !faceChanged && before.layerWidth !== layerWidth) jump();
      else {
        const spring = springFor({ width: before.width, height: before.height }, target);
        stops.push(animate(width, target.width, spring), animate(height, target.height, spring), animate(radius, target.radius, spring), animate(shift, target.x, spring));
      }
      if (faceChanged) {
        for (const id of ["bar", "panel", "chip"] as ConsentFace[]) {
          const motionFace = faces[id];
          if (id === face) {
            if (reduced) { animate(motionFace.opacity, 1, { duration: 0.15 }); motionFace.clear.set(1); }
            else { animate(motionFace.opacity, 1, { ...FADE.inOpacity, ease: FADE.ease }); animate(motionFace.clear, 1, { ...FADE.inBlur, ease: FADE.ease }); }
          } else if (reduced) { animate(motionFace.opacity, 0, { duration: 0.15 }); motionFace.clear.set(0); }
          else { animate(motionFace.opacity, 0, { ...FADE.out, ease: FADE.outEase }); animate(motionFace.clear, 0, { ...FADE.out, ease: FADE.outEase }); }
        }
      }
    }
    previous.current = { face, width: target.width, height: target.height, layerWidth };
    return () => { for (const control of stops) control.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key stands for the target's numbers
  }, [ready, targetKey, layerWidth, reduced]);

  // A visitor who decided and switched the reopen button off: the surface leaves.
  useEffect(() => {
    if (!placed.current || face) return;
    const control = animate(enterOpacity, 0, reduced ? { duration: 0.15 } : { ...FADE.out, ease: FADE.outEase });
    return () => control.stop();
  }, [face, reduced, enterOpacity]);
  useEffect(() => {
    if (!placed.current || !face) return;
    enterOpacity.set(1);
  }, [face, enterOpacity]);

  // One observer for the layer's width, one per face for its height: motion runs only when the shape changes.
  useEffect(() => {
    const element = layer.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setLayerWidth(Math.round(element.getBoundingClientRect().width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [loaded]);
  useEffect(() => {
    const elements = (["bar", "panel"] as const).map(id => [id, faceNodes.current[id]] as const).filter((pair): pair is readonly ["bar" | "panel", HTMLDivElement] => !!pair[1]);
    // Layout sizes from the observer, not getBoundingClientRect: the surface is scaled while it enters, and a scaled measure would be too small.
    const observer = new ResizeObserver(entries => {
      setHeights(current => {
        let next = current;
        for (const entry of entries) {
          const id = elements.find(([, element]) => element === entry.target)?.[0];
          const size = entry.borderBoxSize?.[0]?.blockSize ?? (entry.target as HTMLElement).offsetHeight;
          if (id && Math.abs(current[id] - size) > 0.01) next = { ...next, [id]: Math.round(size * 100) / 100 };
        }
        return next;
      });
    });
    const observe = () => { for (const [, element] of elements) { observer.unobserve(element); observer.observe(element); } };
    observe();
    // A web font that arrives later re-wraps the text. Observing again asks for the current size.
    const fonts = document.fonts;
    fonts?.addEventListener?.("loadingdone", observe);
    void fonts?.ready.then(observe);
    return () => { observer.disconnect(); fonts?.removeEventListener?.("loadingdone", observe); };
  }, [loaded, measured]);

  // Focus follows the face the visitor asked for: the heading of the panel, the reopen button after saving, the bar after Escape.
  useEffect(() => {
    if (!face || !ready || !focusRequest.current) return;
    focusRequest.current = false;
    const frame = requestAnimationFrame(() => faceNodes.current[face]?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [face, ready]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); closePreferences(); }
  };

  const barWidth = faceGeometry("bar", layerWidth, position, reopenSide).width;
  const stacked = stacks(barWidth);
  const panelGeometry = faceGeometry("panel", layerWidth, position, reopenSide), chipGeometry = faceGeometry("chip", layerWidth, position, reopenSide), barGeometry = faceGeometry("bar", layerWidth, position, reopenSide);
  const count = summaryText(draft, categories);
  const policyLink = policy && (policy.href
    ? <a className="cc-policy" href={policy.href} onClick={policy.onClick}>{policy.label}</a>
    : <button type="button" className="cc-policy" onClick={policy.onClick}>{policy.label}</button>);

  const faceStyle = (name: ConsentFace, geometryWidth: number) => ({ width: geometryWidth, opacity: faces[name].opacity, filter: faces[name].filter });
  const faceMotion = (name: ConsentFace) => ({ ref: (node: HTMLDivElement | null) => { faceNodes.current[name] = node; }, inert: face !== name, "data-face": name, "aria-hidden": face !== name ? true : undefined }) as const;

  if (!loaded) return null;
  return <div ref={layer} className={`cc-layer ${strategy === "absolute" ? "cc-layer--absolute" : ""} ${className}`} data-theme={theme} data-position={position} data-ready={ready ? "" : undefined} onKeyDown={onKeyDown}>
    <motion.div className="cc-surface" data-face={face ?? "none"} style={{ width, height, x: shift, y: rise, scale: grow, opacity: enterOpacity, borderRadius: radius, visibility: ready ? "visible" : "hidden" }}>
      <motion.div {...faceMotion("bar")} className="cc-face cc-bar" data-side={barGeometry.side} role="dialog" aria-modal="false" aria-label={text.reopen} aria-describedby={`${id}-message`} style={faceStyle("bar", barGeometry.width)}>
        <div className="cc-bar__inner" data-stack={stacked ? "" : undefined}>
          <p id={`${id}-message`} className="cc-message">{text.message}{policyLink && <> {policyLink}</>}</p>
          <div className="cc-bar__actions">
            <Button tone="ghost" autoFocus onClick={openPreferences}>{text.customize}</Button>
            <Button tone="secondary" onClick={() => commit("reject-all", rejectAll(categories))}>{text.rejectAll}</Button>
            <Button tone="secondary" onClick={() => commit("accept-all", allowAll(categories))}>{text.acceptAll}</Button>
          </div>
        </div>
      </motion.div>
      <motion.div {...faceMotion("panel")} className="cc-face cc-panel" data-side={panelGeometry.side} role="dialog" aria-modal="false" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} style={faceStyle("panel", panelGeometry.width)}>
        <div className="cc-panel__head">
          <h2 id={`${id}-title`} className="cc-title" tabIndex={-1} data-autofocus="true">{text.preferencesTitle}</h2>
          <button type="button" className="cc-icon-button" aria-label={text.close} onClick={closePreferences}><X size={16} strokeWidth={1.75} aria-hidden="true" /></button>
        </div>
        <p id={`${id}-description`} className="cc-description">{text.preferencesDescription}{policyLink && <> {policyLink}</>}</p>
        <ul className="cc-list">
          {categories.map(category => <li key={category.id} className="cc-row">
            <div className="cc-row__text">
              <label className="cc-row__label" htmlFor={category.required ? undefined : `${id}-${category.id}`}>{category.label}</label>
              {category.description && <p id={`${id}-${category.id}-hint`} className="cc-row__hint">{category.description}</p>}
            </div>
            {category.required
              ? <span className="cc-always">{text.alwaysOn}</span>
              : <Switch id={`${id}-${category.id}`} checked={!!draft[category.id]} reduced={reduced} describedBy={`${id}-${category.id}-hint`} onChange={next => setDraft(current => ({ ...current, [category.id]: next }))} />}
          </li>)}
        </ul>
        <div className="cc-panel__actions">
          <Button tone="secondary" onClick={() => commit("reject-all", rejectAll(categories))}>{text.rejectAll}</Button>
          <Button tone="secondary" onClick={() => commit("accept-all", allowAll(categories))}>{text.acceptAll}</Button>
          <Button tone="primary" className="cc-save" describedBy={`${id}-count`} onClick={() => commit("save", normalizeValue(draft, categories))}>{text.save}</Button>
        </div>
        <span id={`${id}-count`} className="cc-sr">{count}</span>
      </motion.div>
      <motion.div {...faceMotion("chip")} className="cc-face cc-chip-face" data-side={chipGeometry.side} style={faceStyle("chip", chipGeometry.width)}>
        <button type="button" className="cc-chip" aria-label={text.reopen} aria-haspopup="dialog" data-autofocus="true" onClick={openPreferences}><Cookie size={20} strokeWidth={1.75} aria-hidden="true" /></button>
      </motion.div>
    </motion.div>
  </div>;
}
