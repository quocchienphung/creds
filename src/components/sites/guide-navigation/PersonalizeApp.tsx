"use client";

import dynamic from "next/dynamic";
import { WorkspaceBackendProvider } from "@/lib/workspace-backend/react";
import { InitialRouteProvider, sectionFromParam } from "../affectui-crm/workspace-state";
import { WorkspaceShellSkeleton } from "../shimmer-loader/WorkspaceShellSkeleton";
import "../affectui-fonts.css";
import "../i18n/vietnamese-fonts.css";

const Workspace = dynamic(() => import("../affectui-crm/Crm").then(module => module.Crm), {
  loading: () => <WorkspaceShellSkeleton />,
});

export function PersonalizeApp({ initialSection, initialView }: { initialSection?: string; initialView?: string }) {
  return <WorkspaceBackendProvider><InitialRouteProvider value={{ section: sectionFromParam(initialSection), view: initialView ?? null }}><Workspace /></InitialRouteProvider></WorkspaceBackendProvider>;
}
