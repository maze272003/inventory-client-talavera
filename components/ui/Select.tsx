import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";
import { cn } from "./cn";
import { Icon } from "./Icon";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
};

/**
 * Token-styled native <select> with a custom chevron. Pass <option>s as children.
 *
 * <Select value={cat} onChange={(e) => setCat(e.target.value)}>
 *   <option value="">All</option>
 * </Select>
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, className, children, "aria-invalid": ariaInvalid, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={ariaInvalid ?? invalid ?? undefined}
        className={cn(
          "w-full h-control bg-surface text-text border rounded-md pl-3 pr-9 text-sm transition-colors appearance-none " +
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary " +
            "disabled:opacity-50 disabled:cursor-not-allowed",
          invalid ? "border-danger" : "border-border",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <Icon
        name="chevron-down"
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
      />
    </div>
  );
});

export default Select;
