import { cn } from "./cn";

export type SpinnerProps = {
  /** Pixel diameter. Default 16. */
  size?: number;
  className?: string;
  /** Accessible label for screen readers. Default "Loading". */
  label?: string;
};

/**
 * Inline busy indicator. A spinning ring drawn with currentColor, so it inherits
 * the text color of its context (e.g. white inside a primary Button).
 * Honors prefers-reduced-motion via the global CSS rule.
 */
export function Spinner({ size = 16, className, label = "Loading" }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn("inline-block animate-spin", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
          strokeOpacity="0.25"
        />
        <path
          d="M22 12a10 10 0 0 0-10-10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export default Spinner;
