"use client";

import { use } from "react";
import Link from "next/link";
import { Id } from "@/convex/_generated/dataModel";
import Receipt from "@/components/Receipt";

type Props = {
  params: Promise<{ id: string }>;
};

export default function ReceiptDetailPage({ params }: Props) {
  const { id } = use(params);

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/receipts"
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
        >
          ← Back to Receipts
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Receipt Detail</h1>
      </div>
      <Receipt saleId={id as Id<"sales">} />
    </div>
  );
}
