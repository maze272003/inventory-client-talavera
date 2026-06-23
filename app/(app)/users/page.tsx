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
        <PageHeader title="Users" />
        <Card>
          <div className="p-cell space-y-3">
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
        <PageHeader title="Users" />
        <EmptyState
          icon="user"
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
        <div>
          <div className="text-text">{r.name}</div>
          <div className="text-text-muted text-xs">{r.email ?? "—"}</div>
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
          {r.disabled ? "Disabled" : "Active"}
        </Badge>
      ),
    },
    {
      key: "last",
      header: "Last active",
      cell: (r) => (
        <span className="text-text-muted whitespace-nowrap">
          {r.lastActiveAt ? formatDate(r.lastActiveAt) : "—"}
        </span>
      ),
    },
    {
      key: "sales",
      header: "Sales",
      align: "right",
      cell: (r) => (
        <span className="tabular-nums">{r.totalSales}</span>
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
            leftIcon={<Icon name="refresh" size={16} />}
          >
            Reset password
          </Button>
          <Button
            variant={r.disabled ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setConfirmDisable(r)}
            disabled={r.userId === currentUser._id}
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
        subtitle="Manage cashier and admin accounts."
        actions={
          <Button
            onClick={() => setAddOpen(true)}
            leftIcon={<Icon name="user" size={16} />}
          >
            Add user
          </Button>
        }
      />

      {roster === undefined ? (
        <Card>
          <div className="p-cell space-y-3">
            <Skeleton height={40} />
            <Skeleton height={40} />
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ResponsiveTable<Row>
            caption="User accounts"
            rows={rows}
            rowKey={(r) => r.userId}
            columns={columns}
            empty={
              <EmptyState
                icon="user"
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
