"use client";

import { use } from "react";
import Link from "next/link";
import { Id } from "@/convex/_generated/dataModel";
import Receipt from "@/components/Receipt";
import { PageHeader, Icon } from "@/components/ui";

type Props = {
  params: Promise<{ id: string }>;
};

export default function ReceiptDetailPage({ params }: Props) {
  const { id } = use(params);

  return (
    <div>
      <Link
        href="/receipts"
        className="mb-4 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-primary hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        <Icon name="chevron-left" size={16} aria-hidden="true" />
        Back to Receipts
      </Link>

      <PageHeader title="Receipt detail" className="mb-6" />

      <Receipt saleId={id as Id<"sales">} />
    </div>
  );
}
