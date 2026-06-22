"use client";

import { Field, Input } from "@/components/ui";

interface DateRangePickerProps {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
}

export default function DateRangePicker({
  from,
  to,
  onFromChange,
  onToChange,
}: DateRangePickerProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="From">
        <Input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => onFromChange(e.target.value)}
        />
      </Field>
      <Field label="To">
        <Input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => onToChange(e.target.value)}
        />
      </Field>
    </div>
  );
}
