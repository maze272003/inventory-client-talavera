"use client";

import type { ReactNode } from "react";
import { Dialog } from "./Dialog";
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
 * Thin destructive-confirmation wrapper over Dialog. Use before irreversible
 * actions (archive, delete, void).
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
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      dismissable={!loading}
      footer={
        <>
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
        </>
      }
    >
      {description && (
        <p className="text-sm text-text-muted">{description}</p>
      )}
    </Dialog>
  );
}

export default ConfirmDialog;
