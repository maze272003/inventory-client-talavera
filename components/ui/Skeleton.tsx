import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  /** CSS width (e.g. "100%", 120). */
  width?: string | number;
  /** CSS height (e.g. "1rem", 16). */
  height?: string | number;
  /** Pill/round shape for avatars and chips. */
  rounded?: boolean;
};

/**
 * Loading placeholder. Replaces `return null` / "Loading…" while data resolves.
 * The pulse honors prefers-reduced-motion via the global CSS rule.
 *
 * <Skeleton height={20} width="60%" />
 * <Skeleton height={40} width={40} rounded />
 */
export function Skeleton({
  width,
  height,
  rounded,
  className,
  style,
  ...rest
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse bg-surface-2",
        rounded ? "rounded-full" : "rounded-md",
        className,
      )}
      style={{ width, height, ...style }}
      {...rest}
    />
  );
}

/**
 * Convenience: N stacked text-line skeletons. The last line is shorter.
 *
 * <SkeletonText lines={3} />
 */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={12}
          width={i === lines - 1 ? "60%" : "100%"}
        />
      ))}
    </div>
  );
}

export default Skeleton;
