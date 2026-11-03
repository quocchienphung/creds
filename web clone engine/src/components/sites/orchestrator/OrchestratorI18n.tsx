"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useWorkspaceI18n } from "../i18n/WorkspaceI18n";
import type { Translate } from "../i18n/translate";
import type { Scenario } from "./orchestrator-model.ts";
import { orchestratorCopy } from "./orchestrator-copy";

const Context = createContext<Translate | null>(null);

/** Supplies localized display copy without changing the scenario driving the simulation. No DOM wrapper. */
export function OrchestratorI18n({ scenario, children }: { scenario: Scenario; children: ReactNode }) {
  const { t } = useWorkspaceI18n();
  const copy = useMemo(() => orchestratorCopy(t, scenario), [t, scenario]);
  return <Context.Provider value={copy}>{children}</Context.Provider>;
}

export function useOrchestratorCopy(): Translate {
  const shared = useContext(Context);
  const { t } = useWorkspaceI18n();
  const fallback = useMemo(() => orchestratorCopy(t), [t]);
  return shared ?? fallback;
}
