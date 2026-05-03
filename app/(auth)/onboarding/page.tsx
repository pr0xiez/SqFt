"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
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
      {/* Brand */}
      <div className="mb-8 text-center">
        <div className="font-[var(--font-display)] text-[40px] font-[800] text-[var(--ink)] leading-none tracking-[-0.025em]">
          <em className="not-italic text-[var(--accent)]">Sq</em>Ft
        </div>
        <p className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em] mt-2">
          Getting started
        </p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg p-8 shadow-[var(--shadow-md)]">
        <h2 className="font-[var(--font-display)] text-[22px] font-[600] text-[var(--ink)] tracking-[-0.025em] mb-1.5">
          Name your company
        </h2>
        <p className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] mb-6">
          This appears on estimates and your dashboard.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <p className="text-[var(--accent)] font-[var(--font-mono)] text-[11px] border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-3 py-2 rounded-[6px] animate-[slideDown_0.2s_ease-out]">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-1">
            <label
              htmlFor="company"
              className="font-[var(--font-mono)] text-[10px] text-[var(--muted)] uppercase tracking-[.06em]"
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
              className="border border-[var(--line)] bg-[var(--surface)] px-3 py-2 rounded-[6px] font-[var(--font-mono)] text-[13px] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] transition-[border-color] duration-[150ms] w-full"
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
