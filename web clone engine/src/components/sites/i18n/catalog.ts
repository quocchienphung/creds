/** Tab-separated, reviewed source/translation pairs. No remote translation service is used. */
export function catalog(source: string): Readonly<Record<string, string>> {
  return Object.fromEntries(source.trim().split('\n').map(line => {
    const at = line.indexOf('\t');
    if (at < 1 || !line.slice(at + 1).trim()) throw new Error(`Invalid translation: ${line}`);
    return [line.slice(0, at), line.slice(at + 1)];
  }));
}
