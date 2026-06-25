/**
 * Pure mapping from the app's ToastOptions to Sonner call arguments.
 * Kept framework-free so it is unit-testable without a DOM.
 */
export type ToastVariant = "info" | "success" | "warning" | "danger";

export type ToastOptions = {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  /** Auto-dismiss after ms. Default 4000 (applied at call site). 0 = sticky. */
  duration?: number;
};

type SonnerMethod = "success" | "error" | "info" | "warning" | "message";

const VARIANT_METHOD: Record<ToastVariant, SonnerMethod> = {
  info: "info",
  success: "success",
  warning: "warning",
  danger: "error",
};

export function toToastArgs(opts: ToastOptions): {
  method: SonnerMethod;
  message: string;
  data: { description?: string; duration?: number };
} {
  const method = VARIANT_METHOD[opts.variant ?? "info"];
  const duration =
    opts.duration === undefined
      ? undefined
      : opts.duration <= 0
        ? Infinity
        : opts.duration;
  return {
    method,
    message: opts.title ?? "",
    data: { description: opts.description, duration },
  };
}
