import type { Metadata } from "next";
import { PersonalizeApp } from "@/components/sites/guide-navigation/GuideNavigation";

export const metadata: Metadata = {
  title: "Guide me · Your workspace",
  description: "How I can help you: Sales, Agent Chat and CRM.",
};

export default async function PersonalizePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return <PersonalizeApp initialBrowse={params.browse === "1"} initialGroup={typeof params.group === "string" ? params.group : undefined} initialSection={typeof params.section === "string" ? params.section : undefined} initialView={typeof params["crm-view"] === "string" ? params["crm-view"] : undefined} />;
}
