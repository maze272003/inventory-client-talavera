"use client";

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { BrandLogo, Icon, Spinner, useToast } from "@/components/ui";

const TELEMETRY = [
  { label: "Real-time Inventory", state: "Live" },
  { label: "Service", state: "Ready" },
  { label: "Low Price", state: "Secured" },
] as const;

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

  return (
    <main className="azi-login azi-carbon-weave relative min-h-screen w-full overflow-hidden">
      {/* Ambient depth: corner glow + vignette over the weave. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 15% 0%, rgba(225,35,47,0.08), transparent 55%), radial-gradient(140% 120% at 50% 120%, rgba(0,0,0,0.65), transparent 60%)",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 sm:px-8 lg:grid lg:grid-cols-[1.1fr_minmax(380px,440px)] lg:gap-0 lg:px-10">
        {/* ── Left: showcase ── */}
        <section className="hidden flex-col justify-between py-12 pr-12 lg:flex">
          <div className="flex items-center gap-2.5">
            <span className="azi-dot" />
            <span className="azi-label"> AZI Motor Shop</span>
          </div>

          <div>
            <div className="azi-bezel azi-rise mb-10 inline-flex p-2.5">
              <BrandLogo size={132} priority alt="" />
            </div>

            <div
              aria-hidden
              className="mb-5 h-[3px] w-12 rounded-full bg-[var(--azi-ignition)]"
              style={{ boxShadow: "0 0 12px 1px rgba(225,35,47,0.6)" }}
            />
            <h1 className="azi-display azi-chrome-text text-[clamp(3rem,5vw,4.5rem)] font-bold uppercase leading-[0.92] tracking-tight">
              AZI
              <br />
              MOTORSHOP
            </h1>
            <p className="azi-t-500 mt-5 max-w-md text-[0.95rem] leading-relaxed">
              Parts counter, service bay, and back-shelf inventory — one fast
              . Sign in to take the next customer.
            </p>
          </div>

          <dl className="max-w-md">
            {TELEMETRY.map((t) => (
              <div
                key={t.label}
                className="flex items-center justify-between gap-4 border-t border-[var(--azi-line-soft)] py-3"
              >
                <dt className="azi-label">{t.label}</dt>
                <dd className="azi-t-300 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em]">
                  <span className="azi-dot" />
                  {t.state}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── Right: console ── */}
        <section className="flex w-full min-w-0 flex-1 items-center justify-center py-8 lg:py-12">
          <div className="azi-console azi-rise azi-rise-1 w-full min-w-0 max-w-[420px] p-6 sm:p-8">
            {/* Mobile brand (left showcase is hidden < lg) */}
            <div className="mb-7 flex flex-col items-center text-center lg:hidden">
              <div className="azi-bezel mb-4 inline-flex p-2">
                <BrandLogo size={72} priority alt="" />
              </div>
              <span className="azi-display azi-chrome-text text-2xl font-bold uppercase tracking-wide">
                AZI Motor Shop
              </span>
              <span className="azi-label mt-2">Sign in</span>
            </div>

            <div className="mb-6 hidden lg:block">
              <h2 className="azi-display text-3xl font-bold uppercase tracking-wide azi-t-300">
                Sign in
              </h2>
              {/* <p className="azi-t-500 mt-1 text-sm">Staff access only.</p> */}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="email" className="azi-label">
                  Email
                </label>
                <div className="relative mt-2">
                  <span className="azi-t-700 pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Icon name="mail" size={18} />
                  </span>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@shop.local"
                    aria-invalid={!!error}
                    className="azi-input h-11 w-full pl-10 pr-3 text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="azi-label">
                  Password
                </label>
                <div className="relative mt-2">
                  <span className="azi-t-700 pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Icon name="lock" size={18} />
                  </span>
                  <input
                    id="password"
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={!!error}
                    className="azi-input h-11 w-full pl-10 pr-10 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                    className="azi-t-500 absolute inset-y-0 right-0 flex items-center pr-3 transition-colors hover:text-[var(--azi-steel-300)] focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  >
                    <Icon name={showPw ? "eye-off" : "eye"} size={18} />
                  </button>
                </div>
              </div>

              {error && (
                <div className="azi-error" role="alert">
                  <Icon name="alert-triangle" size={16} />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="azi-ignite azi-display flex h-12 w-full items-center justify-center gap-2 text-base font-semibold uppercase tracking-[0.12em]"
              >
                {loading ? (
                  <Spinner size={18} label="Signing in" />
                ) : (
                  <>
                    Sign in
                    <Icon name="arrow-right" size={18} />
                  </>
                )}
              </button>
            </form>

            <p className="azi-t-700 mt-6 text-center text-xs">
              Cashier? Ask your manager for an account.
            </p>
          </div>
        </section>
      </div>

      {/* Footer telemetry line */}
      <div className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-6 sm:px-8 lg:px-10">
        <p className="azi-t-700 text-center font-mono text-[11px] uppercase tracking-[0.18em] lg:text-left">
          © 2026 AZI Motor Shop · Motor parts retail &amp; repair · Secured
          register access
        </p>
      </div>
    </main>
  );
}
