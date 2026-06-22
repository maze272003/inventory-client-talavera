import type { ReactNode } from "react";
import { cn } from "./cn";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

export type EmptyStateProps = {
  /** Icon name from the bundled set. Default "info". */
  icon?: IconName;
  title: string;
  description?: string;
  /** Optional action node (usually a <Button>). */
  action?: ReactNode;
  className?: string;
};

/**
 * Friendly empty placeholder for zero-result lists/tables.
 *
 * <EmptyState icon="package" title="No products yet"
 *   description="Add your first product to get started."
 *   action={<Button>Add product</Button>} />
 */
export function EmptyState({
  icon = "info",
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-6 py-12 gap-3",
        className,
      )}
    >
      <span className="flex items-center justify-center h-12 w-12 rounded-full bg-surface-2 text-text-muted">
        <Icon name={icon} size={24} />
      </span>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-text">{title}</h3>
        {description && (
          <p className="text-sm text-text-muted max-w-sm">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export default EmptyState;
