import type { LabelHTMLAttributes } from "react";
import { cn } from "./cn";

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  /** Renders a danger asterisk after the label text. */
  required?: boolean;
};

/**
 * Token-styled form label. Usually rendered for you by Field; use directly only
 * for bespoke layouts.
 *
 * <Label htmlFor="name" required>Name</Label>
 */
export function Label({ required, className, children, ...rest }: LabelProps) {
  return (
    <label
      className={cn("block text-sm font-medium text-text", className)}
      {...rest}
    >
      {children}
      {required && (
        <span className="text-danger ml-0.5" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}

export default Label;
