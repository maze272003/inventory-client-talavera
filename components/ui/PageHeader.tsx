import type { ReactNode } from "react";
import { cn } from "./cn";
import { Icon, type IconName } from "./Icon";

export type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Optional leading icon rendered in a soft chip. */
  icon?: IconName;
  /** Optional small breadcrumb row above the title. */
  eyebrow?: ReactNode;
  /** Right-aligned actions slot (buttons, filters). Wraps below title on phone. */
  actions?: ReactNode;
  className?: string;
};

/**
 * Page title + optional subtitle, with a right-aligned actions slot that wraps
 * beneath the title on small screens.
 *
 * <PageHeader title="Products" subtitle="42 items" icon="tag"
 *   actions={<Button>Add product</Button>} />
 */
export function PageHeader({
  title,
  subtitle,
  icon,
  eyebrow,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6",
        className,
      )}
    >
      <div className="min-w-0 flex items-start gap-3">
        {icon && (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon name={icon} size={22} />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-0.5 text-xs font-medium text-text-subtle">{eyebrow}</p>
          )}
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-text-muted mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap shrink-0 sm:pt-0.5">
          {actions}
        </div>
      )}
    </div>
  );
}

export default PageHeader;
