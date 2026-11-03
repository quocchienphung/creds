/** Small strict XML scanner for OOXML parts. Offsets always refer to the untouched XML. No DTD/entities/network. */
export interface XmlToken { kind: "start" | "end" | "text"; name: string; qname: string; attrs: Record<string, string>; start: number; end: number; empty: boolean; text: string }
const NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*/;
const local = (name: string) => name.slice(name.lastIndexOf(":") + 1);
const validEntities = (text: string) => {
  if (!text.includes("&")) return true;
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-fA-F]+;)/.test(text)) return false;
  for (const entity of text.matchAll(/&#(x[\da-fA-F]+|\d+);/g)) {
    const cp = entity[1][0] === "x" ? parseInt(entity[1].slice(1), 16) : Number(entity[1]);
    if (!(cp === 9 || cp === 10 || cp === 13 || cp >= 32 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) && cp !== 0xfffe && cp !== 0xffff)) return false;
  }
  return true;
};

export function xmlAttribute(tag: string, name: string): string | undefined {
  return new RegExp(`(?:^|\\s)${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*(["'])(.*?)\\1`, "s").exec(tag)?.[2];
}

export function* scanXml(xml: string): Generator<XmlToken> {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(xml)) throw new Error("Malformed XML: forbidden literal character.");
  const stack: string[] = [];
  let at = 0, roots = 0;
  const fail = () => { throw new Error(`Malformed or unsupported XML at offset ${at}.`); };
  while (at < xml.length) {
    const start = at;
    if (xml[at] !== "<") {
      const next = xml.indexOf("<", at); at = next < 0 ? xml.length : next;
      const text = xml.slice(start, at);
      if ((!stack.length && text.trim() !== "") || !validEntities(text)) fail();
      yield { kind: "text", name: "", qname: "", attrs: {}, start, end: at, empty: false, text };
      continue;
    }
    if (xml.startsWith("<!--", at)) { const end = xml.indexOf("-->", at + 4); if (end < 0 || xml.slice(at + 4, end).includes("--")) fail(); at = end + 3; continue; }
    if (xml.startsWith("<?xml", at) && at === 0) { const end = xml.indexOf("?>", at); if (end < 0) fail(); at = end + 2; continue; }
    if (xml.startsWith("<![CDATA[", at)) {
      const end = xml.indexOf("]]>", at + 9); if (end < 0 || !stack.length) fail();
      // Reject CDATA explicitly instead of interpreting its entity semantics incorrectly.
      fail();
    }
    if (xml.startsWith("<!", at) || xml.startsWith("<?", at)) fail();
    const closing = xml[at + 1] === "/";
    at += closing ? 2 : 1;
    const match = NAME.exec(xml.slice(at, at + 256)); if (!match) fail();
    const qname = match![0], name = local(qname); at += qname.length;
    const attrs: Record<string, string> = Object.create(null);
    let empty = false;
    while (at < xml.length) {
      const before = at; while (/\s/.test(xml[at] ?? "") && at < xml.length) at++;
      if (xml[at] === ">") { at++; break; }
      if (!closing && xml.startsWith("/>", at)) { empty = true; at += 2; break; }
      if (closing || before === at) fail();
      const a = NAME.exec(xml.slice(at, at + 256)); if (!a) fail();
      const key = a![0]; at += key.length;
      while (/\s/.test(xml[at] ?? "") && at < xml.length) at++;
      if (xml[at++] !== "=") fail();
      while (/\s/.test(xml[at] ?? "") && at < xml.length) at++;
      const quote = xml[at++]; if (quote !== "'" && quote !== '"') fail();
      const end = xml.indexOf(quote, at); if (end < 0) fail();
      const value = xml.slice(at, end);
      if (key in attrs || value.includes("<") || !validEntities(value)) fail();
      attrs[key] = value; at = end + 1;
    }
    if (xml[at - 1] !== ">") fail();
    if (closing) { if (stack.pop() !== qname) fail(); }
    else { if (!stack.length) roots++; if (!empty) stack.push(qname); if (stack.length > 64) fail(); }
    if (roots > 1) fail();
    yield { kind: closing ? "end" : "start", name, qname, attrs, start, end: at, empty, text: "" };
  }
  if (stack.length || roots !== 1) fail();
}
