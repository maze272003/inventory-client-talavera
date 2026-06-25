"use client";

import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "./AlertDialog";
import { Button } from "./Button";
import type { ButtonVariant } from "./Button";

export type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Called when the user confirms. May be async; button shows loading. */
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Confirm button variant. Default "danger" for destructive intent. */
  confirmVariant?: ButtonVariant;
  /** Show loading on the confirm button (caller-controlled). */
  loading?: boolean;
};

/**
 * Destructive-confirmation dialog built on Radix AlertDialog. Dismissal
 * (overlay click / Esc) is blocked while `loading` so an in-flight action is
 * never interrupted. Props are unchanged from the previous implementation.
 *
 * <ConfirmDialog open={open} onClose={close} onConfirm={archive}
 *   title="Archive product?" description="It will be hidden from the catalog."
 *   confirmLabel="Archive" loading={busy} />
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "danger",
  loading = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !loading) onClose();
      }}
    >
      <AlertDialogContent
        onEscapeKeyDown={(e) => {
          if (loading) e.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={() => void onConfirm()}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ConfirmDialog;
