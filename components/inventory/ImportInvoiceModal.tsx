"use client";

import { Dialog } from "@/components/ui";
import { ImportInvoiceForm } from "./ImportInvoiceForm";

export type ImportInvoiceModalProps = {
  open: boolean;
  onClose: () => void;
  /** Swap to the purchases modal after a successful import. */
  onViewPurchases?: () => void;
};

/**
 * Large centered modal hosting the full invoice import flow (PDF preview +
 * line entry). Keeps the 2-column layout intact on wide screens.
 */
export function ImportInvoiceModal({
  open,
  onClose,
  onViewPurchases,
}: ImportInvoiceModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Import Invoice"
      description="Upload a supplier invoice PDF, review the extracted lines, then import."
      size="lg"
      className="max-w-6xl"
    >
      {/* Key forces a fresh form instance each time the modal opens so state
          from a previous session never leaks in. */}
      {open && (
        <ImportInvoiceForm
          key="import-invoice-form"
          onClose={onClose}
          onViewPurchases={onViewPurchases}
          compact
        />
      )}
    </Dialog>
  );
}

export default ImportInvoiceModal;
