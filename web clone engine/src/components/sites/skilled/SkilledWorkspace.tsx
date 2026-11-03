"use client";

import { WorkspaceBackendProvider } from "@/lib/workspace-backend/react";
import { Crm } from "../affectui-crm/Crm";
import { InitialRouteProvider } from "../affectui-crm/workspace-state";
import "../affectui-fonts.css";
import "../i18n/vietnamese-fonts.css";
import "../guide-navigation/guide-navigation.css";

export function SkilledWorkspace() {
  return <WorkspaceBackendProvider><InitialRouteProvider value={{ section: "Skilled", view: null }}><Crm /></InitialRouteProvider></WorkspaceBackendProvider>;
}
