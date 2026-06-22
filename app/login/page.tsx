"use client";

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardBody,
  Field,
  Input,
  Icon,
  useToast,
} from "@/components/ui";

export default function LoginPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn("password", { email, password, flow: "signIn" });
      success("Signed in", "Welcome back.");
      router.push("/dashboard");
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Sign in failed. Check your credentials.";
      setError(message);
      toastError("Sign in failed", message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-cell py-row">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span
            className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-subtle"
            aria-hidden="true"
          >
            <Icon name="package" />
          </span>
          <h1 className="text-2xl font-bold text-text">Sign in</h1>
          <p className="mt-1 text-sm text-text-muted">
            Sales &amp; Inventory Management
          </p>
        </div>

        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <Field label="Email" required>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@shop.local"
                  invalid={!!error}
                />
              </Field>

              <Field label="Password" required>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  invalid={!!error}
                />
              </Field>

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-danger-fg/30 bg-danger-bg px-3 py-2 text-sm text-danger-fg"
                >
                  <Icon name="alert-triangle" className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" fullWidth loading={loading}>
                Sign in
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
