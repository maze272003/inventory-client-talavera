"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button, Dialog, Field, Input, Label, Select, useToast } from "@/components/ui";

function genPassword() {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function AddUserDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const createUser = useAction(api.userAccounts.createUser);
  const { success, error: errorToast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tempPassword, setTempPassword] = useState(genPassword());
  const [role, setRole] = useState<"admin" | "cashier">("cashier");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{
    email: string;
    tempPassword: string;
  } | null>(null);

  function reset() {
    setName("");
    setEmail("");
    setTempPassword(genPassword());
    setRole("cashier");
    setCreated(null);
  }

  async function submit() {
    setBusy(true);
    try {
      await createUser({ name, email, tempPassword, role });
      setCreated({ email: email.trim().toLowerCase(), tempPassword });
      success("Account created", "Share the credentials with the user.");
    } catch (e) {
      errorToast(
        "Could not create account",
        e instanceof Error ? e.message : "Failed."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Add user"
    >
      {created ? (
        <div className="space-y-3">
          <p className="text-text">Account created. Share these credentials:</p>
          <div className="rounded-md bg-surface-2 p-cell font-mono text-sm">
            <div>Email: {created.email}</div>
            <div>Temp password: {created.tempPassword}</div>
          </div>
          <Button
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Maria Santos"
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maria@shop.local"
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <Label>Temporary password</Label>
            <div className="flex gap-2">
              <Input
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
              />
              <Button
                variant="secondary"
                type="button"
                onClick={() => setTempPassword(genPassword())}
              >
                Generate
              </Button>
            </div>
          </div>
          <Field label="Role">
            <Select
              value={role}
              onChange={(e) =>
                setRole(e.target.value as "admin" | "cashier")
              }
            >
              <option value="cashier">Cashier</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={submit}
              loading={busy}
              disabled={busy || !name || !email || tempPassword.length < 8}
            >
              Create account
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
