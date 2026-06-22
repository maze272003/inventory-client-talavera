import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, disables the button, and announces busy. */
  loading?: boolean;
  /** Stretch to fill the container width. */
  fullWidth?: boolean;
  /** Optional leading icon node. */
  leftIcon?: ReactNode;
  /** Optional trailing icon node. */
  rightIcon?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

const base =
  "inline-flex items-center justify-center gap-2 font-medium rounded-md " +
  "border transition-colors select-none whitespace-nowrap " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg " +
  "disabled:opacity-50 disabled:cursor-not-allowed " +
  "active:translate-y-px motion-reduce:active:translate-y-0";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-fg border-transparent hover:bg-primary-hover shadow-sm",
  secondary:
    "bg-surface text-text border-border hover:bg-surface-2 shadow-sm",
  ghost:
    "bg-transparent text-text border-transparent hover:bg-surface-2",
  danger:
    "bg-danger text-danger-fg border-transparent hover:opacity-90 shadow-sm",
};

const sizes: Record<ButtonSize, string> = {
  // Heights keep >=44px touch target on md/lg; sm is for dense desktop toolbars.
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

/**
 * Token-styled button. Variants: primary / secondary / ghost / danger.
 * Sizes sm/md/lg. `loading` shows a spinner and blocks clicks.
 *
 * <Button variant="primary" onClick={save}>Save</Button>
 * <Button variant="danger" loading={busy}>Delete</Button>
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    fullWidth = false,
    leftIcon,
    rightIcon,
    className,
    children,
    disabled,
    type,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        base,
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Spinner size={size === "lg" ? 18 : 16} />
      ) : (
        leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>
      )}
      {children}
      {!loading && rightIcon && (
        <span className="inline-flex shrink-0">{rightIcon}</span>
      )}
    </button>
  );
});

export default Button;
