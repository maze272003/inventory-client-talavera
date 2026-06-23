"use client";

import { ReactNode } from "react";
import { Card, CardHeader, CardBody, Skeleton, EmptyState } from "@/components/ui";

interface ChartFrameProps {
  title: string;
  toolbar?: ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyLabel?: string;
  className?: string;
  children: ReactNode;
}

export default function ChartFrame({
  title, toolbar, loading, empty, emptyLabel, className, children,
}: ChartFrameProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-text">{title}</h2>
        {toolbar}
      </CardHeader>
      <CardBody>
        {loading ? (
          <Skeleton height={260} />
        ) : empty ? (
          <EmptyState
            icon="bar-chart"
            title="No data"
            description={emptyLabel ?? "No sales in this range."}
          />
        ) : (
          <div className="h-[260px] w-full sm:h-[280px]">{children}</div>
        )}
      </CardBody>
    </Card>
  );
}
