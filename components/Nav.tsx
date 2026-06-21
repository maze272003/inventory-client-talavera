"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";

const allLinks = [
  { href: "/dashboard", label: "Dashboard", adminOnly: false },
  { href: "/pos", label: "POS", adminOnly: false },
  { href: "/receipts", label: "Receipts", adminOnly: false },
  { href: "/products", label: "Products", adminOnly: true },
  { href: "/inventory", label: "Inventory", adminOnly: true },
  { href: "/reports", label: "Reports", adminOnly: true },
];

export default function Nav() {
  const currentUser = useQuery(api.users.currentUser);
  const { signOut } = useAuthActions();
  const router = useRouter();
  const pathname = usePathname();

  const isAdmin = currentUser?.role === "admin";
  const links = allLinks.filter((l) => !l.adminOnly || isAdmin);

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  return (
    <>
      {/* Mobile top bar */}
      <nav className="md:hidden flex items-center justify-between bg-gray-900 text-white px-4 py-3 sticky top-0 z-50">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Sales &amp; Inventory
        </p>
        <div className="flex items-center gap-1 overflow-x-auto">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-gray-700 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <button
            onClick={handleSignOut}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
          >
            Out
          </button>
        </div>
      </nav>

      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col w-56 shrink-0 bg-gray-900 text-white min-h-screen p-4 gap-2">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
            Sales &amp; Inventory
          </p>
          {currentUser && (
            <p className="text-sm text-gray-300 truncate">{currentUser.name}</p>
          )}
        </div>

        <ul className="flex-1 space-y-1">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-blue-600 text-white"
                      : "text-gray-300 hover:bg-gray-700 hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <button
          onClick={handleSignOut}
          className="mt-auto rounded-lg px-3 py-2 text-sm font-medium text-gray-400 hover:bg-gray-700 hover:text-white transition-colors text-left"
        >
          Sign Out
        </button>
      </nav>
    </>
  );
}
