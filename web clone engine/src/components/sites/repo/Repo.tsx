"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { CircleAlert } from "lucide-react";
import { SectionSkeleton } from "../shimmer-loader/SectionSkeleton";
import { ActivityTerrain } from "../skilled/terrain/ActivityTerrain";
import { skillEventsResource } from "../skilled/skill-model";
import { useResource } from "@/lib/workspace-backend/react";
import "../skilled/skilled.css";

/** The Repo page: the Activity terrain, drawn from the same measured skill operations Skilled records. */
export function Repo({ workspaceId }: { workspaceId: string }) {
  const { t: uiText } = useWorkspaceI18n();
  const [events, , sync] = useResource(skillEventsResource, workspaceId, []);
  if (sync.phase !== "ready") return <SectionSkeleton section="Repo" />;
  return <div className="sk-workspace" role="region" aria-label={uiText("Repo workspace")}>
    <div className="sk-content">
      <ActivityTerrain events={events} />
      {sync.error && <div className="sk-error" role="alert"><CircleAlert size={16} /><span>{uiText(sync.error.message)}</span><button onClick={sync.retry}>{uiText("Retry activity save")}</button></div>}
    </div>
  </div>;
}
