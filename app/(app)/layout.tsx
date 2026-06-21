import Nav from "@/components/Nav";
import { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Nav />
      <main className="flex-1 p-6 bg-gray-50">{children}</main>
    </div>
  );
}
