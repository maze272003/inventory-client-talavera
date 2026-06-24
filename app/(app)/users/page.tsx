"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
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
  Select,
  cn,
  useToast,
  type Column,
} from "@/components/ui";
import AddUserDialog from "@/components/users/AddUserDialog";
import ResetPasswordDialog from "@/components/users/ResetPasswordDialog";

type Row = {
  userId: Id<"users">;
  name: string;
  email: string | null;
  role: "admin" | "cashier";
  disabled: boolean;
  lastActiveAt: number | null;
  totalSales: number;
};

function initialsFor(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export default function UsersPage() {
  const currentUser = useQuery(api.users.currentUser);
  const isAdmin = currentUser?.role === "admin";
  const roster = useQuery(api.users.list, isAdmin ? {} : "skip");
  const setRole = useMutation(api.users.setRole);
  const setDisabled = useMutation(api.users.setDisabled);
  const { success, error: errorToast } = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [resetFor, setResetFor] = useState<Row | null>(null);
  const [confirmDisable, setConfirmDisable] = useState<Row | null>(null);

  if (currentUser === undefined) {
    return (
      <div>
        <PageHeader
          title="Users"
          icon="users"
          subtitle="Manage cashier & admin accounts"
        />
        <Card className="overflow-hidden shadow-sm">
          <div className="divide-y divide-border" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-cell py-row"
              >
                <Skeleton height={36} width={36} rounded />
                <div className="flex-1 space-y-2">
                  <Skeleton height={14} width="40%" />
                  <Skeleton height={12} width="55%" />
                </div>
                <Skeleton height={36} width={120} />
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
          title="Users"
          icon="users"
          subtitle="Manage cashier & admin accounts"
        />
        <EmptyState
          icon="shield"
          title="Admins only"
          description="You do not have permission to view this page."
        />
      </div>
    );
  }

  async function onRoleChange(row: Row, role: "admin" | "cashier") {
    try {
      await setRole({ userId: row.userId, role });
      success("Role updated", `${row.name} is now ${role}.`);
    } catch (e) {
      errorToast(
        "Could not change role",
        e instanceof Error ? e.message : "Failed."
      );
    }
  }

  async function onToggleDisabled(row: Row) {
    try {
      await setDisabled({ userId: row.userId, disabled: !row.disabled });
      success(
        row.disabled ? "Reactivated" : "Disabled",
        `${row.name} ${row.disabled ? "can log in again." : "can no longer log in."}`
      );
      setConfirmDisable(null);
    } catch (e) {
      errorToast(
        "Action failed",
        e instanceof Error ? e.message : "Failed."
      );
    }
  }

  const rows = (roster ?? []) as Row[];

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Name",
      cell: (r) => (
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
            {initialsFor(r.name)}
          </span>
          <div className="min-w-0">
            <div className="text-text font-medium truncate">{r.name}</div>
            <div className="text-text-muted text-xs truncate">
              {r.email ?? "—"}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (r) => (
        <Select
          value={r.role}
          onChange={(e) =>
            onRoleChange(r, e.target.value as "admin" | "cashier")
          }
          disabled={r.userId === currentUser._id}
          className="w-32"
        >
          <option value="cashier">Cashier</option>
          <option value="admin">Admin</option>
        </Select>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <Badge variant={r.disabled ? "neutral" : "success"}>
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              r.disabled ? "bg-text-muted" : "bg-success"
            )}
          />
          {r.disabled ? "Disabled" : "Active"}
        </Badge>
      ),
    },
    {
      key: "last",
      header: "Last active",
      cell: (r) => (
        <span className="text-text-muted whitespace-nowrap tabular-nums">
          {r.lastActiveAt ? formatDate(r.lastActiveAt) : "—"}
        </span>
      ),
    },
    {
      key: "sales",
      header: "Sales",
      align: "right",
      cell: (r) => (
        <span className="font-semibold text-text tabular-nums">
          {r.totalSales}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      hideLabelOnCard: true,
      cell: (r) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setResetFor(r)}
            leftIcon={<Icon name="rotate-ccw" size={16} />}
          >
            Reset password
          </Button>
          <Button
            variant={r.disabled ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setConfirmDisable(r)}
            disabled={r.userId === currentUser._id}
            leftIcon={
              <Icon
                name={r.disabled ? "check-circle" : "x-circle"}
                size={16}
              />
            }
          >
            {r.disabled ? "Reactivate" : "Disable"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Users"
        icon="users"
        subtitle="Manage cashier & admin accounts"
        actions={
          <Button
            onClick={() => setAddOpen(true)}
            className="shadow-primary"
            leftIcon={<Icon name="plus" size={16} />}
          >
            Add user
          </Button>
        }
      />

      {roster === undefined ? (
        <Card className="overflow-hidden shadow-sm">
          <div className="divide-y divide-border" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-cell py-row"
              >
                <Skeleton height={36} width={36} rounded />
                <div className="flex-1 space-y-2">
                  <Skeleton height={14} width="40%" />
                  <Skeleton height={12} width="55%" />
                </div>
                <Skeleton height={36} width={120} />
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden shadow-sm">
          <ResponsiveTable<Row>
            caption="User accounts"
            rows={rows}
            rowKey={(r) => r.userId}
            columns={columns}
            empty={
              <EmptyState
                icon="users"
                title="No users yet"
                description="Add a cashier to get started."
              />
            }
          />
        </Card>
      )}

      <AddUserDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <ResetPasswordDialog row={resetFor} onClose={() => setResetFor(null)} />
      <ConfirmDialog
        open={confirmDisable !== null}
        onClose={() => setConfirmDisable(null)}
        onConfirm={() => { if (confirmDisable) void onToggleDisabled(confirmDisable); }}
        title={
          confirmDisable?.disabled ? "Reactivate account?" : "Disable account?"
        }
        description={
          confirmDisable
            ? `${confirmDisable.disabled ? "Restore access for" : "Revoke access for"} ${confirmDisable.name}. History is preserved.`
            : undefined
        }
        confirmLabel={confirmDisable?.disabled ? "Reactivate" : "Disable"}
        confirmVariant={confirmDisable?.disabled ? "primary" : "danger"}
      />
    </div>
  );
}
