import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

/**
 * Token-styled multi-line text control.
 *
 * <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { invalid, className, rows = 3, "aria-invalid": ariaInvalid, ...rest },
    ref,
  ) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        aria-invalid={ariaInvalid ?? invalid ?? undefined}
        className={cn(
          "w-full bg-surface text-text placeholder:text-text-muted border rounded-md px-3 py-2 text-sm transition-colors resize-y " +
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary " +
            "disabled:opacity-50 disabled:cursor-not-allowed",
          invalid ? "border-danger" : "border-border",
          className,
        )}
        {...rest}
      />
    );
  },
);

export default Textarea;
