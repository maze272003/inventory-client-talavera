import type { Metadata } from "next";
import { Saira_Condensed } from "next/font/google";

/**
 * Saira Condensed — a technical, instrument-panel display face used only on
 * the login screen for the brand wordmark and headline. Exposed as
 * `--font-saira` to the subtree; `.azi-display` reads it.
 */
const saira = Saira_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-saira",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sign in · AZI MOTOR SHOP",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={saira.variable}>{children}</div>;
}
