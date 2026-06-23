"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatPeso, formatDate } from "@/lib/format";
import {
  type Preset, presetRange, parseLocalDate, startOfDay, endOfDay,
  deriveGranularity, tzOffsetMinutes,
} from "@/lib/dateRange";
import Link from "next/link";
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, PageHeader,
  Select, Skeleton, SkeletonText,
} from "@/components/ui";
import DateRangePicker from "@/components/DateRangePicker";
import ChartFrame from "@/components/dashboard/charts/ChartFrame";
import RevenueProfitTrendChart from "@/components/dashboard/charts/RevenueProfitTrendChart";
import AvgTransactionChart from "@/components/dashboard/charts/AvgTransactionChart";
import MarginTrendChart from "@/components/dashboard/charts/MarginTrendChart";
import TopProductsChart, { type TopMetric } from "@/components/dashboard/charts/TopProductsChart";
import CategoryDonutChart from "@/components/dashboard/charts/CategoryDonutChart";
import CashFlowChart from "@/components/dashboard/charts/CashFlowChart";

function deltaTone(deltaPct: number | null): { text: string; cls: string } {
  if (deltaPct === null) return { text: "—", cls: "text-text-muted" };
  const pct = `${deltaPct >= 0 ? "↑" : "↓"} ${Math.abs(deltaPct * 100).toFixed(0)}%`;
  return { text: pct, cls: deltaPct >= 0 ? "text-success" : "text-danger" };
}

function KpiCard({
  label, value, deltaPct, loading,
}: { label: string; value: string; deltaPct?: number | null; loading?: boolean }) {
  const tone = deltaPct === undefined ? null : deltaTone(deltaPct);
  return (
    <Card>
      <CardBody className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">{label}</span>
        {loading ? (
          <Skeleton height={32} width="70%" />
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-text tabular-nums">{value}</span>
            {tone && <span className={`text-xs font-semibold ${tone.cls}`}>{tone.text}</span>}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default function DashboardPage() {
  const currentUser = useQuery(api.users.currentUser);
  const isAdmin = currentUser?.role === "admin";

  const [preset, setPreset] = useState<Preset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [topMetric, setTopMetric] = useState<TopMetric>("units");

  const range = useMemo(() => {
    if (preset === "custom") {
      const from = parseLocalDate(customFrom);
      const to = parseLocalDate(customTo);
      if (from && to) return { startMs: startOfDay(from).getTime(), endMs: endOfDay(to).getTime() };
      return presetRange("30d");
    }
    return presetRange(preset);
  }, [preset, customFrom, customTo]);

  const granularity = useMemo(() => deriveGranularity(range.startMs, range.endMs), [range]);
  const queryArgs = isAdmin
    ? { startMs: range.startMs, endMs: range.endMs, granularity, tzOffsetMinutes: tzOffsetMinutes() }
    : "skip" as const;

  const analytics = useQuery(api.reports.dashboardAnalytics, queryArgs);
  const cash = useQuery(api.reports.cashFlow, queryArgs);

  const presets: { value: Preset; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
    { value: "90d", label: "Last 90 days" },
    { value: "year", label: "This year" },
    { value: "custom", label: "Custom" },
  ];

  const ts = analytics?.timeseries ?? [];
  const trendData = ts.map((b) => ({ label: b.label, revenue: b.revenue, profit: b.profit }));
  const aovData = ts.map((b) => ({ label: b.label, transactions: b.transactions, avg: b.transactions > 0 ? b.revenue / b.transactions : 0 }));
  const marginData = ts.map((b) => ({ label: b.label, marginPct: b.marginPct }));

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
            ? "Business overview"
            : `Welcome back, ${currentUser?.name ?? "cashier"}`
        }
      />

      {isAdmin && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <Select
              value={preset}
              onChange={(e) => setPreset(e.target.value as Preset)}
              className="w-full sm:w-56"
            >
              {presets.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </Select>
            {preset === "custom" && (
              <div className="w-full sm:w-auto">
                <DateRangePicker from={customFrom} to={customTo} onFromChange={setCustomFrom} onToChange={setCustomTo} />
              </div>
            )}
          </div>

          {analytics?.truncated && (
            <p className="text-xs text-text-muted">
              Showing the most recent 5,000 sales in this range. Narrow the range for exact totals.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard label="Revenue" value={analytics ? formatPeso(analytics.kpis.revenue.value) : "—"} deltaPct={analytics?.kpis.revenue.deltaPct ?? null} loading={analytics === undefined} />
            <KpiCard label="Profit" value={analytics ? formatPeso(analytics.kpis.profit.value) : "—"} deltaPct={analytics?.kpis.profit.deltaPct ?? null} loading={analytics === undefined} />
            <KpiCard label="Units Sold" value={analytics ? String(analytics.kpis.units.value) : "—"} deltaPct={analytics?.kpis.units.deltaPct ?? null} loading={analytics === undefined} />
            <KpiCard label="Transactions" value={analytics ? String(analytics.kpis.transactions.value) : "—"} deltaPct={analytics?.kpis.transactions.deltaPct ?? null} loading={analytics === undefined} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <ChartFrame title="Revenue & Profit" className="xl:col-span-2" loading={analytics === undefined} empty={trendData.length === 0}>
              <RevenueProfitTrendChart data={trendData} />
            </ChartFrame>
            <ChartFrame
              title="Top Products"
              loading={analytics === undefined}
              empty={(analytics?.topProducts.length ?? 0) === 0}
            >
              <TopProductsChart data={analytics?.topProducts ?? []} metric={topMetric} onMetricChange={setTopMetric} />
            </ChartFrame>
            <ChartFrame title="Sales by Category" loading={analytics === undefined} empty={(analytics?.categoryBreakdown.length ?? 0) === 0}>
              <CategoryDonutChart data={analytics?.categoryBreakdown ?? []} />
            </ChartFrame>
            <ChartFrame title="Avg Transaction & Volume" loading={analytics === undefined} empty={aovData.length === 0}>
              <AvgTransactionChart data={aovData} />
            </ChartFrame>
            <ChartFrame title="Gross Margin %" loading={analytics === undefined} empty={marginData.length === 0}>
              <MarginTrendChart data={marginData} />
            </ChartFrame>
            <ChartFrame title="Cash In vs Out" className="xl:col-span-2" loading={cash === undefined} empty={(cash?.buckets.length ?? 0) === 0}>
              <CashFlowChart data={cash?.buckets ?? []} />
            </ChartFrame>
          </div>
        </>
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
