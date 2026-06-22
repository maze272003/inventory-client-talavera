"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

export type ToastVariant = "info" | "success" | "warning" | "danger";

export type ToastOptions = {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  /** Auto-dismiss after ms. Default 4000. Pass 0 to require manual dismiss. */
  duration?: number;
};

type ToastItem = ToastOptions & { id: number };

type ToastContextValue = {
  /** Push a toast. Returns its id. */
  toast: (opts: ToastOptions) => number;
  /** Convenience helpers. */
  success: (title: string, description?: string) => number;
  error: (title: string, description?: string) => number;
  info: (title: string, description?: string) => number;
  warning: (title: string, description?: string) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/** True once mounted on the client — safe gate for createPortal (no SSR DOM). */
const noop = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

const variantStyles: Record<ToastVariant, { cls: string; icon: IconName }> = {
  info: { cls: "border-border", icon: "info" },
  success: { cls: "border-success", icon: "check" },
  warning: { cls: "border-warning", icon: "alert-triangle" },
  danger: { cls: "border-danger", icon: "alert-triangle" },
};

const iconColor: Record<ToastVariant, string> = {
  info: "text-text-muted",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

/**
 * Provides toast context + renders the live region. Wrap the app once (done in
 * app/layout.tsx). Consume via useToast().
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const mounted = useIsClient();

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((opts: ToastOptions) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, variant: "info", ...opts }]);
    return id;
  }, []);

  const success = useCallback(
    (title: string, description?: string) =>
      toast({ title, description, variant: "success" }),
    [toast],
  );
  const error = useCallback(
    (title: string, description?: string) =>
      toast({ title, description, variant: "danger" }),
    [toast],
  );
  const info = useCallback(
    (title: string, description?: string) =>
      toast({ title, description, variant: "info" }),
    [toast],
  );
  const warning = useCallback(
    (title: string, description?: string) =>
      toast({ title, description, variant: "warning" }),
    [toast],
  );

  const value = useMemo<ToastContextValue>(
    () => ({ toast, success, error, info, warning, dismiss }),
    [toast, success, error, info, warning, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div
            className="fixed bottom-4 right-4 left-4 sm:left-auto flex flex-col gap-2 pointer-events-none"
            style={{ zIndex: "var(--z-toast)" }}
            aria-live="polite"
            aria-atomic="false"
          >
            {toasts.map((t) => (
              <ToastCard key={t.id} item={t} onDismiss={dismiss} />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const variant = item.variant ?? "info";
  const duration = item.duration ?? 4000;

  useEffect(() => {
    if (duration <= 0) return;
    const t = setTimeout(() => onDismiss(item.id), duration);
    return () => clearTimeout(t);
  }, [duration, item.id, onDismiss]);

  const { cls, icon } = variantStyles[variant];

  return (
    <div
      role={variant === "danger" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto w-full sm:w-80 bg-surface border-l-4 border border-border rounded-lg shadow-md p-cell flex items-start gap-3",
        cls,
      )}
    >
      <Icon name={icon} size={18} className={cn("mt-0.5 shrink-0", iconColor[variant])} />
      <div className="min-w-0 flex-1">
        {item.title && (
          <p className="text-sm font-medium text-text">{item.title}</p>
        )}
        {item.description && (
          <p className="text-sm text-text-muted mt-0.5 break-words">
            {item.description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss notification"
        className="shrink-0 -mr-1 -mt-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

/**
 * Access the toast API.
 *
 * const { success, error } = useToast();
 * success("Sale complete", "Receipt #1042 saved");
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

export default ToastProvider;
