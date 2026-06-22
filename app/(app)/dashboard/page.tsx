"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatPeso, formatDate } from "@/lib/format";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Skeleton,
  SkeletonText,
} from "@/components/ui";

function todayRange(): { startMs: number; endMs: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return { startMs: start.getTime(), endMs: now.getTime() };
}

interface KpiCardProps {
  label: string;
  value: string;
  loading?: boolean;
}

function KpiCard({ label, value, loading }: KpiCardProps) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">
          {label}
        </span>
        {loading ? (
          <Skeleton height={32} width="70%" />
        ) : (
          <span className="text-2xl font-bold text-text tabular-nums">{value}</span>
        )}
      </CardBody>
    </Card>
  );
}

export default function DashboardPage() {
  const currentUser = useQuery(api.users.currentUser);
  const isAdmin = currentUser?.role === "admin";

  const range = useMemo(() => todayRange(), []);

  const summary = useQuery(
    api.reports.salesSummary,
    isAdmin ? { startMs: range.startMs, endMs: range.endMs } : "skip",
  );

  const lowStockProducts = useQuery(api.products.lowStock, {});

  const receipts = useQuery(api.sales.listReceipts, {
    paginationOpts: { numItems: 8, cursor: null },
  });

  if (currentUser === undefined) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton height={28} width={180} />
          <Skeleton height={16} width={280} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardBody className="flex flex-col gap-2">
                <Skeleton height={12} width="50%" />
                <Skeleton height={32} width="70%" />
              </CardBody>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton height={18} width={160} />
              </CardHeader>
              <CardBody>
                <SkeletonText lines={5} />
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={
          isAdmin
            ? "Admin overview — today so far"
            : `Welcome back, ${currentUser?.name ?? "cashier"}`
        }
      />

      {/* Admin KPI cards */}
      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Today's Revenue"
            value={summary ? formatPeso(summary.revenue) : "—"}
            loading={summary === undefined}
          />
          <KpiCard
            label="Today's Profit"
            value={summary ? formatPeso(summary.profit) : "—"}
            loading={summary === undefined}
          />
          <KpiCard
            label="Units Sold"
            value={summary ? String(summary.unitsSold) : "—"}
            loading={summary === undefined}
          />
          <KpiCard
            label="Transactions"
            value={summary ? String(summary.saleCount) : "—"}
            loading={summary === undefined}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low stock alerts */}
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-text">Low Stock Alerts</h2>
          </CardHeader>
          <CardBody>
            {lowStockProducts === undefined ? (
              <SkeletonText lines={4} />
            ) : lowStockProducts.length === 0 ? (
              <EmptyState
                icon="package"
                title="All stocked up"
                description="All products are adequately stocked."
              />
            ) : (
              <ul className="divide-y divide-border -my-row">
                {lowStockProducts.map((p) => (
                  <li
                    key={p._id}
                    className="flex items-center justify-between py-row gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text truncate">{p.name}</p>
                      <p className="text-xs text-text-muted">{p.sku}</p>
                    </div>
                    <Badge
                      variant={p.stockQty === 0 ? "danger" : "warning"}
                      className="shrink-0"
                    >
                      <span className="tabular-nums">{p.stockQty}</span> left
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* Recent receipts */}
        <Card>
          <CardHeader className="flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold text-text">Recent Receipts</h2>
            <Link href="/receipts">
              <Button variant="ghost" size="sm">
                View all
              </Button>
            </Link>
          </CardHeader>
          <CardBody>
            {receipts === undefined ? (
              <SkeletonText lines={4} />
            ) : receipts.page.length === 0 ? (
              <EmptyState
                icon="receipt"
                title="No sales yet"
                description="No sales recorded yet."
              />
            ) : (
              <ul className="divide-y divide-border -my-row">
                {receipts.page.map((sale) => (
                  <li key={sale._id}>
                    <Link
                      href={`/receipts/${sale._id}`}
                      className="flex items-center justify-between py-row gap-4 px-1 rounded-md hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text tabular-nums">
                          #{String(sale.receiptNumber).padStart(4, "0")}
                        </p>
                        <p className="text-xs text-text-muted">
                          {formatDate(sale._creationTime)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-text tabular-nums">
                        {formatPeso(sale.total)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
