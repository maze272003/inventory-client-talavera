"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  EmptyState,
  PageHeader,
} from "@/components/ui";
import {
  ImportInvoiceForm,
  ImportInvoiceFormSkeleton,
} from "@/components/inventory/ImportInvoiceForm";

export default function ImportPage() {
  const currentUser = useQuery(api.users.currentUser);

  if (currentUser === undefined) {
    return (
      <div>
        <PageHeader title="Import Invoice" icon="upload" />
        <ImportInvoiceFormSkeleton />
      </div>
    );
  }
  if (currentUser?.role !== "admin") {
    return (
      <div>
        <PageHeader title="Import Invoice" icon="upload" />
        <EmptyState
          icon="alert-triangle"
          title="Admins only"
          description="You do not have permission to import invoices."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Import Invoice"
        icon="upload"
        subtitle="Upload a supplier invoice PDF, review the extracted lines, then import."
      />
      <ImportInvoiceForm />
    </div>
  );
}
