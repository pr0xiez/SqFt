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
      // Redirect to onboarding to set up org name
      router.push("/onboarding");
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Brand */}
      <div className="mb-8 text-center">
        <h1 className="font-[var(--font-display)] text-4xl font-black italic text-oak leading-none">
          Sq<em className="not-italic text-vermil">Ft</em>
        </h1>
        <p className="font-[var(--font-mono)] text-xs text-driftwood uppercase tracking-widest mt-1">
          Estimate Book
        </p>
      </div>

      {/* Card */}
      <div className="bg-cream border-[1.5px] border-oak shadow-[4px_4px_0_var(--manila)] p-8">
        <h2 className="font-[var(--font-display)] text-xl font-bold text-oak mb-6">
          Create account
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <p className="text-vermil font-[var(--font-mono)] text-xs border border-vermil/30 bg-vermil/5 px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-1">
            <label
              htmlFor="name"
              className="font-[var(--font-mono)] text-xs text-oak uppercase tracking-wider"
            >
              Your name
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-[1.5px] border-oak bg-linen px-3 py-2 font-[var(--font-mono)] text-sm text-oak focus:outline-none focus:border-vermil"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="email"
              className="font-[var(--font-mono)] text-xs text-oak uppercase tracking-wider"
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
              className="border-[1.5px] border-oak bg-linen px-3 py-2 font-[var(--font-mono)] text-sm text-oak focus:outline-none focus:border-vermil"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="password"
              className="font-[var(--font-mono)] text-xs text-oak uppercase tracking-wider"
            >
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
              className="border-[1.5px] border-oak bg-linen px-3 py-2 font-[var(--font-mono)] text-sm text-oak focus:outline-none focus:border-vermil"
            />
            <span className="font-[var(--font-mono)] text-[10px] text-driftwood">
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

        <p className="mt-4 font-[var(--font-mono)] text-xs text-driftwood text-center">
          Already have an account?{" "}
          <Link href="/login" className="text-vermil hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
