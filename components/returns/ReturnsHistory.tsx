"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatPeso, formatDate } from "@/lib/format";
import { Icon, Skeleton } from "@/components/ui";

type Props = { saleId: Id<"sales"> };

export default function ReturnsHistory({ saleId }: Props) {
  const returns = useQuery(api.returns.listForSale, { saleId });

  if (returns === undefined) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <Skeleton height={18} width={140} />
      </div>
    );
  }

  if (returns.length === 0) return null;

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
        <Icon name="rotate-ccw" size={16} className="text-text-muted" />
        Returns history
      </h3>

      <ul className="space-y-3">
        {returns.map((ret) => (
          <li
            key={ret._id}
            className="space-y-1.5 border-t border-border pt-2 first:border-0 first:pt-0"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-text-muted tabular-nums">
                {formatDate(ret._creationTime)} · Admin
              </div>
              <div className="text-sm font-semibold tabular-nums text-danger-fg">
                &minus;{formatPeso(ret.totalRefund)}
              </div>
            </div>
            <div className="text-xs text-text-muted">
              {ret.itemCount} item{ret.itemCount === 1 ? "" : "s"} refunded
              {ret.reason ? ` · ${ret.reason}` : ""}
            </div>
            <ul className="ml-1 space-y-0.5 border-l border-border pl-3 text-xs text-text-muted">
              {ret.items.map((ri) => (
                <li key={ri._id} className="flex justify-between gap-2">
                  <span>
                    {ri.nameSnapshot} &times; {ri.quantity}
                  </span>
                  <span className="tabular-nums">{formatPeso(ri.lineRefund)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
