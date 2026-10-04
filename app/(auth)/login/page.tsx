"use client";

import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { type FormEvent, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import {
  ArrowRightIcon,
  EyeIcon,
  EyeSlashIcon,
  WarningCircleIcon,
} from "@/components/ui/icons";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setLoading(false);
      setError("Incorrect email or password.");
      return;
    }

    // Resolve the role via the session endpoint, then route home.
    const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
    const sessionData = (await sessionRes.json()) as {
      user?: { role?: string };
    } | null;
    const role = sessionData?.user?.role ?? "lead";
    setLoading(false);
    router.push(role === "crew" ? "/my-schedule" : "/");
    router.refresh();
  }

  return (
    <div className="w-full max-w-[400px]">
      <p className="text-[15px] font-[500] text-[var(--muted)] mb-3">
        Welcome back
      </p>
      <h1 className="type-display text-[clamp(2.2rem,1.8rem+1.6vw,3rem)] mb-3">
        Sign in to SqFt
      </h1>
      <p className="text-[16px] text-[var(--ink-2)] mb-9">
        Flooring site measures, jobs, and crews.
      </p>

      <form
        onSubmit={handleSubmit}
        autoComplete="on"
        noValidate
        className="flex flex-col gap-5"
      >
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 px-3.5 py-3 rounded-[var(--r)] bg-[var(--accent-wash)] text-[14px] font-[560] text-[var(--accent-ink)] animate-[slideDown_0.24s_var(--ease)_both]"
          >
            <WarningCircleIcon
              aria-hidden="true"
              className="size-[18px] shrink-0 mt-px"
            />
            {error}
          </div>
        )}

        <div>
          <label htmlFor="email" className="field-label">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourcompany.com"
            aria-invalid={error ? true : undefined}
            className="field h-12 text-[16px] bg-[var(--surface)]"
          />
        </div>

        <div>
          <label htmlFor="password" className="field-label">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              className="field h-12 text-[16px] pr-14 bg-[var(--surface)]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label="Show password"
              aria-pressed={showPassword}
              title={showPassword ? "Hide password" : "Show password"}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 size-9 rounded-[var(--r-in)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--hover)] transition-colors cursor-pointer"
            >
              {showPassword ? (
                <EyeSlashIcon aria-hidden="true" className="size-[18px]" />
              ) : (
                <EyeIcon aria-hidden="true" className="size-[18px]" />
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className={buttonClasses({
            variant: "primary",
            size: "lg",
            className: "group w-full mt-2 relative",
          })}
        >
          <span
            className={
              loading ? "invisible" : "inline-flex items-center gap-2.5"
            }
          >
            Sign in
            <ArrowRightIcon
              aria-hidden="true"
              className="transition-transform duration-300 ease-[var(--ease)] group-hover:translate-x-[3px]"
            />
          </span>
          {loading && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="size-[18px] border-2 border-[var(--on-accent)] border-t-transparent rounded-full animate-spin" />
              <span className="sr-only">Signing in</span>
            </span>
          )}
        </button>
      </form>
    </div>
  );
}
