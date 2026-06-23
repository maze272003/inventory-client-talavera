"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button, Dialog, Field, Input, useToast } from "@/components/ui";

type Row = { userId: Id<"users">; name: string };

function ResetPasswordForm({
  row,
  onClose,
}: {
  row: Row;
  onClose: () => void;
}) {
  const resetPassword = useAction(api.userAccounts.resetPassword);
  const { success, error: errorToast } = useToast();
  const [tempPassword, setTempPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await resetPassword({ userId: row.userId, tempPassword });
      success(
        "Password reset",
        `Share the new temporary password with ${row.name}.`
      );
      onClose();
    } catch (e) {
      errorToast(
        "Could not reset password",
        e instanceof Error ? e.message : "Failed."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Field label="New temporary password">
        <Input
          value={tempPassword}
          onChange={(e) => setTempPassword(e.target.value)}
          placeholder="At least 8 characters"
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={submit}
          loading={busy}
          disabled={busy || tempPassword.length < 8}
        >
          Reset password
        </Button>
      </div>
    </div>
  );
}

export default function ResetPasswordDialog({
  row,
  onClose,
}: {
  row: Row | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={row !== null}
      onClose={onClose}
      title={`Reset password${row ? ` — ${row.name}` : ""}`}
    >
      {row && (
        <ResetPasswordForm key={row.userId} row={row} onClose={onClose} />
      )}
    </Dialog>
  );
}
