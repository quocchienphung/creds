import type { Metadata } from "next";
import { GuideIntro } from "@/components/sites/guide-intro/GuideIntro";

export const metadata: Metadata = {
  title: "A little imagination · Guide me",
  description: "Watch a team of artist agents turn a blank canvas into The Starry Night, then explore your workspace.",
};

export default function GuideIntroPage() { return <GuideIntro />; }
