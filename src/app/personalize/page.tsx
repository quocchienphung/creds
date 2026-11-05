import type { Metadata } from "next";
import { PersonalizeApp } from "@/components/sites/guide-navigation/PersonalizeApp";

export const metadata: Metadata = {
  title: "Rules · Your workspace",
  description: "Rules: Excel formation, JSON formation and the upload queue. Converter: Excel to CSV.",
};

export default async function PersonalizePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return <PersonalizeApp initialSection={typeof params.section === "string" ? params.section : undefined} initialView={typeof params["crm-view"] === "string" ? params["crm-view"] : undefined} />;
}
