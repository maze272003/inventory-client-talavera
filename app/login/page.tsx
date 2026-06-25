"use client";

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import {
  Alert,
  AlertDescription,
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
  const [showPw, setShowPw] = useState(false);

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

  const benefits = [
    { icon: "zap", label: "Lightning-fast checkout at the counter" },
    { icon: "boxes", label: "Real-time inventory across every bay" },
    { icon: "bar-chart", label: "Live sales insights & performance" },
  ] as const;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-brand-gradient lg:flex lg:flex-col lg:justify-between p-12 text-primary-fg">
        <div className="pointer-events-none absolute -top-32 -right-24 h-80 w-80 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-black/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
            <Icon name="wrench" />
          </span>
          <span className="text-lg font-semibold tracking-tight">
            MotorShop POS
          </span>
        </div>

        <div className="relative max-w-md">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-white/20 backdrop-blur">
            <Icon name="sparkles" size={14} />
            <span>Built for busy shops</span>
          </div>
          <h2 className="text-3xl font-bold leading-tight">
            Motor parts retail &amp; repair — one fast register.
          </h2>
          <p className="mt-3 text-sm text-primary-fg/80">
            Run the counter, the shelf, and the service bay from a single,
            lightning-fast workspace built for mechanics and merchants.
          </p>

          <ul className="mt-8 space-y-3">
            {benefits.map((b) => (
              <li key={b.icon} className="flex items-center gap-3 text-sm">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20 backdrop-blur">
                  <Icon name={b.icon} size={18} />
                </span>
                <span>{b.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-primary-fg/70">
          <Icon name="shield" size={14} />
          <span>Secured register access — staff only.</span>
        </div>
      </aside>

      <div className="flex min-h-screen items-center justify-center bg-bg px-cell py-row">
        <div className="w-full max-w-md">
          <div className="mb-6 flex flex-col items-center text-center lg:hidden">
            <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-primary">
              <Icon name="wrench" />
            </span>
            <span className="text-base font-semibold text-text">
              MotorShop POS
            </span>
          </div>

          <Card className="rounded-xl shadow-pop">
            <CardBody className="p-7">
              <div className="mb-6 flex items-center gap-3">
                <span className="hidden h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-fg shadow-primary lg:inline-flex">
                  <Icon name="wrench" size={18} />
                </span>
                <div>
                  <h1 className="text-2xl font-bold text-text">Sign in</h1>
                  <p className="text-sm text-text-muted">
                    Sales &amp; Inventory Management
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <Field label="Email" required>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-text-muted">
                      <Icon name="mail" size={18} />
                    </span>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@shop.local"
                      invalid={!!error}
                      className="pl-10"
                    />
                  </div>
                </Field>

                <Field label="Password" required>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-text-muted">
                      <Icon name="lock" size={18} />
                    </span>
                    <Input
                      id="password"
                      type={showPw ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      invalid={!!error}
                      className="pl-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-md"
                    >
                      <Icon name={showPw ? "eye-off" : "eye"} size={18} />
                    </button>
                  </div>
                </Field>

                {error && (
                  <Alert variant="destructive">
                    <Icon name="alert-triangle" size={16} />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  fullWidth
                  loading={loading}
                  className="shadow-primary"
                  rightIcon={<Icon name="arrow-right" size={18} />}
                >
                  Sign in
                </Button>
              </form>

              <p className="mt-5 text-center text-xs text-text-muted">
                Cashier? Ask your manager for an account.
              </p>
            </CardBody>
          </Card>

          <p className="mt-6 text-center text-xs text-text-muted">
            &copy; 2026 MotorShop POS &middot; Motor parts retail &amp; repair
          </p>
        </div>
      </div>
    </div>
  );
}
