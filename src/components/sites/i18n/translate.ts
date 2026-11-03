export type WorkspaceLocale = 'en' | 'vi';
export type Translate = <T>(message: T, values?: readonly unknown[]) => T;

/** Translate presentation copy only. Unknown text is preserved; records and API values are never rewritten. */
export function translate<T>(message: T, locale: WorkspaceLocale, values?: readonly unknown[], dictionary: Readonly<Record<string, string>> = {}): T {
  if (typeof message !== 'string') return message;
  const trimmed = message.trim();
  const template = locale === 'vi' && Object.hasOwn(dictionary, trimmed) ? dictionary[trimmed] : trimmed;
  const translated = values ? template.replace(/\{(\d+)\}/g, (field, index: string) => Number(index) < values.length ? String(values[Number(index)] ?? '') : field) : template;
  if (translated === trimmed) return message;
  const start = message.indexOf(trimmed);
  return (message.slice(0, start) + translated + message.slice(start + trimmed.length)) as T;
}
