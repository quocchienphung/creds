import type { Metadata } from "next";
import { MotionScript } from "@/components/motion/MotionScript";
import { InteractionRuntime } from "@/components/interaction/InteractionRuntime";
import { PageTransitionScript } from "@/components/page-transition/PageTransitionScript";
import { StripeNavigationScript } from "@/components/navigation/StripeNavigationScript";
import { ConsentRoot } from "@/components/sites/cookie-consent/ConsentRoot";
import { CommandPalette } from "@/components/sites/command-palette/CommandPalette";
import { WorkspaceI18nProvider } from "@/components/sites/i18n/WorkspaceI18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stripe | Financial Infrastructure to Grow Your Revenue",
  description:
    "Stripe is a suite of APIs powering online payment processing and commerce solutions for internet businesses of all sizes. Accept payments and scale faster.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-US">
      <head>
        <StripeNavigationScript />
        <PageTransitionScript />
        <MotionScript />
      </head>
      <body>
        <WorkspaceI18nProvider>
        <div id="__next">{children}</div>
        <InteractionRuntime />
        <ConsentRoot />
        <CommandPalette />
        </WorkspaceI18nProvider>
      </body>
    </html>
  );
}
