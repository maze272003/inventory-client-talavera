"use client";
import { SegmentedControl } from "@/components/ui";

type StockFilter = "all" | "inStock" | "low" | "out";
type Props = { value: StockFilter; onChange: (v: StockFilter) => void };

export default function PosFilters({ value, onChange }: Props) {
  return (
    <SegmentedControl
      size="sm"
      value={value}
      onChange={(v) => onChange(v as StockFilter)}
      options={[
        { value: "all", label: "All" },
        { value: "inStock", label: "In stock" },
        { value: "low", label: "Low" },
        { value: "out", label: "Out" },
      ]}
      ariaLabel="Stock availability filter"
    />
  );
}
