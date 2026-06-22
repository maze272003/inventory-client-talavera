import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ThemeProvider, themeNoFlashScript } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ui";

export const metadata: Metadata = {
  title: "Sales & Inventory",
  description: "Sales & Inventory Management System",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html
        lang="en"
        className={`${GeistSans.variable} ${GeistMono.variable}`}
        suppressHydrationWarning
      >
        <head>
          {/* No-flash: set .dark class + data-density before first paint. */}
          <script dangerouslySetInnerHTML={{ __html: themeNoFlashScript }} />
        </head>
        <body className="antialiased">
          <ThemeProvider>
            <ConvexClientProvider>
              <ToastProvider>{children}</ToastProvider>
            </ConvexClientProvider>
          </ThemeProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
