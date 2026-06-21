"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatPeso, formatDate } from "@/lib/format";
import Link from "next/link";

function todayRange(): { startMs: number; endMs: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return { startMs: start.getTime(), endMs: now.getTime() };
}

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
}

function KpiCard({ label, value, sub }: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
        {label}
      </span>
      <span className="text-2xl font-bold text-gray-900 tabular-nums">{value}</span>
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
    </div>
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

  if (currentUser === undefined) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          {isAdmin ? "Admin overview — today so far" : `Welcome back, ${currentUser?.name ?? "cashier"}`}
        </p>
      </div>

      {/* Admin KPI cards */}
      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Today's Revenue"
            value={summary ? formatPeso(summary.revenue) : "—"}
          />
          <KpiCard
            label="Today's Profit"
            value={summary ? formatPeso(summary.profit) : "—"}
          />
          <KpiCard
            label="Units Sold"
            value={summary ? String(summary.unitsSold) : "—"}
          />
          <KpiCard
            label="Transactions"
            value={summary ? String(summary.saleCount) : "—"}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low stock alerts */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-3">
            Low Stock Alerts
          </h2>
          {lowStockProducts === undefined ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : lowStockProducts.length === 0 ? (
            <p className="text-sm text-green-600">All products are adequately stocked.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {lowStockProducts.map((p) => (
                <li
                  key={p._id}
                  className="flex items-center justify-between py-2 gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.sku}</p>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      p.stockQty === 0
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {p.stockQty} left
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent receipts */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800">Recent Receipts</h2>
            <Link
              href="/receipts"
              className="text-xs text-blue-600 hover:underline"
            >
              View all
            </Link>
          </div>
          {receipts === undefined ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : receipts.page.length === 0 ? (
            <p className="text-sm text-gray-500">No sales recorded yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {receipts.page.map((sale) => (
                <li key={sale._id}>
                  <Link
                    href={`/receipts/${sale._id}`}
                    className="flex items-center justify-between py-2 hover:bg-gray-50 rounded px-1 gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        #{String(sale.receiptNumber).padStart(4, "0")}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(sale._creationTime)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-gray-800 tabular-nums">
                      {formatPeso(sale.total)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
