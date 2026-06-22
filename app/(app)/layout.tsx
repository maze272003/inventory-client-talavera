import Nav from "@/components/Nav";
import { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-bg text-text">
      <Nav />
      {/*
        Bottom padding on phone clears the fixed bottom tab bar (incl. iOS safe
        area). md+ has no bottom bar, so it resets to the normal page padding.
      */}
      <main className="flex-1 min-w-0 bg-bg p-4 md:p-6 pb-24 md:pb-6">
        {children}
      </main>
    </div>
  );
}
