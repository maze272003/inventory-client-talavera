import type { ReactNode } from "react";
import { cn } from "./cn";

export type Column<Row> = {
  /** Stable key for the column. */
  key: string;
  /** Header label (also used as the field label in mobile card mode). */
  header: ReactNode;
  /** Cell renderer. */
  cell: (row: Row, rowIndex: number) => ReactNode;
  /** Text alignment for the cell + header. */
  align?: "left" | "right" | "center";
  /** Hide this column's label in mobile card rows (e.g. for an actions column). */
  hideLabelOnCard?: boolean;
  /** Extra className applied to the <th>/<td> (desktop) and card field. */
  className?: string;
  /** Header-only className (desktop). */
  headerClassName?: string;
};

export type ResponsiveTableProps<Row> = {
  columns: Column<Row>[];
  rows: Row[];
  /** Unique key per row. */
  rowKey: (row: Row, index: number) => string;
  /** Caption for screen readers (visually hidden). */
  caption?: string;
  /** Optional click handler per row (makes rows/cards interactive). */
  onRowClick?: (row: Row, index: number) => void;
  /**
   * Optional custom mobile card renderer. When provided it replaces the default
   * label/value stack below `md`. Receives the same row + columns are ignored.
   */
  renderCard?: (row: Row, index: number) => ReactNode;
  /** Shown (full-width) when `rows` is empty — pass an <EmptyState>. */
  empty?: ReactNode;
  className?: string;
};

const alignClass = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

/**
 * The core responsive data primitive. Renders a semantic <table> at `md+` and
 * stacks each row into a labeled card below `md`. Pass column defs + rows, or a
 * `renderCard` render-prop for fully custom mobile cards.
 *
 * <ResponsiveTable rowKey={(r) => r._id} rows={items} columns={cols}
 *   empty={<EmptyState title="No items" />} />
 */
export function ResponsiveTable<Row>({
  columns,
  rows,
  rowKey,
  caption,
  onRowClick,
  renderCard,
  empty,
  className,
}: ResponsiveTableProps<Row>) {
  if (rows.length === 0 && empty) {
    return <div className={className}>{empty}</div>;
  }

  const clickable = !!onRowClick;

  return (
    <div className={className}>
      {/* Desktop / tablet: real table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="bg-surface-2 border-b border-border">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    "px-cell py-row font-medium text-text-muted",
                    alignClass[col.align ?? "left"],
                    col.headerClassName,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                onClick={clickable ? () => onRowClick!(row, i) : undefined}
                className={cn(
                  "bg-surface border-b border-border last:border-b-0 transition-colors",
                  clickable &&
                    "cursor-pointer hover:bg-surface-2 focus-within:bg-surface-2",
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-cell py-row text-text align-middle",
                      alignClass[col.align ?? "left"],
                      col.className,
                    )}
                  >
                    {col.cell(row, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <ul className="md:hidden flex flex-col gap-3" role="list">
        {rows.map((row, i) => (
          <li key={rowKey(row, i)}>
            {renderCard ? (
              renderCard(row, i)
            ) : (
              <div
                onClick={clickable ? () => onRowClick!(row, i) : undefined}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick!(row, i);
                        }
                      }
                    : undefined
                }
                className={cn(
                  "bg-surface border border-border rounded-lg shadow-sm p-cell flex flex-col gap-2",
                  clickable &&
                    "cursor-pointer transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                {columns.map((col) => (
                  <div
                    key={col.key}
                    className="flex items-start justify-between gap-3"
                  >
                    {!col.hideLabelOnCard && (
                      <span className="text-xs font-medium text-text-muted shrink-0">
                        {col.header}
                      </span>
                    )}
                    <span
                      className={cn(
                        "text-sm text-text min-w-0",
                        col.hideLabelOnCard ? "w-full" : "text-right",
                        col.className,
                      )}
                    >
                      {col.cell(row, i)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ResponsiveTable;
