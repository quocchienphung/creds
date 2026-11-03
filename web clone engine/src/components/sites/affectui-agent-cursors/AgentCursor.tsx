"use client";

import type { CSSProperties } from "react";
import { Mark } from "../affectui-agent-tree/tree-marks";
import type { AvatarMark } from "../affectui-agent-tree/tree-model";
import "./agent-cursors.css";

export type CursorAgent = {
  id: string;
  name: string;
  mark: AvatarMark;
  color: string;
  role: string;
};

type AgentCursorProps = {
  agent: CursorAgent;
  doing: string;
  typing?: boolean;
  dimmed?: boolean;
  className?: string;
  style?: CSSProperties;
};

/** A decorative remote pointer. Its parent owns movement and the accessible run status. */
export function AgentCursor({ agent, doing, typing = false, dimmed = false, className = "", style }: AgentCursorProps) {
  const cursorStyle = { "--artist-agent-color": agent.color, ...style } as CSSProperties;

  return (
    <div
      className={`artist-cursor ${className}`.trim()}
      style={cursorStyle}
      data-agent={agent.id}
      data-dimmed={dimmed || undefined}
      data-typing={typing || undefined}
      aria-hidden="true"
    >
      <svg className="artist-cursor__pointer" width="18.514" height="22.277" viewBox="-2.186 -0.256 18.514 22.277" fill="none">
        <path transform="rotate(21.37)" d="M13.92 4.07c1.69.66 3.03 1.18 3.94 1.68.46.25.87.53 1.16.86.31.35.51.79.48 1.29-.03.51-.27.92-.62 1.23-.33.3-.77.53-1.25.74-.96.4-2.36.78-4.12 1.26-.56.15-.98.27-1.26.37-.26.1-.38.18-.47.27-.09.09-.17.21-.27.47-.1.28-.22.7-.37 1.26-.48 1.76-.86 3.16-1.26 4.12-.2.49-.44.93-.74 1.25-.32.35-.72.6-1.23.62-.51.03-.94-.17-1.29-.48-.33-.29-.61-.7-.86-1.16-.5-.91-1.02-2.25-1.68-3.94L1.66 7.76C.96 5.99.41 4.59.16 3.51-.09 2.44-.12 1.39.63.63 1.39-.12 2.44-.09 3.51.16c1.08.25 2.48.8 4.25 1.5l6.16 2.41Z" />
      </svg>
      <div className="artist-cursor__flag">
        <span className="artist-cursor__name">{agent.name}</span>
        <span className="artist-cursor__doing" data-visible={Boolean(doing) || undefined}>
          <span>{doing}{typing && <span className="artist-cursor__caret" />}</span>
        </span>
      </div>
    </div>
  );
}

type AgentPresenceProps = {
  agents: readonly CursorAgent[];
  following?: string | null;
  onFollow: (id: string | null) => void;
  done?: boolean;
};

/** The compact facepile doubles as keyboard-accessible follow controls. */
export function AgentPresence({ agents, following = null, onFollow, done = false }: AgentPresenceProps) {
  return (
    <div className="artist-presence" role="group" aria-label="Artist agents. Choose an agent to follow its cursor.">
      {agents.map(agent => {
        const selected = following === agent.id;
        const label = `${selected ? "Stop following" : "Follow"} ${agent.name}, ${agent.role}`;

        return (
          <button
            key={agent.id}
            type="button"
            className="artist-presence__agent"
            aria-label={label}
            aria-pressed={selected}
            title={label}
            data-done={done || undefined}
            style={{ "--artist-agent-color": agent.color } as CSSProperties}
            onClick={() => onFollow(selected ? null : agent.id)}
          >
            <span className="artist-presence__orbit" aria-hidden="true" />
            <span className="artist-presence__face"><Mark id={agent.mark} /></span>
            <span className="artist-presence__tooltip" aria-hidden="true">
              <strong>{agent.name}</strong>
              <span>{agent.role}</span>
              <span className="artist-presence__hint">{selected ? "Following · click to unfollow" : "Click to follow"}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
