/**
 * Checks untrusted data (a server's answer) against a sample of what the screen expects, so a malformed answer
 * is rejected before it reaches rendering code. Objects must have every key of the sample with a matching
 * type (extra keys are fine); an array must be an array whose elements all look like the sample's first
 * element (an empty array is fine, so "no rows" stays valid); numbers must be finite.
 */
export function conforms(sample: unknown, raw: unknown): boolean {
  if (Array.isArray(sample)) return Array.isArray(raw) && (sample.length === 0 || raw.every(item => conforms(sample[0], item)));
  if (sample === null) return raw === null;
  if (typeof sample === "object") {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    return Object.entries(sample as Record<string, unknown>).every(([key, expected]) => key in raw && conforms(expected, (raw as Record<string, unknown>)[key]));
  }
  if (typeof sample === "number") return typeof raw === "number" && Number.isFinite(raw);
  return typeof raw === typeof sample;
}
