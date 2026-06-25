"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatPeso, formatDate } from "@/lib/format";
import {
  type Preset, presetRange, parseLocalDate, startOfDay, endOfDay,
  deriveGranularity, tzOffsetMinutes,
} from "@/lib/dateRange";
import Link from "next/link";
import {
  Badge, Button, Card, CardBody, CardHeader, cn, EmptyState, Icon,
  type IconName, PageHeader, Select, Skeleton, SkeletonText, StatCard,
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

function priorPeriodHint(deltaPct: number | null): ReactNode {
  if (deltaPct === null) {
    return <span className={deltaTone(null).cls}>no prior data</span>;
  }
  return <span className="text-text-subtle">vs prior period</span>;
}

export default function DashboardPage() {
  const currentUser = useQuery(api.users.currentUser);
  const isAdmin = currentUser?.role === "admin";

  const [preset, setPreset] = useState<Preset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [topMetric, setTopMetric] = useState<TopMetric>("units");
  // Session-stable `now` for the health summary (avoids render-time impurity).
  const [healthNowMs] = useState(() => Date.now());

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
  const health = useQuery(
    api.inventoryHealth.summary,
    isAdmin ? { nowMs: healthNowMs } : "skip",
  );

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

  const quickActions: {
    href: string; label: string; sub: string; icon: IconName; chip: string; iconCls: string;
  }[] = [
    { href: "/pos", label: "New Sale", sub: "Open register", icon: "shopping-cart", chip: "bg-primary/10", iconCls: "text-primary" },
    { href: "/products", label: "Add Product", sub: "Manage catalog", icon: "tag", chip: "bg-info-bg", iconCls: "text-info" },
    { href: "/inventory", label: "Stock In", sub: "Receive goods", icon: "boxes", chip: "bg-warning-bg", iconCls: "text-warning" },
    { href: "/reports", label: "Reports", sub: "View insights", icon: "bar-chart", chip: "bg-surface-2", iconCls: "text-text-muted" },
  ];

  if (currentUser === undefined) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton height={44} width={44} />
          <div className="space-y-2">
            <Skeleton height={24} width={180} />
            <Skeleton height={14} width={240} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardBody className="space-y-3">
                <Skeleton height={40} width={40} />
                <Skeleton height={12} width="50%" />
                <Skeleton height={28} width="70%" />
              </CardBody>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
        icon="home"
        eyebrow={isAdmin ? "Overview" : "Point of sale"}
        title="Dashboard"
        subtitle={
          isAdmin
            ? "Business overview · last 30 days"
            : `Welcome back, ${currentUser?.name ?? "cashier"}`
        }
        actions={
          isAdmin ? (
            <div className="flex items-end gap-2 flex-wrap">
              <Select
                value={preset}
                onChange={(e) => setPreset(e.target.value as Preset)}
                className="w-44"
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
          ) : (
            <Link href="/pos">
              <Button leftIcon={<Icon name="shopping-cart" size={16} />}>New Sale</Button>
            </Link>
          )
        }
      />

      {!isAdmin && (
        <Card className="bg-brand-gradient-soft">
          <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon name="store" size={24} />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-text">Ready when you are</h2>
                <p className="text-sm text-text-muted">Jump to the register or review recent sales.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link href="/pos">
                <Button leftIcon={<Icon name="shopping-cart" size={16} />}>New Sale</Button>
              </Link>
              <Link href="/receipts">
                <Button variant="secondary" rightIcon={<Icon name="arrow-up-right" size={16} />}>Receipts</Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      )}

      {isAdmin && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {quickActions.map((t) => (
              <Link key={t.href} href={t.href} className="group">
                <Card interactive className="flex h-full items-center gap-3 rounded-xl p-3">
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105",
                      t.chip,
                      t.iconCls,
                    )}
                  >
                    <Icon name={t.icon} size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-text">{t.label}</span>
                    <span className="block truncate text-xs text-text-muted">{t.sub}</span>
                  </span>
                  <Icon
                    name="arrow-up-right"
                    size={16}
                    className="ml-auto text-text-subtle opacity-0 transition-opacity group-hover:opacity-100"
                  />
                </Card>
              </Link>
            ))}
          </div>

          {analytics?.truncated && (
            <p className="flex items-center gap-2 text-xs text-text-muted">
              <Icon name="info" size={14} className="shrink-0" />
              Showing the most recent 5,000 sales in this range. Narrow the range for exact totals.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Revenue"
              icon="dollar-sign"
              tone="success"
              value={analytics ? formatPeso(analytics.kpis.revenue.value) : "—"}
              deltaPct={analytics?.kpis.revenue.deltaPct ?? null}
              hint={priorPeriodHint(analytics?.kpis.revenue.deltaPct ?? null)}
              loading={analytics === undefined}
            />
            <StatCard
              label="Profit"
              icon="trending-up"
              tone="primary"
              value={analytics ? formatPeso(analytics.kpis.profit.value) : "—"}
              deltaPct={analytics?.kpis.profit.deltaPct ?? null}
              hint={priorPeriodHint(analytics?.kpis.profit.deltaPct ?? null)}
              loading={analytics === undefined}
            />
            <StatCard
              label="Units Sold"
              icon="package"
              tone="info"
              value={analytics ? String(analytics.kpis.units.value) : "—"}
              deltaPct={analytics?.kpis.units.deltaPct ?? null}
              hint={priorPeriodHint(analytics?.kpis.units.deltaPct ?? null)}
              loading={analytics === undefined}
            />
            <StatCard
              label="Transactions"
              icon="receipt"
              tone="warning"
              value={analytics ? String(analytics.kpis.transactions.value) : "—"}
              deltaPct={analytics?.kpis.transactions.deltaPct ?? null}
              hint={priorPeriodHint(analytics?.kpis.transactions.deltaPct ?? null)}
              loading={analytics === undefined}
            />
          </div>

          <Link href="/inventory/health" className="group block">
            <Card interactive className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardBody className="flex items-center gap-4 p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning-bg text-warning">
                  <Icon name="gauge" size={22} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-text">Inventory Health</h2>
                  <p className="text-sm text-text-muted">
                    {health === undefined
                      ? "Checking stock health…"
                      : health.stockoutCount === 0 && health.deadStockValue === 0
                        ? "Catalog is healthy — no risks flagged"
                        : [
                            health.stockoutCount > 0
                              ? `${health.stockoutCount} at stockout risk`
                              : null,
                            health.deadStockValue > 0
                              ? `${formatPeso(health.deadStockValue)} dead stock`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                  </p>
                </div>
              </CardBody>
              <div className="flex items-center gap-2 pr-4 self-center">
                <span className="hidden text-sm font-medium text-primary sm:inline">
                  View health
                </span>
                <Icon
                  name="arrow-up-right"
                  size={18}
                  className="text-text-subtle transition-opacity group-hover:opacity-100 sm:opacity-0"
                />
              </div>
            </Card>
          </Link>

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-bg text-warning">
                <Icon name="bell" size={18} />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-text">Low Stock Alerts</h2>
                <p className="text-xs text-text-muted">
                  {lowStockProducts === undefined
                    ? "Loading…"
                    : lowStockProducts.length === 0
                      ? "All stocked up"
                      : `${lowStockProducts.length} item${lowStockProducts.length === 1 ? "" : "s"} need restocking`}
                </p>
              </div>
            </div>
            <Link href="/inventory">
              <Button variant="ghost" size="sm" rightIcon={<Icon name="arrow-up-right" size={14} />}>Restock</Button>
            </Link>
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
                {lowStockProducts.map((p) => {
                  const out = p.stockQty === 0;
                  return (
                    <li key={p._id} className="flex items-center justify-between gap-4 py-row">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                            out ? "bg-danger-bg text-danger" : "bg-warning-bg text-warning",
                          )}
                        >
                          <Icon name={out ? "alert-triangle" : "package"} size={16} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-text">{p.name}</p>
                          <p className="text-xs text-text-muted">{p.sku}</p>
                        </div>
                      </div>
                      <Badge variant={out ? "danger" : "warning"} className="shrink-0">
                        <span className="tabular-nums">{p.stockQty}</span> left
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon name="receipt" size={18} />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-text">Recent Receipts</h2>
                <p className="text-xs text-text-muted">Latest sales</p>
              </div>
            </div>
            <Link href="/receipts">
              <Button variant="ghost" size="sm" rightIcon={<Icon name="arrow-up-right" size={14} />}>View all</Button>
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
                      className="flex items-center justify-between gap-4 rounded-md px-1 py-row hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-text-muted">
                          <Icon name="receipt" size={15} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text tabular-nums">
                            #{String(sale.receiptNumber).padStart(4, "0")}
                          </p>
                          <p className="text-xs text-text-muted">
                            {formatDate(sale._creationTime)}
                          </p>
                        </div>
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
