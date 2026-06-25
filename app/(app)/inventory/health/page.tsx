"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Card,
  CardBody,
  EmptyState,
  Icon,
  PageHeader,
} from "@/components/ui";
import { HealthSummary } from "@/components/inventory/HealthSummary";
import { StockoutRiskTable } from "@/components/inventory/StockoutRiskTable";
import { DeadStockTable } from "@/components/inventory/DeadStockTable";
import { ValuationCard } from "@/components/inventory/ValuationCard";
import { ReorderSuggestions } from "@/components/inventory/ReorderSuggestions";

export default function InventoryHealthPage() {
  const currentUser = useQuery(api.users.currentUser);
  const isAdmin = currentUser?.role === "admin";
  // Fixed at mount: the snapshot subscription re-runs on every data change,
  // so a session-stable `now` keeps figures stable without render-time impurity.
  const [nowMs] = useState(() => Date.now());

  const snapshot = useQuery(
    api.inventoryHealth.snapshot,
    isAdmin ? { nowMs, velocityWindowDays: 30 } : "skip",
  );

  const loadingSkeleton = (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Health"
        icon="gauge"
        subtitle="Stockout risk · dead stock · valuation · reorder"
      />
      <HealthSummary
        stockoutCount={0}
        deadStockValue={0}
        totalCostValue={0}
        totalRetailValue={0}
        loading
      />
      <Card>
        <CardBody>
          <EmptyState icon="gauge" title="Loading…" description="Crunching inventory health." />
        </CardBody>
      </Card>
    </div>
  );

  if (currentUser === undefined) return loadingSkeleton;

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Inventory Health"
          icon="gauge"
          subtitle="Stockout risk · dead stock · valuation · reorder"
        />
        <EmptyState
          icon="info"
          title="Admins only"
          description="You don't have permission to view inventory health."
        />
      </div>
    );
  }

  if (!snapshot) return loadingSkeleton;

  const deadStockValue = snapshot.deadStock.reduce((s, r) => s + r.cashValue, 0);
  const allEmpty =
    snapshot.stockoutRisk.length === 0 &&
    snapshot.deadStock.length === 0 &&
    snapshot.reorderSuggestions.length === 0 &&
    snapshot.valuation.totalCostValue === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Health"
        icon="gauge"
        subtitle="Stockout risk · dead stock · valuation · reorder"
      />

      {snapshot.truncated && (
        <p className="flex items-center gap-2 text-xs text-text-muted">
          <Icon name="info" size={14} className="shrink-0" />
          Catalog is large; some figures are based on a bounded read and may be incomplete.
        </p>
      )}

      <HealthSummary
        stockoutCount={snapshot.stockoutRisk.length}
        deadStockValue={deadStockValue}
        totalCostValue={snapshot.valuation.totalCostValue}
        totalRetailValue={snapshot.valuation.totalRetailValue}
      />

      {allEmpty ? (
        <Card>
          <CardBody>
            <EmptyState
              icon="check-circle"
              title="Inventory is healthy"
              description="No stockout risk, no dead stock, and nothing to reorder right now."
            />
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <StockoutRiskTable rows={snapshot.stockoutRisk} />
          <ReorderSuggestions rows={snapshot.reorderSuggestions} />
          <ValuationCard valuation={snapshot.valuation} />
          <DeadStockTable rows={snapshot.deadStock} />
        </div>
      )}
    </div>
  );
}
