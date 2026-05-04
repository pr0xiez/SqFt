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
    setLoading(false);

    if (result?.error) {
      setError("Incorrect email or password.");
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="w-full max-w-[380px]">
      <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.04em] mb-[10px]">
        Welcome back
      </div>

      <h1 className="text-[34px] font-[700] tracking-[-0.025em] leading-[1.05] mb-2">
        Sign in to <span className="font-[400] text-[var(--ink-2)]">SqFt</span>
      </h1>

      <p className="font-[var(--font-mono)] text-[12px] text-[var(--muted)] mb-8">
        Flooring estimates, jobs, and crews.
      </p>

      <form onSubmit={handleSubmit} autoComplete="on" noValidate>
        {error && (
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--accent)] mb-[14px] px-3 py-2 border border-[var(--accent)] border-l-[3px] rounded-[5px] bg-[rgba(192,52,26,0.04)] dark:bg-[rgba(255,106,68,0.06)] animate-[slideDown_0.2s_ease_both] tracking-[.02em]">
            {error}
          </div>
        )}

        <div className="mb-[18px]">
          <label
            htmlFor="email"
            className="block font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-2"
          >
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
            className="w-full text-[15px] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] px-[14px] py-[11px] rounded-[6px] transition-[border-color] duration-150 focus:outline-none focus:border-[var(--ink-2)] placeholder:text-[var(--muted)]"
          />
        </div>

        <div className="mb-[18px]">
          <label
            htmlFor="password"
            className="block font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mb-2"
          >
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
              placeholder="••••••••"
              className="w-full text-[15px] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] pl-[14px] pr-[54px] py-[11px] rounded-[6px] transition-[border-color] duration-150 focus:outline-none focus:border-[var(--ink-2)] placeholder:text-[var(--muted)]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 font-[var(--font-mono)] text-[10px] uppercase tracking-[.04em] text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors duration-150 bg-transparent border-0 cursor-pointer px-2 py-1.5 rounded-[4px]"
              aria-label="Show password"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full font-[var(--font-mono)] text-[12px] font-[500] tracking-[.04em] uppercase py-[13px] bg-[var(--ink)] text-[var(--bg)] border-none cursor-pointer rounded-[6px] transition-colors duration-150 hover:bg-[var(--ink-2)] active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed mt-[6px] relative"
        >
          {loading ? (
            <span className="invisible">Sign in →</span>
          ) : (
            <>
              Sign in{" "}
              <span className="ml-1.5 inline-block transition-transform duration-150 group-hover:translate-x-0.5">
                →
              </span>
            </>
          )}
          {loading && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="w-4 h-4 border-2 border-[var(--bg)] border-t-transparent rounded-full animate-spin" />
            </span>
          )}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-[var(--line)] text-center font-[var(--font-mono)] text-[11px] text-[var(--muted)] tracking-[.02em]">
        New to SqFt?{" "}
        <Link
          href="/signup"
          className="text-[var(--ink)] no-underline border-b border-[var(--line-2)] pb-px hover:border-[var(--ink)] transition-[border-color] duration-150"
        >
          Request access
        </Link>
      </div>
    </div>
  );
}
