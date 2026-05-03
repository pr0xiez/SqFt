"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/Button";

export default function OnboardingPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/org/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: companyName }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Could not save company name.");
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="font-[var(--font-display)] text-4xl font-black italic text-oak leading-none">
          Sq<em className="not-italic text-vermil">Ft</em>
        </h1>
        <p className="font-[var(--font-mono)] text-xs text-driftwood uppercase tracking-widest mt-1">
          Getting started
        </p>
      </div>

      <div className="bg-cream border-[1.5px] border-oak shadow-[4px_4px_0_var(--manila)] p-8">
        <h2 className="font-[var(--font-display)] text-xl font-bold text-oak mb-2">
          Name your company
        </h2>
        <p className="font-[var(--font-mono)] text-xs text-driftwood mb-6">
          This appears on estimates and your dashboard.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <p className="text-vermil font-[var(--font-mono)] text-xs border border-vermil/30 bg-vermil/5 px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-1">
            <label
              htmlFor="company"
              className="font-[var(--font-mono)] text-xs text-oak uppercase tracking-wider"
            >
              Company name
            </label>
            <input
              id="company"
              type="text"
              autoComplete="organization"
              required
              placeholder="e.g. Johnson Flooring Co."
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="border-[1.5px] border-oak bg-linen px-3 py-2 font-[var(--font-mono)] text-sm text-oak focus:outline-none focus:border-vermil"
            />
          </div>

          <Button
            type="submit"
            variant="sage"
            className="w-full justify-center mt-2"
            disabled={loading || !companyName.trim()}
          >
            {loading ? "Saving…" : "Let's go →"}
          </Button>
        </form>
      </div>
    </div>
  );
}
