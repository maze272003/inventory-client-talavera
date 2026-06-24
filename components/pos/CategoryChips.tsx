"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Icon } from "@/components/ui";

type Props = { value: string | undefined; onChange: (category: string | undefined) => void };

export default function CategoryChips({ value, onChange }: Props) {
  const categories = useQuery(api.products.categories) ?? [];
  const chip = (active: boolean) =>
    [
      "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-all",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active
        ? "border-primary bg-primary text-primary-fg shadow-sm"
        : "border-border bg-surface text-text-muted hover:bg-surface-2 hover:text-text",
    ].join(" ");
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button type="button" className={chip(value === undefined)} onClick={() => onChange(undefined)}>
        <span className="inline-flex items-center gap-1.5">
          <Icon name="tags" size={14} />
          All
        </span>
      </button>
      {categories.map((c) => (
        <button key={c} type="button" className={chip(value === c)} onClick={() => onChange(c)}>
          {c}
        </button>
      ))}
    </div>
  );
}
