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
  CardBody,
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
        <PageHeader
          title="Audit Log"
          icon="history"
          subtitle="Newest-first change history. Only the latest undoable change can be reverted."
        />
        <Card className="overflow-hidden shadow-sm">
          <div className="divide-y divide-border" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-cell py-row"
              >
                <Skeleton height={14} width="18%" />
                <Skeleton height={14} width="22%" />
                <Skeleton height={18} width="14%" rounded />
                <div className="flex-1" />
                <Skeleton height={14} width="20%" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div>
        <PageHeader
          title="Audit Log"
          icon="history"
          subtitle="Newest-first change history. Only the latest undoable change can be reverted."
        />
        <EmptyState
          icon="shield"
          title="Admins only"
          description="You do not have permission to view this page."
        />
      </div>
    );
  }

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
        <div className="min-w-0">
          <div className="text-text truncate">{entry.userName}</div>
          {entry.userEmail && (
            <div className="text-text-muted text-xs truncate">
              {entry.userEmail}
            </div>
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
      cell: (entry) => (
        <span className="text-text">{entry.summary}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      cell: (entry) => {
        const canUndo = entry._id === undoableEntryId;
        return (
          <div className="flex items-center justify-end gap-2">
            {entry.reverted && (
              <Badge variant="neutral">
                <Icon name="rotate-ccw" size={12} />
                Reverted
              </Badge>
            )}
            {canUndo && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                leftIcon={<Icon name="rotate-ccw" size={16} />}
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
        icon="history"
        subtitle="Newest-first change history. Only the latest undoable change can be reverted."
      />

      <Card className="mb-4 shadow-sm">
        <CardBody className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted mr-1">
            <Icon name="filter" size={16} />
            <span className="hidden sm:inline">Filter</span>
          </span>
          <Select
            value={filterUserId}
            onChange={(e) =>
              setFilterUserId(e.target.value as Id<"users"> | "")
            }
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
            className="w-44"
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
            className="w-44"
          >
            <option value="">All entities</option>
            {["products", "purchases", "sales", "users"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </CardBody>
      </Card>

      {status === "LoadingFirstPage" ? (
        <Card className="overflow-hidden shadow-sm">
          <div className="divide-y divide-border" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-cell py-row"
              >
                <Skeleton height={14} width="18%" />
                <Skeleton height={14} width="22%" />
                <Skeleton height={18} width="14%" rounded />
                <div className="flex-1" />
                <Skeleton height={14} width="20%" />
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden shadow-sm">
          <ResponsiveTable<AuditEntry>
            caption="Audit log entries"
            rows={rows}
            rowKey={(e) => e._id}
            columns={columns}
            empty={
              <EmptyState
                icon="history"
                title="No audit entries yet"
                description="Data changes will be recorded here as they happen."
              />
            }
          />

          {status === "CanLoadMore" && (
            <div className="flex justify-center py-row border-t border-border">
              <Button
                variant="ghost"
                onClick={() => loadMore(20)}
                leftIcon={<Icon name="chevron-down" size={16} />}
              >
                Load more
              </Button>
            </div>
          )}
          {status === "LoadingMore" && (
            <div
              className="flex justify-center py-row border-t border-border"
              aria-busy="true"
              aria-live="polite"
            >
              <Skeleton height={16} width={140} />
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
