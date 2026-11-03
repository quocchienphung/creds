import { timingSafeEqual } from "node:crypto";

/**
 * Who may use the home-server API (`/api/workspace/*`).
 *
 * - `LOGIO_API_TOKEN` set: every request needs `Authorization: Bearer <token>`. Use this when the server is reachable from the internet.
 * - Not set: only requests addressed to this machine or a private network name (localhost, 127.x, 10.x, 192.168.x, 172.16-31.x, *.local, *.lan)
 *   or a host listed in `LOGIO_ALLOWED_HOSTS` (comma separated) are served.
 * - Writes from a browser must come from the same origin as the page that sends them, so another website cannot write to your server.
 */
const privateHost = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|[a-z0-9-]+\.(?:local|lan|home|internal))$/i;

export const tokenRequired = () => Boolean(process.env.LOGIO_API_TOKEN);

function fail(status: number, message: string) {
  return Response.json({ error: { message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export function authorize(request: Request): Response | null {
  const token = process.env.LOGIO_API_TOKEN;
  if (token) {
    const given = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
    const a = Buffer.from(given), b = Buffer.from(token);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return fail(401, "A valid API token is required.");
  } else {
    const host = (request.headers.get("host") ?? "").replace(/:\d+$/, "").toLowerCase();
    const allowed = (process.env.LOGIO_ALLOWED_HOSTS ?? "").split(",").map(item => item.trim().toLowerCase()).filter(Boolean);
    if (!privateHost.test(host) && !allowed.includes(host)) return fail(403, "This API is only served on your local network. Set LOGIO_API_TOKEN (or LOGIO_ALLOWED_HOSTS) to expose it.");
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin) {
      let same = false;
      try { same = new URL(origin).host === request.headers.get("host"); } catch { /* malformed origin */ }
      if (!same) return fail(403, "Cross-origin writes are not allowed.");
    }
  }
  return null;
}

export { fail as apiError };

/** Read a JSON body with a hard byte limit. Throws a Response for the caller to return. */
export async function readJson(request: Request, limit: number): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw fail(400, "A JSON body is required.");
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw fail(413, `Request body exceeds ${Math.round(limit / 1048576)} MiB.`); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw fail(400, "Malformed JSON body."); }
}
