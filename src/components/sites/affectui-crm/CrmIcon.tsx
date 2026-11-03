import icons from "./icons.json";

export type CrmIconName = keyof typeof icons;

/** Static SVG paths captured from the public preview, never remote HTML or a runtime bundle. */
export function CrmIcon({ name, size = 16 }: { name: string; size?: number }) {
  const svg = (icons as Record<string, string>)[name];
  return svg ? <span className="crm-icon" style={{ width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} /> : null;
}
