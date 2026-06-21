"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function InventoryPage() {
  const currentUser = useQuery(api.users.currentUser);

  if (currentUser === undefined) return null;

  if (currentUser?.role !== "admin") {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Inventory</h1>
        <p className="text-red-600">Admins only.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Inventory</h1>
      <p className="text-gray-500">Coming soon.</p>
    </div>
  );
}
