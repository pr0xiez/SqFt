"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Signup failed. Please try again.");
    } else {
      router.push("/onboarding");
    }
  }

  const inputClass =
    "border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[6px] font-[var(--font-mono)] text-[13px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] transition-[border-color] duration-[150ms] w-full";
  const labelClass =
    "font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]";

  return (
    <div className="w-full max-w-sm">
      {/* Brand */}
      <div className="mb-8 text-center">
        <div className="font-[var(--font-display)] text-[40px] font-[800] text-[var(--ink)] leading-none tracking-[-0.025em]">
          <em className="not-italic text-[var(--accent)]">Sq</em>Ft
        </div>
        <p className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mt-2">
          Estimate Book
        </p>
      </div>

      {/* Card */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-8 shadow-[var(--shadow-md)]">
        <h2 className="font-[var(--font-display)] text-[22px] font-[600] text-[var(--ink)] tracking-[-0.025em] mb-6">
          Create account
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <p className="text-[var(--accent)] font-[var(--font-mono)] text-[11px] border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-3 py-2 rounded-[6px] animate-[slideDown_0.2s_ease-out]">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="name" className={labelClass}>
              Your name
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>

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
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            <span className="font-[var(--font-mono)] text-[10px] text-[var(--muted)]">
              Minimum 8 characters
            </span>
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full justify-center mt-2"
            disabled={loading}
          >
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="mt-5 font-[var(--font-mono)] text-[11px] text-[var(--muted)] text-center">
          Already have an account?{" "}
          <Link href="/login" className="text-[var(--accent)] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
