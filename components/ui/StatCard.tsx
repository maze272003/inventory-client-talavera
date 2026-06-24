import type { ReactNode } from "react";
import { cn } from "./cn";
import { Icon, type IconName } from "./Icon";
import { Skeleton } from "./Skeleton";

export type StatTone =
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

type ToneStyles = { chip: string; icon: string };

const TONES: Record<StatTone, ToneStyles> = {
  primary: { chip: "bg-primary/10", icon: "text-primary" },
  success: { chip: "bg-success-bg", icon: "text-success" },
  warning: { chip: "bg-warning-bg", icon: "text-warning" },
  danger: { chip: "bg-danger-bg", icon: "text-danger" },
  info: { chip: "bg-info-bg", icon: "text-info" },
  neutral: { chip: "bg-surface-2", icon: "text-text-muted" },
};

export type StatCardProps = {
  label: string;
  value: ReactNode;
  /** Leading icon rendered inside a soft colored chip. */
  icon?: IconName;
  tone?: StatTone;
  /** Percentage delta vs previous period. Positive=up, negative=down. */
  deltaPct?: number | null;
  /** Flip polarity so a negative delta is "good" (e.g. refunds). */
  invertDelta?: boolean;
  /** Small helper line under the value. */
  hint?: ReactNode;
  loading?: boolean;
  className?: string;
};

function DeltaBadge({
  deltaPct,
  invert,
}: {
  deltaPct: number;
  invert?: boolean;
}) {
  const up = deltaPct >= 0;
  const good = invert ? !up : up;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold",
        good ? "bg-success-bg text-success" : "bg-danger-bg text-danger",
      )}
    >
      <Icon name={up ? "trending-up" : "trending-down"} size={12} />
      <span className="tabular-nums">{Math.abs(deltaPct * 100).toFixed(0)}%</span>
    </span>
  );
}

/**
 * Premium KPI tile: icon chip, label, big tabular value, and optional trend
 * delta. Pair with `deltaPct` (e.g. analytics.kpis.revenue.deltaPct).
 *
 * <StatCard label="Revenue" value={formatPeso(rev)} icon="dollar-sign"
 *   tone="success" deltaPct={0.12} loading={loading} />
 */
export function StatCard({
  label,
  value,
  icon,
  tone = "neutral",
  deltaPct,
  invertDelta,
  hint,
  loading,
  className,
}: StatCardProps) {
  const t = TONES[tone];
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {icon && (
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg transition-transform group-hover:scale-105",
              t.chip,
            )}
          >
            <Icon name={icon} size={20} className={t.icon} />
          </span>
        )}
        {deltaPct !== undefined && deltaPct !== null && (
          <DeltaBadge deltaPct={deltaPct} invert={invertDelta} />
        )}
      </div>

      <div className="mt-3 space-y-0.5">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
          {label}
        </p>
        {loading ? (
          <Skeleton height={28} width="70%" />
        ) : (
          <p className="text-2xl font-bold tracking-tight text-text tabular-nums">
            {value}
          </p>
        )}
        {hint && !loading && (
          <p className="text-xs text-text-subtle">{hint}</p>
        )}
      </div>
    </div>
  );
}

export default StatCard;
