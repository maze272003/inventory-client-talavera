"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { Icon } from "./Icon";
import { useFocusTrap } from "./useFocusTrap";
import { useLockBodyScroll } from "./useLockBodyScroll";

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Footer slot (action buttons). */
  footer?: ReactNode;
  /** Max width preset. Default "md". */
  size?: "sm" | "md" | "lg";
  /** Hide the default close (X) button. */
  hideClose?: boolean;
  /** Disable closing on scrim click / ESC (e.g. while a mutation is in flight). */
  dismissable?: boolean;
  className?: string;
};

const sizes = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

/**
 * Accessible modal dialog: focus trap, ESC to close, scrim click to dismiss,
 * body-scroll lock, role="dialog" + aria-modal, portaled at z-modal.
 *
 * <Dialog open={open} onClose={close} title="Edit" footer={<Button>Save</Button>}>
 *   …
 * </Dialog>
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  hideClose = false,
  dismissable = true,
  className,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const title_id = title ? "dialog-title" : undefined;
  const desc_id = description ? "dialog-desc" : undefined;

  useLockBodyScroll(open);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && dismissable) {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, dismissable, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: "var(--z-modal)" }}
    >
      {/* Scrim */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => dismissable && onClose()}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title_id}
        aria-describedby={desc_id}
        className={cn(
          "relative w-full bg-surface border border-border rounded-xl shadow-md flex flex-col max-h-[90vh]",
          sizes[size],
          className,
        )}
      >
        {(title || !hideClose) && (
          <div className="flex items-start justify-between gap-4 px-cell py-row border-b border-border">
            <div className="min-w-0">
              {title && (
                <h2
                  id={title_id}
                  className="text-base font-semibold text-text"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p id={desc_id} className="text-sm text-text-muted mt-0.5">
                  {description}
                </p>
              )}
            </div>
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="shrink-0 -mr-1 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon name="close" size={18} />
              </button>
            )}
          </div>
        )}
        <div className="px-cell py-row overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-cell py-row border-t border-border flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default Dialog;
