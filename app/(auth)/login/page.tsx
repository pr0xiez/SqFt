"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { type FormEvent, useState } from "react";

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
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password.");
    } else {
      router.push("/");
      router.refresh();
    }
  }

  const labelClass =
    "font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]";
  const inputClass =
    "border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[6px] font-[var(--font-display)] text-[15px] text-[var(--ink)] focus:outline-none focus:border-[var(--ink-2)] transition-[border-color] duration-[150ms] w-full";

  return (
    <div className="w-full max-w-[380px]">
      {/* Eyebrow */}
      <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] mb-2">
        Welcome back
      </div>

      {/* Heading */}
      <h1 className="font-[var(--font-display)] text-[34px] font-[700] text-[var(--ink)] tracking-[-0.025em] leading-tight mb-1">
        Sign in to <span className="font-[400] text-[var(--ink-2)]">SqFt</span>
      </h1>

      {/* Sub */}
      <p className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] mb-8">
        Flooring estimates, jobs, and crews.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <p className="text-[var(--accent)] font-[var(--font-mono)] text-[11px] border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-3 py-2 rounded-[6px] animate-[slideDown_0.2s_ease-out]">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className={labelClass}>
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
              className={inputClass}
              style={{ paddingRight: "52px" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 font-[var(--font-mono)] text-[10px] uppercase tracking-[.04em] text-[var(--muted)] hover:text-[var(--ink)] transition-colors duration-[150ms] bg-transparent border-0 cursor-pointer px-1"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-2 w-full min-h-[42px] bg-[var(--ink)] text-[var(--bg)] font-[var(--font-display)] text-[15px] font-[500] rounded-[6px] cursor-pointer transition-opacity duration-[150ms] hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in →"}
        </button>
      </form>

      <hr className="border-[var(--line)] mt-6 mb-4" />

      <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] text-center">
        New to SqFt?{" "}
        <Link href="/signup" className="text-[var(--ink)] hover:underline">
          Request access
        </Link>
      </p>
    </div>
  );
}
