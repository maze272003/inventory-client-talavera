import type { ReactNode } from "react";
import { cn } from "./cn";

export type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned actions slot (buttons, filters). Wraps below title on phone. */
  actions?: ReactNode;
  className?: string;
};

/**
 * Page title + optional subtitle, with a right-aligned actions slot that wraps
 * beneath the title on small screens.
 *
 * <PageHeader title="Products" subtitle="42 items"
 *   actions={<Button>Add product</Button>} />
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold text-text truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-text-muted mt-1">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}

export default PageHeader;
