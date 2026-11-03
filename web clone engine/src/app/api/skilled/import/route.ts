import { SkillImportError } from "@/lib/skilled/github-source";
import { scanGitHubSource } from "@/lib/skilled/github-folder";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: { message: "Use an application/json request with a GitHub URL." } }, { status: 415, headers });
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: { message: "A JSON body is required." } }, { status: 400, headers });
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 4096) { await reader.cancel(); return Response.json({ error: { message: "Request body exceeds 4 KiB." } }, { status: 413, headers }); }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    const content = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.length; }
    let raw: unknown;
    try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(content)); } catch { return Response.json({ error: { message: "Malformed JSON body." } }, { status: 400, headers }); }
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some(key => key !== "url") || typeof (raw as { url?: unknown }).url !== "string") return Response.json({ error: { message: "Expected exactly { url: string }." } }, { status: 400, headers });
    return Response.json({ data: await scanGitHubSource((raw as { url: string }).url) }, { headers });
  } catch (error) {
    return Response.json({ error: { message: error instanceof SkillImportError ? error.message : "Could not import this skill." } }, { status: error instanceof SkillImportError ? error.status : 500, headers });
  }
}
