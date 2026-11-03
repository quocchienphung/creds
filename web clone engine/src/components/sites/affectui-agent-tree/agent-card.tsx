"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import type { ReactNode } from "react";
import { branchCost, branchLive, busyMs, durationLabel, statusLabel, type TreeAgent } from "./tree-model";
import { Mark, markNames, StatusGlyph } from "./tree-marks";

export interface AgentCardBodyProps {
  agent: TreeAgent;
  now: number;
  formatCost: (amount: number) => string;
  showCost: boolean;
  /** Controls on the bottom row, before `fold` (for example "Add sub-task"). */
  actions?: ReactNode;
  /** The fold button of a card that has sub-agents. */
  fold?: ReactNode;
}

/**
 * What is inside one agent's card: the avatar, name and model, the status, the task with its tool marks, and the bottom
 * row with the role, cost and time. The tree and the map each draw the card around it (position, selection, connectors).
 */
export function AgentCardBody({ agent, now, formatCost, showCost, actions, fold }: AgentCardBodyProps) {
  const { t: uiText } = useWorkspaceI18n();
  const kids = agent.children ?? [];
  const cost = kids.length ? branchCost(agent) : agent.cost ?? 0;
  const busy = busyMs(agent, now);
  return <>
    <div className="agt__top">
      <span className="agt__avatar" data-logo={agent.mark ? "" : undefined} title={uiText(agent.mark ? markNames[agent.mark] : undefined)}>{agent.mark ? <Mark id={agent.mark} /> : (agent.initials ?? agent.name.slice(0, 2)).toUpperCase()}</span>
      <span className="agt__who"><span className="agt__name">{uiText(agent.name)}</span>{agent.model && <span className="agt__model">{uiText(agent.model)}</span>}</span>
      <span className="agt__status" data-status={agent.status}><StatusGlyph status={agent.status} />{uiText(statusLabel[agent.status])}</span>
    </div>
    <p className="agt__task">
      {!!agent.tools?.length && <span className="agt__tools">{agent.tools.map(tool => <span className="agt__tool" key={tool} title={uiText(markNames[tool])}><Mark id={tool} /></span>)}</span>}
      {uiText(agent.task)}
    </p>
    <div className="agt__meta">
      {agent.badge && <span className="agt__badge" style={agent.badge.color ? { "--agt-badge": agent.badge.color } as React.CSSProperties : undefined}>{uiText(agent.badge.label)}</span>}
      {agent.round && agent.round.of > 1 && <span className="agt__round" title={uiText("Pass {0} of {1} of a loop", [agent.round.current, agent.round.of])}>{uiText("Round ")}{uiText(agent.round.current)}/{uiText(agent.round.of)}</span>}
      <span className="agt__cost">
        {showCost && agent.status !== "idle" && <><span className="agt__amount" data-live={branchLive(agent) ? "" : undefined}>{uiText(formatCost(cost))}</span>{uiText(busy !== undefined && " · ")}</>}
        {busy !== undefined && <span className="agt__time">{uiText(durationLabel(busy))}</span>}
      </span>
      {actions && <span className="agt__actions" data-no-select="">{uiText(actions)}</span>}
      {uiText(fold)}
    </div>
  </>;
}
