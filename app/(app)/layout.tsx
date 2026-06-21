import Nav from "@/components/Nav";
import { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Nav />
      <main className="flex-1 p-4 md:p-6 bg-gray-50">{children}</main>
    </div>
  );
}
