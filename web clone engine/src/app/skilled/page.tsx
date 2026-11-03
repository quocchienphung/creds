import type { Metadata } from "next";
import { SkilledWorkspace } from "@/components/sites/skilled/SkilledWorkspace";

export const metadata: Metadata = {
  title: "Skilled · Logio",
  description: "A workspace for agent skills, source evidence and measured delivery.",
};

export default function Page() {
  return <SkilledWorkspace />;
}
