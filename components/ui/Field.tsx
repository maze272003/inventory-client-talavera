import { useId } from "react";
import type { ReactElement } from "react";
import { cloneElement } from "react";
import { cn } from "./cn";
import { Label } from "./Label";

export type FieldProps = {
  label?: string;
  /** Helper text shown below the control when there is no error. */
  hint?: string;
  /** Inline validation message; when set the control flips to the error state. */
  error?: string;
  required?: boolean;
  className?: string;
  /**
   * A single form control (Input / Select / Textarea or any element accepting
   * id / aria-* props). Field injects id + aria-describedby + aria-invalid so
   * label, hint, and error are wired for assistive tech.
   */
  children: ReactElement<{
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
    invalid?: boolean;
  }>;
};

/**
 * Wraps a control with a label, hint, and inline error — fully ARIA-wired.
 * Passing `error` sets aria-invalid on the control and links the message.
 *
 * <Field label="SKU" required error={errors.sku}>
 *   <Input value={sku} onChange={(e) => setSku(e.target.value)} />
 * </Field>
 */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: FieldProps) {
  const autoId = useId();
  const controlId = children.props.id ?? autoId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy =
    [error ? errorId : hintId].filter(Boolean).join(" ") || undefined;

  const control = cloneElement(children, {
    id: controlId,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    invalid: error ? true : children.props.invalid,
  });

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <Label htmlFor={controlId} required={required}>
          {label}
        </Label>
      )}
      {control}
      {error ? (
        <p id={errorId} className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export default Field;
