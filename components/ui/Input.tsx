import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Visual error state; pairs with Field's aria-invalid wiring. */
  invalid?: boolean;
};

const fieldBase =
  "w-full h-control bg-surface text-text placeholder:text-text-muted " +
  "border rounded-md px-3 text-sm transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

/**
 * Token-styled text input. Set `invalid` to show the danger border.
 *
 * <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, className, "aria-invalid": ariaInvalid, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={ariaInvalid ?? invalid ?? undefined}
      className={cn(
        fieldBase,
        invalid ? "border-danger" : "border-border",
        className,
      )}
      {...rest}
    />
  );
});

export default Input;
