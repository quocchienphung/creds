/** OOXML text helpers. Excel stores control characters as `_xHHHH_` and a literal `_x0041_` as `_x005F_x0041_`. */
const ENTITY = /&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g;
const OOXML_ESCAPE = /_x([0-9A-Fa-f]{4})_/g;

export function unescapeXml(text: string): string {
  if (text.indexOf("&") < 0) return text;
  return text.replace(ENTITY, (_, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return entity === "lt" ? "<" : entity === "gt" ? ">" : entity === "amp" ? "&" : entity === "quot" ? "\"" : "'";
  });
}
/** Decode Excel's `_xHHHH_` escapes into the characters they stand for. */
export function decodeOoxmlText(text: string): string {
  if (text.indexOf("_x") < 0) return text;
  return text.replace(OOXML_ESCAPE, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}
/** Text of an XML text node as the cell really holds it. */
export const readXmlText = (raw: string) => decodeOoxmlText(unescapeXml(raw));

/** Inverse of `readXmlText`, for writing a patched value back into a sheet. */
export function writeXmlText(text: string): string {
  let out = "";
  const literal = text.replace(/_x([0-9A-Fa-f]{4})_/g, "_x005F_x$1_");
  for (const ch of literal) {
    const code = ch.codePointAt(0)!;
    if (ch === "&") out += "&amp;";
    else if (ch === "<") out += "&lt;";
    else if (ch === ">") out += "&gt;";
    else if (ch === "\"") out += "&quot;";
    else if ((code < 0x20 && code !== 9 && code !== 10 && code !== 13) || (code >= 0xd800 && code <= 0xdfff) || code === 0xfffe || code === 0xffff) out += `_x${code.toString(16).toUpperCase().padStart(4, "0")}_`;
    else out += ch;
  }
  return out;
}

/** 0-based column index → letters, and back. */
export function columnLetters(index: number): string {
  let n = index + 1, out = "";
  while (n > 0) { const rem = (n - 1) % 26; out = String.fromCharCode(65 + rem) + out; n = Math.floor((n - 1) / 26); }
  return out;
}
export function columnIndex(letters: string): number {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + letters.charCodeAt(i) - 64;
  return n - 1;
}

/** Short stable fingerprint (cyrb53 with a salt). Not a security hash: it only identifies a value inside one file without storing it. */
export function fingerprint(text: string, salt = ""): string {
  let h1 = 0xdeadbeef ^ salt.length, h2 = 0x41c6ce57 ^ salt.length;
  const input = salt + "\u0001" + text;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** Internal file identity for explicit progress replay. Never export in a redacted audit. No insecure fallback. */
export async function fingerprintBytes(bytes: Uint8Array): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (subtle) {
    const digest = new Uint8Array(await subtle.digest("SHA-256", bytes as BufferSource));
    return "sha256:" + Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("Secure local processing requires HTTPS or localhost (Web Crypto is unavailable).");
}
