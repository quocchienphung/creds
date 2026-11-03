import { redirect } from "next/navigation";

// "Back to Stripe" and the command palette's Homepage link both point at "/"; the workspace is this app's home.
export default function Home() {
  redirect("/personalize");
}
