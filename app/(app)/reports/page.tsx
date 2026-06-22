"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatPeso } from "@/lib/format";
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

interface SummaryCardProps {
  label: string;
  value: string;
  loading?: boolean;
}

function SummaryCard({ label, value, loading }: SummaryCardProps) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">
          {label}
        </span>
        {loading ? (
          <Skeleton height={32} width="70%" />
        ) : (
          <span className="text-2xl font-bold text-text figure-nums">{value}</span>
        )}
      </CardBody>
    </Card>
  );
}

export default function ReportsPage() {
  const currentUser = useQuery(api.users.currentUser);
  const { success } = useToast();

  const [preset, setPreset] = useState<Preset>("daily");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

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

  // Admin guard
  if (currentUser === undefined) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardBody className="flex flex-col gap-2">
                <Skeleton height={12} width="50%" />
                <Skeleton height={32} width="70%" />
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (currentUser?.role !== "admin") {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" />
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
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

      {/* Preset toggle */}
      <div className="screen-only">
        <SegmentedControl<Preset>
          ariaLabel="Report date range"
          value={preset}
          onChange={setPreset}
          options={presets}
        />
      </div>

      {/* Custom date range picker */}
      {preset === "custom" && (
        <Card className="screen-only">
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

      {/* Printable report container */}
      <div className="report-print space-y-6">
        {/* Range label */}
        {(preset !== "custom" || customRangeReady) && (
          <p className="text-xs text-text-muted">
            {preset === "custom"
              ? `${customFrom} to ${customTo}`
              : preset === "daily"
              ? `Today (${today})`
              : preset === "weekly"
              ? "Last 7 days"
              : "Last 30 days"}
          </p>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="Revenue"
            loading={summaryLoading}
            value={summary ? formatPeso(summary.revenue) : "—"}
          />
          <SummaryCard
            label="Profit"
            loading={summaryLoading}
            value={summary ? formatPeso(summary.profit) : "—"}
          />
          <SummaryCard
            label="Units Sold"
            loading={summaryLoading}
            value={summary ? String(summary.unitsSold) : "—"}
          />
          <SummaryCard
            label="Transactions"
            loading={summaryLoading}
            value={summary ? String(summary.saleCount) : "—"}
          />
        </div>

        {/* Top products table */}
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-text">Top Products</h2>
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
                    className: "text-text-muted tabular-nums",
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
      </div>
    </div>
  );
}
