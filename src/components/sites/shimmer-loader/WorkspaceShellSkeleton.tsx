"use client";

import { SectionSkeleton } from "./SectionSkeleton";
import { Skeleton } from "./Shimmer";
import { useInitialSection } from "../affectui-crm/workspace-state";
import "./shimmer-loader.css";

/**
 * The whole workspace while its code loads: a sidebar and the page of the section the address names, both as skeletons. The section
 * comes from the route the server read (the loading placeholder of a lazy component gets no props, but sits inside the provider).
 */
export function WorkspaceShellSkeleton() {
  const section = useInitialSection() ?? "Companies";
  return <div className="shm-shell" role="status" aria-busy="true">
    <aside className="shm-shell__side" aria-hidden="true">
      <Skeleton width={120} height={14} />
      {[0, 1, 2].map(index => <div className="shm-row" key={index}><Skeleton width={16} height={16} radius={4} /><Skeleton width={`${50 + index * 12}%`} height={12} /></div>)}
      <span style={{ flex: 1 }} />
      <Skeleton height={64} radius={10} />
      <div className="shm-row"><Skeleton circle width={22} /><Skeleton width={84} height={11} /></div>
    </aside>
    <main className="shm-shell__main"><SectionSkeleton section={section} /></main>
  </div>;
}
