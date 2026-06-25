"use client";

import { Dialog } from "@/components/ui";
import { PurchasesList } from "./PurchasesList";

export type PurchasesModalProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Modal hosting the purchases history list with expandable details and
 * archive/restore (the archived dialog nests on top of this one).
 */
export function PurchasesModal({ open, onClose }: PurchasesModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Purchases"
      description="Recorded supplier purchases."
      size="lg"
      className="max-w-3xl"
    >
      {open && (
        <PurchasesList key="purchases-list" embedded />
      )}
    </Dialog>
  );
}

export default PurchasesModal;
