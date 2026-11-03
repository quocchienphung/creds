import { FACE_SHADE } from "./terrain-constants.ts";

export type Tone = "neutral" | "danger";
export interface FaceShades { top: number; south: number; west: number; east: number; north: number }
/** Coefficients of a cubic in t (0..1), one per channel: c0 + c1 t + c2 t^2 + c3 t^3. Fitted to the colours of the public preview's top faces. */
type Cubic = readonly [number, number, number, number];
const CURVES: Record<"light" | "dark", Record<Tone, readonly [Cubic, Cubic, Cubic]>> = {
  light: {
    neutral: [[221.71, -216.4, 83.743, -28.823], [221.71, -216.4, 83.743, -28.823], [221.71, -216.4, 83.743, -28.823]],
    danger: [[222.206, 40.96, -103.982, 47.853], [222.43, -206.173, 135.344, -121.62], [222.36, -229.452, 136.556, -83.498]],
  },
  dark: {
    neutral: [[54.015, 123.237, 13.783, -9.432], [53.92, 125.951, 7.961, -5.078], [53.92, 125.951, 7.961, -5.078]],
    danger: [[52.027, 236.107, -116.339, 73.248], [52.168, 80.743, -40.059, 18.146], [52.183, 62.147, -11.117, 1.787]],
  },
};
const SHADES: Record<"light" | "dark", FaceShades> = {
  light: { top: FACE_SHADE.top, south: 0.8515, west: 0.87, east: 0.671, north: 0.671 },
  dark: { top: FACE_SHADE.top, south: 0.845, west: 0.864, east: 0.666, north: 0.666 },
};
export const shadesFor = (dark: boolean): FaceShades => SHADES[dark ? "dark" : "light"];

const clamp255 = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
/** Top-face colour of a column that is `t` (0..1) of the busiest hour. */
export function topColor(t: number, tone: Tone, dark: boolean): [number, number, number] {
  const x = Math.max(0, Math.min(1, t)), curve = CURVES[dark ? "dark" : "light"][tone];
  return curve.map(c => clamp255(c[0] + x * (c[1] + x * (c[2] + x * c[3])))) as [number, number, number];
}
export const rgb = (c: readonly [number, number, number], shade = 1) => `rgb(${clamp255(c[0] * shade)} ${clamp255(c[1] * shade)} ${clamp255(c[2] * shade)})`;

/** `rgb(c, shade)` faded `t` (0..1) of the way to the platform colour `floor`: how columns outside a focused group recede. */
export const rgbFaded = (c: readonly [number, number, number], shade: number, floor: readonly [number, number, number], t: number) =>
  `rgb(${[0, 1, 2].map(i => clamp255(c[i] * shade * (1 - t) + floor[i] * t)).join(" ")})`;
/** Channels of a css colour written `#rgb`, `#rrggbb`, `rgb(r g b)` or `rgb(r, g, b)` (the browser hands a custom property back as it was declared or as hex). */
export const parseRgb = (css: string, fallback: readonly [number, number, number] = [249, 249, 249]): [number, number, number] => {
  const text = css.trim(), hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join("") : hex[1];
    return [0, 2, 4].map(at => parseInt(digits.slice(at, at + 2), 16)) as [number, number, number];
  }
  const n = /^rgba?\(/i.test(text) ? text.match(/[\d.]+/g)?.slice(0, 3).map(Number) : undefined;
  return n && n.length === 3 && n.every(Number.isFinite) ? [n[0], n[1], n[2]] : [fallback[0], fallback[1], fallback[2]];
};

/** The legend ramp's swatches, from "fewer" to "more": the same curve the columns use, shown at six steps. */
export const rampColors = (tone: Tone, dark: boolean) => [0, 0.2, 0.4, 0.6, 0.8, 1].map(t => rgb(topColor(t, tone, dark)));
