import { createHttpBackend } from "./http-backend.ts";
import type { HttpBackendConfig } from "./http-backend.ts";
import { createLocalBackend } from "./local-backend.ts";
import type { WorkspaceBackend } from "./types.ts";

declare global {
  /**
   * Optional runtime configuration, set before the workspace mounts (for example by the host page or a script
   * that already knows the signed-in person): `window.__workspaceBackendConfig = { baseUrl, headers }`.
   */
  var __workspaceBackendConfig: Partial<HttpBackendConfig> | undefined;
}

/**
 * The backend the workspace uses: the REST API when `NEXT_PUBLIC_WORKSPACE_API_URL` (or the runtime `baseUrl`)
 * is set, otherwise this browser's local storage.
 */
export function createConfiguredBackend(): WorkspaceBackend {
  const runtime = globalThis.__workspaceBackendConfig;
  const baseUrl = runtime?.baseUrl || process.env.NEXT_PUBLIC_WORKSPACE_API_URL;
  return baseUrl ? createHttpBackend({ ...runtime, baseUrl }) : createLocalBackend();
}
