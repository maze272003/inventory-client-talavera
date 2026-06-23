"use client";

import { useState } from "react";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatDate } from "@/lib/format";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Icon,
  PageHeader,
  ResponsiveTable,
  Skeleton,
  useToast,
  type Column,
} from "@/components/ui";

type AuditAction =
  | "create"
  | "update"
  | "archive"
  | "restore"
  | "sale"
  | "stock_in"
  | "adjustment";

type AuditEntry = {
  _id: Id<"auditLog">;
  _creationTime: number;
  entityTable: string;
  entityId: string;
  action: AuditAction;
  summary: string;
  undoable: boolean;
  reverted: boolean;
  userId: Id<"users">;
  userName: string;
};

type BadgeVariant = "neutral" | "primary" | "success" | "warning" | "danger";

const ACTION_VARIANT: Record<AuditAction, BadgeVariant> = {
  create: "success",
  update: "primary",
  archive: "warning",
  restore: "success",
  sale: "primary",
  stock_in: "success",
  adjustment: "warning",
};

const ACTION_LABEL: Record<AuditAction, string> = {
  create: "Create",
  update: "Update",
  archive: "Archive",
  restore: "Restore",
  sale: "Sale",
  stock_in: "Stock In",
  adjustment: "Adjustment",
};

function actionVariant(action: string): BadgeVariant {
  return ACTION_VARIANT[action as AuditAction] ?? "neutral";
}

function actionLabel(action: string): string {
  return ACTION_LABEL[action as AuditAction] ?? action;
}

export default function AuditLogPage() {
  const currentUser = useQuery(api.users.currentUser);
  const { success, error: errorToast } = useToast();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reverting, setReverting] = useState(false);

  const isAdmin = currentUser?.role === "admin";

  const latest = useQuery(
    api.audit.latest,
    isAdmin ? {} : "skip"
  );
  const { results, status, loadMore } = usePaginatedQuery(
    api.audit.list,
    isAdmin ? {} : "skip",
    { initialNumItems: 20 }
  );

  const revertLatest = useMutation(api.audit.revertLatest);

  if (currentUser === undefined) {
    return (
      <div>
        <PageHeader title="Audit Log" />
        <Card>
          <div className="p-cell space-y-3">
            <Skeleton height={40} />
            <Skeleton height={40} />
            <Skeleton height={40} />
            <Skeleton height={40} />
            <Skeleton height={40} />
          </div>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Audit Log" />
        <EmptyState
          icon="user"
          title="Admins only"
          description="You do not have permission to view this page."
        />
      </div>
    );
  }

  // The single most-recent non-reverted entry that can be undone.
  const undoableEntryId =
    latest && latest.undoable && !latest.reverted ? latest._id : null;

  async function handleRevert() {
    if (reverting || !undoableEntryId) return;
    setReverting(true);
    try {
      await revertLatest({ entryId: undoableEntryId });
      success("Change undone", "The most recent change has been reverted.");
      setConfirmOpen(false);
    } catch (err: unknown) {
      errorToast(
        "Could not undo change",
        err instanceof Error ? err.message : "Failed to revert the change."
      );
    } finally {
      setReverting(false);
    }
  }

  const rows = results as AuditEntry[];

  const columns: Column<AuditEntry>[] = [
    {
      key: "time",
      header: "Time",
      cell: (entry) => (
        <span className="text-text-muted whitespace-nowrap tabular-nums">
          {formatDate(entry._creationTime)}
        </span>
      ),
    },
    {
      key: "user",
      header: "User",
      cell: (entry) => <span className="text-text">{entry.userName}</span>,
    },
    {
      key: "entity",
      header: "Entity",
      cell: (entry) => (
        <span className="text-text-muted font-mono text-xs">
          {entry.entityTable}
        </span>
      ),
    },
    {
      key: "action",
      header: "Action",
      cell: (entry) => (
        <Badge variant={actionVariant(entry.action)}>
          {actionLabel(entry.action)}
        </Badge>
      ),
    },
    {
      key: "summary",
      header: "Summary",
      cell: (entry) => <span className="text-text">{entry.summary}</span>,
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      cell: (entry) => {
        const canUndo = entry._id === undoableEntryId;
        return (
          <div className="flex items-center justify-end gap-2">
            {entry.reverted && <Badge variant="neutral">Reverted</Badge>}
            {canUndo && (
              <Button
                variant="secondary"
                onClick={() => setConfirmOpen(true)}
                leftIcon={<Icon name="refresh" size={16} />}
              >
                Undo
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="A newest-first history of data changes. Only the most recent undoable change can be reverted."
      />

      {status === "LoadingFirstPage" ? (
        <Card>
          <div className="p-cell space-y-3">
            <Skeleton height={40} />
            <Skeleton height={40} />
            <Skeleton height={40} />
            <Skeleton height={40} />
            <Skeleton height={40} />
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ResponsiveTable<AuditEntry>
            caption="Audit log entries"
            rows={rows}
            rowKey={(e) => e._id}
            columns={columns}
            empty={
              <EmptyState
                icon="refresh"
                title="No audit entries yet"
                description="Data changes will be recorded here as they happen."
              />
            }
          />

          {status === "CanLoadMore" && (
            <div className="flex justify-center py-row border-t border-border">
              <Button variant="ghost" onClick={() => loadMore(20)}>
                Load more
              </Button>
            </div>
          )}
          {status === "LoadingMore" && (
            <div className="flex justify-center py-row border-t border-border">
              <Skeleton height={20} width={120} />
            </div>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleRevert}
        title="Undo latest change?"
        description={
          latest
            ? `This will revert: "${latest.summary}". Only the most recent change can be undone, and this action cannot be redone.`
            : undefined
        }
        confirmLabel="Undo change"
        confirmVariant="danger"
        loading={reverting}
      />
    </div>
  );
}
