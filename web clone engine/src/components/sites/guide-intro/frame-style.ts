// Avoid invalidating SVG masks, inherited styles and selector matching with identical writes.
const values = new WeakMap<Element, Map<string, string>>();
function changed(node: Element, key: string, value: string) {
  let cache = values.get(node);
  if (!cache) { cache = new Map(); values.set(node, cache); }
  if (cache.get(key) === value) return false;
  cache.set(key, value); return true;
}
export function frameStyle(node: HTMLElement | SVGElement, property: string, value: string) {
  if (changed(node, `s:${property}`, value)) node.style.setProperty(property, value);
}
export function frameAttribute(node: Element, property: string, value: string) {
  if (changed(node, `a:${property}`, value)) node.setAttribute(property, value);
}
