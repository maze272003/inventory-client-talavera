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
  Select,
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
  | "adjustment"
  | "password_reset";

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
  userEmail: string | null;
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
  password_reset: "neutral",
};

const ACTION_LABEL: Record<AuditAction, string> = {
  create: "Create",
  update: "Update",
  archive: "Archive",
  restore: "Restore",
  sale: "Sale",
  stock_in: "Stock In",
  adjustment: "Adjustment",
  password_reset: "Password Reset",
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
  const [filterUserId, setFilterUserId] = useState<Id<"users"> | "">("");
  const [filterAction, setFilterAction] = useState("");
  const [filterEntity, setFilterEntity] = useState("");

  const isAdmin = currentUser?.role === "admin";

  const roster = useQuery(api.users.list, isAdmin ? {} : "skip");

  const latest = useQuery(
    api.audit.latest,
    isAdmin ? {} : "skip"
  );
  const { results, status, loadMore } = usePaginatedQuery(
    api.audit.list,
    isAdmin
      ? {
          ...(filterUserId ? { userId: filterUserId as Id<"users"> } : {}),
          ...(filterAction ? { action: filterAction } : {}),
          ...(filterEntity ? { entityTable: filterEntity } : {}),
        }
      : "skip",
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
      cell: (entry) => (
        <div>
          <div className="text-text">{entry.userName}</div>
          {entry.userEmail && (
            <div className="text-text-muted text-xs">{entry.userEmail}</div>
          )}
        </div>
      ),
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

      <div className="flex flex-wrap gap-2 mb-4">
        <Select
          value={filterUserId}
          onChange={(e) => setFilterUserId(e.target.value as Id<"users"> | "")}
          className="w-48"
        >
          <option value="">All users</option>
          {(roster ?? []).map((u) => (
            <option key={u.userId} value={u.userId}>
              {u.name}
            </option>
          ))}
        </Select>
        <Select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="w-48"
        >
          <option value="">All actions</option>
          {(
            [
              "create",
              "update",
              "archive",
              "restore",
              "sale",
              "stock_in",
              "adjustment",
              "password_reset",
            ] as AuditAction[]
          ).map((a) => (
            <option key={a} value={a}>
              {actionLabel(a)}
            </option>
          ))}
        </Select>
        <Select
          value={filterEntity}
          onChange={(e) => setFilterEntity(e.target.value)}
          className="w-48"
        >
          <option value="">All entities</option>
          {["products", "purchases", "sales", "users"].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </div>

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
