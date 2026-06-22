"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { Icon } from "./Icon";
import { useFocusTrap } from "./useFocusTrap";
import { useLockBodyScroll } from "./useLockBodyScroll";

export type DrawerSide = "left" | "right";

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  /** Which edge the panel slides from. Default "right". */
  side?: DrawerSide;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Panel width (CSS). Default responsive ~24rem capped to viewport. */
  width?: string;
  /** Disable closing on scrim click / ESC. */
  dismissable?: boolean;
  /** Hide the default close (X) button. */
  hideClose?: boolean;
  className?: string;
};

/**
 * Accessible side panel for forms and detail views (ledger, product edit).
 * Focus trap, ESC, scrim, body-scroll lock, role="dialog", portaled at z-drawer.
 *
 * <Drawer open={open} onClose={close} title="Stock ledger" side="right">…</Drawer>
 */
export function Drawer({
  open,
  onClose,
  side = "right",
  title,
  description,
  children,
  footer,
  width = "min(24rem, 100vw)",
  dismissable = true,
  hideClose = false,
  className,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const title_id = title ? "drawer-title" : undefined;
  const desc_id = description ? "drawer-desc" : undefined;

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
    <div className="fixed inset-0" style={{ zIndex: "var(--z-drawer)" }}>
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
        style={{ width }}
        className={cn(
          "absolute top-0 bottom-0 bg-surface border-border shadow-md flex flex-col max-w-full",
          side === "right" ? "right-0 border-l" : "left-0 border-r",
          className,
        )}
      >
        {(title || !hideClose) && (
          <div className="flex items-start justify-between gap-4 px-cell py-row border-b border-border shrink-0">
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
                aria-label="Close panel"
                className="shrink-0 -mr-1 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon name="close" size={18} />
              </button>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-cell py-row">{children}</div>
        {footer && (
          <div className="px-cell py-row border-t border-border flex items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default Drawer;
