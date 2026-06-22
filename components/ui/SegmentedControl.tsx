"use client";

import { useId } from "react";
import { cn } from "./cn";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

export type SegmentedControlProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible group label. */
  ariaLabel?: string;
  /** Stretch segments to fill width. */
  fullWidth?: boolean;
  size?: "sm" | "md";
  className?: string;
};

/**
 * Tabbed preset selector (e.g. Reports date ranges). Implemented as a radio
 * group: arrow keys move between options, the selected one is highlighted.
 *
 * <SegmentedControl ariaLabel="Range" value={range} onChange={setRange}
 *   options={[{value:"today",label:"Today"},{value:"week",label:"Week"}]} />
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  fullWidth,
  size = "md",
  className,
}: SegmentedControlProps<T>) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-1",
        fullWidth && "flex w-full",
        className,
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            name={name}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-md font-medium transition-colors whitespace-nowrap",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-3.5 text-sm",
              fullWidth && "flex-1",
              selected
                ? "bg-surface text-text shadow-sm"
                : "text-text-muted hover:text-text",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
