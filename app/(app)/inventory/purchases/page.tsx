"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { PurchasesList, PurchasesSkeleton } from "@/components/inventory/PurchasesList";

export default function PurchasesPage() {
  const currentUser = useQuery(api.users.currentUser);

  if (currentUser === undefined) {
    return (
      <div>
        <PageHeader title="Purchases" icon="truck" />
        <Card>
          <PurchasesSkeleton />
        </Card>
      </div>
    );
  }

  if (currentUser?.role !== "admin") {
    return (
      <div>
        <PageHeader title="Purchases" icon="truck" />
        <Card>
          <EmptyState
            icon="alert-triangle"
            title="Admins only"
            description="You do not have permission to view purchase records."
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Purchases" icon="truck" />
      <PurchasesList />
    </div>
  );
}
