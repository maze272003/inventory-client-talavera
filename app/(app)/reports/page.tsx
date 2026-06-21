"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatPeso } from "@/lib/format";
import DateRangePicker from "@/components/DateRangePicker";

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
}

function SummaryCard({ label, value }: SummaryCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
        {label}
      </span>
      <span className="text-2xl font-bold text-gray-900 tabular-nums">{value}</span>
    </div>
  );
}

export default function ReportsPage() {
  const currentUser = useQuery(api.users.currentUser);

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
  if (currentUser === undefined) return null;

  if (currentUser?.role !== "admin") {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Reports</h1>
        <p className="text-red-600">Admins only.</p>
      </div>
    );
  }

  const presets: { id: Preset; label: string }[] = [
    { id: "daily", label: "Today" },
    { id: "weekly", label: "Last 7 days" },
    { id: "monthly", label: "Last 30 days" },
    { id: "custom", label: "Custom" },
  ];

  const customRangeReady =
    preset === "custom" && customFrom && customTo;

  const today = toDateString(new Date());

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Reports</h1>

      {/* Preset toggle */}
      <div className="flex flex-wrap gap-2 items-center">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPreset(p.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              preset === p.id
                ? "bg-blue-600 text-white"
                : "bg-white border border-gray-300 text-gray-700 hover:border-blue-400"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date range picker */}
      {preset === "custom" && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <DateRangePicker
            from={customFrom}
            to={customTo}
            onFromChange={setCustomFrom}
            onToChange={(v) => {
              setCustomTo(v);
            }}
          />
          {!customRangeReady && (
            <p className="text-xs text-amber-600 mt-2">
              Select both a start and end date to view the report.
            </p>
          )}
        </div>
      )}

      {/* Range label */}
      {(preset !== "custom" || customRangeReady) && (
        <p className="text-xs text-gray-400">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Revenue"
          value={summary ? formatPeso(summary.revenue) : "—"}
        />
        <SummaryCard
          label="Profit"
          value={summary ? formatPeso(summary.profit) : "—"}
        />
        <SummaryCard
          label="Units Sold"
          value={summary ? String(summary.unitsSold) : "—"}
        />
        <SummaryCard
          label="Transactions"
          value={summary ? String(summary.saleCount) : "—"}
        />
      </div>

      {/* Top products table */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Top Products</h2>
        {topProducts === undefined ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : topProducts.length === 0 ? (
          <p className="text-sm text-gray-500">No sales in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
                    #
                  </th>
                  <th className="text-left py-2 pr-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Product
                  </th>
                  <th className="text-right py-2 pr-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Units Sold
                  </th>
                  <th className="text-right py-2 text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Revenue
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {topProducts.map((p, i) => (
                  <tr key={p.productId} className="hover:bg-gray-50">
                    <td className="py-2 pr-4 text-gray-400 tabular-nums">{i + 1}</td>
                    <td className="py-2 pr-4 font-medium text-gray-900">{p.name}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-gray-700">
                      {p.unitsSold}
                    </td>
                    <td className="py-2 text-right tabular-nums font-semibold text-gray-900">
                      {formatPeso(p.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
