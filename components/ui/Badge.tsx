import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type BadgeVariant =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

const variants: Record<BadgeVariant, string> = {
  neutral: "bg-surface-2 text-text-muted",
  primary: "bg-primary/10 text-primary",
  success: "bg-success-bg text-success-fg",
  warning: "bg-warning-bg text-warning-fg",
  danger: "bg-danger-bg text-danger-fg",
};

/**
 * Semantic status pill. Uses the muted bg + readable fg token pairs.
 *
 * <Badge variant="success">Paid</Badge>
 * <Badge variant="warning">Low stock</Badge>
 */
export function Badge({
  variant = "neutral",
  className,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        variants[variant],
        className,
      )}
      {...rest}
    />
  );
}

export default Badge;
