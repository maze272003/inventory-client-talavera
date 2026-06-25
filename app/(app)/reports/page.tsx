"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatPeso, formatDateOnly } from "@/lib/format";
import { toCsv, downloadCsv } from "@/lib/csv";
import DateRangePicker from "@/components/DateRangePicker";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Icon,
  PageHeader,
  ResponsiveTable,
  SegmentedControl,
  Skeleton,
  StatCard,
  useToast,
} from "@/components/ui";

type Preset = "daily" | "weekly" | "monthly" | "custom";

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocalDate(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function presetRange(preset: Preset): { startMs: number; endMs: number } {
  const now = new Date();
  if (preset === "daily") {
    return { startMs: startOfDay(now).getTime(), endMs: endOfDay(now).getTime() };
  }
  if (preset === "weekly") {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return { startMs: startOfDay(start).getTime(), endMs: endOfDay(now).getTime() };
  }
  // monthly — last 30 days
  const start = new Date(now);
  start.setDate(now.getDate() - 29);
  return { startMs: startOfDay(start).getTime(), endMs: endOfDay(now).getTime() };
}

export default function ReportsPage() {
  const currentUser = useQuery(api.users.currentUser);
  const { success } = useToast();

  const [preset, setPreset] = useState<Preset>("daily");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [includeEmptyBatches, setIncludeEmptyBatches] = useState<boolean>(false);

  const range = useMemo(() => {
    if (preset === "custom") {
      const from = parseLocalDate(customFrom);
      const to = parseLocalDate(customTo);
      if (from && to) {
        return { startMs: startOfDay(from).getTime(), endMs: endOfDay(to).getTime() };
      }
      // Fall back to today if custom range incomplete
      return presetRange("daily");
    }
    return presetRange(preset);
  }, [preset, customFrom, customTo]);

  const isAdmin = currentUser?.role === "admin";

  const summary = useQuery(
    api.reports.salesSummary,
    isAdmin ? { startMs: range.startMs, endMs: range.endMs } : "skip",
  );

  const topProducts = useQuery(
    api.reports.topProducts,
    isAdmin ? { startMs: range.startMs, endMs: range.endMs, limit: 10 } : "skip",
  );

  const cashierRows = useQuery(
    api.reports.cashierPerformance,
    isAdmin ? { startMs: range.startMs, endMs: range.endMs } : "skip",
  );

  const batchInventory = useQuery(
    api.reports.batchInventory,
    isAdmin ? { includeEmpty: includeEmptyBatches } : "skip",
  );

  // Admin guard
  if (currentUser === undefined) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" icon="bar-chart" subtitle="Sales performance & insights" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Revenue" value="" icon="dollar-sign" tone="success" loading />
          <StatCard label="Profit" value="" icon="trending-up" tone="primary" loading />
          <StatCard label="Units Sold" value="" icon="package" tone="info" loading />
          <StatCard label="Transactions" value="" icon="receipt" tone="warning" loading />
        </div>
      </div>
    );
  }

  if (currentUser?.role !== "admin") {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" icon="bar-chart" subtitle="Sales performance & insights" />
        <EmptyState
          icon="info"
          title="Admins only"
          description="You don't have permission to view reports."
        />
      </div>
    );
  }

  const presets: { value: Preset; label: string }[] = [
    { value: "daily", label: "Today" },
    { value: "weekly", label: "Last 7 days" },
    { value: "monthly", label: "Last 30 days" },
    { value: "custom", label: "Custom" },
  ];

  const customRangeReady = preset === "custom" && customFrom && customTo;

  const today = toDateString(new Date());

  // Derive a display label for the active range (used in filenames)
  const rangeLabel =
    preset === "custom" && customFrom && customTo
      ? `${customFrom}_${customTo}`
      : preset === "daily"
      ? today
      : preset === "weekly"
      ? "last-7-days"
      : "last-30-days";

  function handleExportCsv() {
    const summaryColumns = [
      { key: "label", header: "Period" },
      { key: "revenue", header: "Revenue" },
      { key: "profit", header: "Profit" },
      { key: "unitsSold", header: "Units Sold" },
      { key: "saleCount", header: "Transactions" },
    ];
    const summaryRows = summary
      ? [
          {
            label: rangeLabel,
            revenue: summary.revenue,
            profit: summary.profit,
            unitsSold: summary.unitsSold,
            saleCount: summary.saleCount,
          },
        ]
      : [];

    const productColumns = [
      { key: "rank", header: "Rank" },
      { key: "name", header: "Product" },
      { key: "unitsSold", header: "Units Sold" },
      { key: "revenue", header: "Revenue" },
    ];
    const productRows = (topProducts ?? []).map((p, i) => ({
      rank: i + 1,
      name: p.name,
      unitsSold: p.unitsSold,
      revenue: p.revenue,
    }));

    // Combine: summary section then blank separator then top products
    const summarySection = toCsv(summaryRows, summaryColumns);
    const productsSection = toCsv(productRows, productColumns);
    const csv = `${summarySection}\r\n\r\n${productsSection}`;

    downloadCsv(`report-${rangeLabel}.csv`, csv);
    success("Export ready", `report-${rangeLabel}.csv downloaded`);
  }

  function handlePrint() {
    document.body.classList.add("printing-report");
    const cleanup = () => {
      document.body.classList.remove("printing-report");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }

  const summaryLoading = summary === undefined;
  const rangeDisplay =
    preset === "custom"
      ? `${customFrom} to ${customTo}`
      : preset === "daily"
      ? `Today (${today})`
      : preset === "weekly"
      ? "Last 7 days"
      : "Last 30 days";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        icon="bar-chart"
        subtitle="Sales performance & insights"
        actions={
          <div className="flex gap-2 screen-only">
            <Button
              variant="secondary"
              size="sm"
              disabled={!summary}
              onClick={handleExportCsv}
              leftIcon={<Icon name="download" />}
            >
              Excel (CSV)
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePrint}
              leftIcon={<Icon name="printer" />}
            >
              Print / PDF
            </Button>
          </div>
        }
      />

      <div className="screen-only space-y-3">
        <SegmentedControl<Preset>
          ariaLabel="Report date range"
          value={preset}
          onChange={setPreset}
          options={presets}
        />
        {preset === "custom" && (
          <Card>
            <CardBody>
              <DateRangePicker
                from={customFrom}
                to={customTo}
                onFromChange={setCustomFrom}
                onToChange={(v) => {
                  setCustomTo(v);
                }}
              />
              {!customRangeReady && (
                <p className="mt-3 text-xs text-warning-fg">
                  Select both a start and end date to view the report.
                </p>
              )}
            </CardBody>
          </Card>
        )}
      </div>

      <div className="report-print space-y-6">
        {(preset !== "custom" || customRangeReady) && (
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Icon name="calendar" size={15} className="text-text-subtle" />
            <span className="font-medium tabular-nums">{rangeDisplay}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Revenue"
            loading={summaryLoading}
            value={summary ? formatPeso(summary.revenue) : "—"}
            icon="dollar-sign"
            tone="success"
          />
          <StatCard
            label="Profit"
            loading={summaryLoading}
            value={summary ? formatPeso(summary.profit) : "—"}
            icon="trending-up"
            tone="primary"
          />
          <StatCard
            label="Units Sold"
            loading={summaryLoading}
            value={summary ? String(summary.unitsSold) : "—"}
            icon="package"
            tone="info"
          />
          <StatCard
            label="Transactions"
            loading={summaryLoading}
            value={summary ? String(summary.saleCount) : "—"}
            icon="receipt"
            tone="warning"
          />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon name="package" size={16} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-text">Top Products</h2>
                <p className="text-xs text-text-muted">Ranked by revenue</p>
              </div>
            </div>
            <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-text-muted tabular-nums">
              {topProducts?.length ?? 0} items
            </span>
          </CardHeader>
          <CardBody>
            {topProducts === undefined ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} height={20} />
                ))}
              </div>
            ) : (
              <ResponsiveTable
                caption="Top products by revenue"
                rows={topProducts}
                rowKey={(p) => p.productId}
                columns={[
                  {
                    key: "rank",
                    header: "#",
                    align: "left",
                    className: "text-text-subtle tabular-nums",
                    cell: (_p, i) => i + 1,
                  },
                  {
                    key: "name",
                    header: "Product",
                    align: "left",
                    className: "font-medium text-text",
                    cell: (p) => p.name,
                  },
                  {
                    key: "unitsSold",
                    header: "Units Sold",
                    align: "right",
                    className: "tabular-nums text-text-muted",
                    cell: (p) => p.unitsSold,
                  },
                  {
                    key: "revenue",
                    header: "Revenue",
                    align: "right",
                    className: "tabular-nums font-semibold text-text",
                    cell: (p) => formatPeso(p.revenue),
                  },
                ]}
                empty={
                  <EmptyState
                    icon="bar-chart"
                    title="No sales in this period"
                    description="Try a different date range."
                  />
                }
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-info-bg text-info">
                <Icon name="users" size={16} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-text">Cashier Performance</h2>
                <p className="text-xs text-text-muted">Sales by staff member</p>
              </div>
            </div>
            <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-text-muted tabular-nums">
              {cashierRows?.length ?? 0} cashiers
            </span>
          </CardHeader>
          <CardBody>
            {cashierRows === undefined ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} height={20} />
                ))}
              </div>
            ) : (
              <ResponsiveTable
                caption="Cashier performance"
                rows={cashierRows}
                rowKey={(r) => r.cashierId}
                columns={[
                  {
                    key: "name",
                    header: "Cashier",
                    align: "left",
                    cell: (r) => (
                      <div>
                        <div className="font-medium text-text">{r.name}</div>
                        <div className="text-xs text-text-muted">{r.email ?? "—"}</div>
                      </div>
                    ),
                  },
                  {
                    key: "saleCount",
                    header: "Sales",
                    align: "right",
                    className: "tabular-nums text-text-muted",
                    cell: (r) => r.saleCount,
                  },
                  {
                    key: "units",
                    header: "Units",
                    align: "right",
                    className: "tabular-nums text-text-muted",
                    cell: (r) => r.units,
                  },
                  {
                    key: "revenue",
                    header: "Revenue",
                    align: "right",
                    className: "tabular-nums font-semibold text-text",
                    cell: (r) => formatPeso(r.revenue),
                  },
                  {
                    key: "profit",
                    header: "Profit",
                    align: "right",
                    className: "tabular-nums font-semibold text-text",
                    cell: (r) => formatPeso(r.profit),
                  },
                ]}
                empty={
                  <EmptyState
                    icon="bar-chart"
                    title="No sales in range"
                    description="Adjust the date range."
                  />
                }
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success-bg text-success-fg">
                <Icon name="layers" size={16} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-text">Inventory by Batch</h2>
                <p className="text-xs text-text-muted">
                  Batch breakdown · FIFO received order · recall/expiry support
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <SegmentedControl
                ariaLabel="Show empty batches"
                value={includeEmptyBatches ? "all" : "live"}
                onChange={(v) => setIncludeEmptyBatches(v === "all")}
                options={[
                  { value: "live", label: "Live stock" },
                  { value: "all", label: "Include empty" },
                ]}
              />
            </div>
          </CardHeader>
          <CardBody>
            {batchInventory === undefined ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} height={20} />
                ))}
              </div>
            ) : (
              <>
                {batchInventory.truncated && (
                  <p className="mb-3 flex items-center gap-1.5 text-xs text-warning-fg">
                    <Icon name="alert-triangle" size={14} />
                    Large inventory — showing the first 2,000 batch rows.
                  </p>
                )}
                <ResponsiveTable
                  caption="Inventory by batch"
                  rows={batchInventory.rows}
                  rowKey={(r) => r.batchId}
                  columns={[
                    {
                      key: "name",
                      header: "Product",
                      align: "left",
                      cell: (r) => (
                        <div>
                          <div className="font-medium text-text">{r.name}</div>
                          <div className="text-xs text-text-muted">
                            SKU: {r.sku || "—"}
                            {r.barcode ? ` · ${r.barcode}` : ""}
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: "batchNumber",
                      header: "Batch",
                      align: "left",
                      className: "font-mono text-xs text-text-muted",
                      cell: (r) => r.batchNumber,
                    },
                    {
                      key: "qtyReceived",
                      header: "Received",
                      align: "right",
                      className: "tabular-nums text-text-muted",
                      cell: (r) => r.qtyReceived,
                    },
                    {
                      key: "qtyRemaining",
                      header: "Remaining",
                      align: "right",
                      className: "tabular-nums font-semibold text-text",
                      cell: (r) => r.qtyRemaining,
                    },
                    {
                      key: "receivedDate",
                      header: "Recv. date",
                      align: "right",
                      className: "tabular-nums text-text-muted",
                      cell: (r) => formatDateOnly(r.receivedDate),
                    },
                    {
                      key: "expiryDate",
                      header: "Expiry",
                      align: "right",
                      className: "tabular-nums text-text-muted",
                      cell: (r) => (r.expiryDate ? formatDateOnly(r.expiryDate) : "—"),
                    },
                    {
                      key: "value",
                      header: "Cost value",
                      align: "right",
                      className: "tabular-nums text-text",
                      cell: (r) => formatPeso(r.qtyRemaining * r.unitCost),
                    },
                  ]}
                  empty={
                    <EmptyState
                      icon="layers"
                      title="No batch inventory"
                      description="Receive stock to populate the batch breakdown."
                    />
                  }
                />
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
